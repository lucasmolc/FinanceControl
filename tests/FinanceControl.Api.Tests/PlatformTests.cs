using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Plataforma de dados: desfazer estorno (MEL-13), última movimentação e paginação (MEL-14),
/// sequências após restauração (MEL-15), conta removida (MEL-16) e contagem de vínculos (MEL-41).</summary>
public sealed class PlatformTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    // ---------- MEL-13: desfazer estorno ----------

    [Fact]
    public async Task Goal_reversal_can_be_undone_and_undo_is_rejected_when_the_goal_would_go_negative()
    {
        var goal = await _client.CreateAsync("/api/goals", new { name = "Desfazer", target_cents = 100000 });
        var contribution = await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = "2026-01-01", amount_cents = 5000 });
        var withdrawal = await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = "2026-01-02", kind = "withdrawal", amount_cents = 3000 });
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/goals/{goal}/entries/{withdrawal}")).StatusCode);
        await AssertGoal(goal, 5000);

        var restored = await _client.SendJsonAsync(HttpMethod.Post, $"/api/goals/{goal}/entries/{withdrawal}/restore");
        Assert.True(restored.GetProperty("ok").GetBoolean());
        await AssertGoal(goal, 2000);
        Assert.Equal([withdrawal, contribution], (await _client.GetJsonAsync($"/api/goals/{goal}/entries")).EnumerateArray().Select(item => item.GetProperty("id").GetInt64()));

        // Não estornado, de outra meta ou inexistente → 404.
        await (await _client.PostAsync($"/api/goals/{goal}/entries/{withdrawal}/restore", null)).AssertNotFoundAsync();
        var other = await _client.CreateAsync("/api/goals", new { name = "Outra", target_cents = 100 });
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/goals/{goal}/entries/{withdrawal}")).StatusCode);
        await (await _client.PostAsync($"/api/goals/{other}/entries/{withdrawal}/restore", null)).AssertNotFoundAsync();
        await (await _client.PostAsync($"/api/goals/{goal}/entries/987654/restore", null)).AssertNotFoundAsync();

        // Desfazer o estorno do resgate depois de gastar o saldo deixaria a meta negativa.
        await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = "2026-01-03", kind = "withdrawal", amount_cents = 4000 });
        await AssertGoal(goal, 1000);
        var negative = await _client.PostAsync($"/api/goals/{goal}/entries/{withdrawal}/restore", null);
        Assert.Equal("O resgate é maior que o valor guardado na meta.", await negative.AssertValidationAsync("amount_cents"));
        await AssertGoal(goal, 1000);
    }

    [Fact]
    public async Task Investment_reversal_undo_reapplies_the_stored_delta_and_rejects_negative_positions()
    {
        var investment = await _client.CreateAsync("/api/investments", new { name = "Desfazer inv" });
        var deposit = await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-01", kind = "deposit", amount_cents = 10000 });
        await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-02", kind = "yield", amount_cents = 500 });
        var withdrawal = await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-03", kind = "withdrawal", amount_cents = 2000 });
        await AssertInvestment(investment, 8095, 8500);

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/investments/{investment}/entries/{withdrawal}")).StatusCode);
        await AssertInvestment(investment, 10000, 10500);
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/investments/{investment}/entries/{withdrawal}/restore");
        await AssertInvestment(investment, 8095, 8500);

        // Sem o aporte, desfazer o estorno do resgate (−1905 aplicado, −2000 atual) deixaria a posição negativa.
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/investments/{investment}/entries/{withdrawal}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/investments/{investment}/entries/{deposit}")).StatusCode);
        await AssertInvestment(investment, 0, 500);
        var negative = await _client.PostAsync($"/api/investments/{investment}/entries/{withdrawal}/restore", null);
        Assert.Equal("A movimentação deixaria o investimento com saldo negativo.", await negative.AssertValidationAsync("amount_cents"));
        await AssertInvestment(investment, 0, 500);
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/investments/{investment}/entries/{deposit}/restore");
        await AssertInvestment(investment, 10000, 10500);
        await (await _client.PostAsync($"/api/investments/{investment}/entries/{deposit}/restore", null)).AssertNotFoundAsync();
    }

    [Fact]
    public async Task Undoing_a_reversed_transfer_restores_both_sides()
    {
        var a = await _client.CreateAccountAsync("Origem desfazer", 10000);
        var b = await _client.CreateAccountAsync("Destino desfazer");
        var transfer = await _client.CreateAsync($"/api/bank-accounts/{a}/entries", new { date = "2026-02-01", kind = "transfer_out", amount_cents = 2500, related_account_id = b });
        var incoming = Assert.Single((await _client.GetJsonAsync($"/api/bank-accounts/{b}/entries")).EnumerateArray()).GetProperty("id").GetInt64();

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/bank-accounts/{a}/entries/{transfer}")).StatusCode);
        Assert.Equal(10000, await _client.AccountBalanceAsync(a));
        Assert.Equal(0, await _client.AccountBalanceAsync(b));

        // Desfazer pelo lado de destino restaura também a saída.
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/bank-accounts/{b}/entries/{incoming}/restore");
        Assert.Equal(7500, await _client.AccountBalanceAsync(a));
        Assert.Equal(2500, await _client.AccountBalanceAsync(b));
        Assert.Equal([transfer], (await _client.GetJsonAsync($"/api/bank-accounts/{a}/entries")).EnumerateArray().Select(item => item.GetProperty("id").GetInt64()));
        Assert.Equal([incoming], (await _client.GetJsonAsync($"/api/bank-accounts/{b}/entries")).EnumerateArray().Select(item => item.GetProperty("id").GetInt64()));
        await (await _client.PostAsync($"/api/bank-accounts/{a}/entries/{transfer}/restore", null)).AssertNotFoundAsync();
        await (await _client.PostAsync($"/api/bank-accounts/{a}/entries/{incoming}/restore", null)).AssertNotFoundAsync();

        var withdrawal = await _client.CreateAsync($"/api/bank-accounts/{a}/entries", new { date = "2026-02-02", kind = "withdrawal", amount_cents = 500 });
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/bank-accounts/{a}/entries/{withdrawal}")).StatusCode);
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/bank-accounts/{a}/entries/{withdrawal}/restore");
        Assert.Equal(7000, await _client.AccountBalanceAsync(a));
    }

    // ---------- MEL-14: última movimentação e paginação ----------

    [Fact]
    public async Task State_accounts_report_the_latest_non_reversed_movement_date()
    {
        var account = await _client.CreateAccountAsync("Última movimentação");
        Assert.Equal(JsonValueKind.Null, (await StateAccount(account)).GetProperty("last_movement_date").ValueKind);

        var entry = await _client.CreateAsync($"/api/bank-accounts/{account}/entries", new { date = "2026-03-10", kind = "deposit", amount_cents = 100 });
        var transaction = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-04-02", description = "Vinculado", kind = "expense", amount_cents = 50, account_id = account });
        Assert.Equal("2026-04-02", (await StateAccount(account)).GetProperty("last_movement_date").GetString());

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/transactions/{transaction}")).StatusCode);
        Assert.Equal("2026-03-10", (await StateAccount(account)).GetProperty("last_movement_date").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/bank-accounts/{account}/entries/{entry}")).StatusCode);
        Assert.Equal(JsonValueKind.Null, (await StateAccount(account)).GetProperty("last_movement_date").ValueKind);
    }

    [Fact]
    public async Task Entry_listings_accept_limit_and_offset_and_report_the_total()
    {
        var goal = await _client.CreateAsync("/api/goals", new { name = "Paginada", target_cents = 100000 });
        var ids = new List<long>();
        for (var day = 1; day <= 5; day++) ids.Add(await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = $"2026-05-0{day}", amount_cents = 100 }));
        ids.Reverse();

        var (all, allTotal) = await GetPageAsync($"/api/goals/{goal}/entries");
        Assert.Equal(ids, all);
        Assert.Equal(5, allTotal);
        var (first, total) = await GetPageAsync($"/api/goals/{goal}/entries?limit=2");
        Assert.Equal(ids.Take(2), first);
        Assert.Equal(5, total);
        var (second, _) = await GetPageAsync($"/api/goals/{goal}/entries?limit=2&offset=2");
        Assert.Equal(ids.Skip(2).Take(2), second);
        var (tail, _) = await GetPageAsync($"/api/goals/{goal}/entries?limit=2&offset=4");
        Assert.Equal(ids.Skip(4), tail);
        var (beyond, beyondTotal) = await GetPageAsync($"/api/goals/{goal}/entries?limit=2&offset=10");
        Assert.Empty(beyond);
        Assert.Equal(5, beyondTotal);

        var investment = await _client.CreateAsync("/api/investments", new { name = "Paginado" });
        for (var day = 1; day <= 3; day++) await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = $"2026-05-0{day}", kind = "deposit", amount_cents = 100 });
        var (investments, investmentTotal) = await GetPageAsync($"/api/investments/{investment}/entries?limit=1&offset=1");
        Assert.Single(investments);
        Assert.Equal(3, investmentTotal);

        var account = await _client.CreateAccountAsync("Extrato paginado");
        await _client.CreateAsync($"/api/bank-accounts/{account}/entries", new { date = "2026-05-01", kind = "deposit", amount_cents = 100 });
        await _client.CreateAsync($"/api/bank-accounts/{account}/entries", new { date = "2026-05-03", kind = "deposit", amount_cents = 100 });
        var linked = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-05-02", description = "No extrato", kind = "expense", amount_cents = 10, account_id = account });
        var (statement, statementTotal) = await GetPageAsync($"/api/bank-accounts/{account}/entries?limit=1&offset=1");
        Assert.Equal([linked], statement);
        Assert.Equal(3, statementTotal);
        Assert.Equal(3, (await GetPageAsync($"/api/bank-accounts/{account}/entries")).Total);
    }

    [Theory]
    [InlineData("limit=0", "limit", "Informe um valor entre 1 e 200.")]
    [InlineData("limit=201", "limit", "Informe um valor entre 1 e 200.")]
    [InlineData("limit=abc", "limit", "Valor inválido.")]
    [InlineData("offset=-1", "offset", "O valor não pode ser negativo.")]
    [InlineData("limit=10&offset=x", "offset", "Valor inválido.")]
    public async Task Invalid_paging_parameters_are_rejected(string query, string field, string message)
    {
        var goal = await _client.CreateAsync("/api/goals", new { name = "Paginação inválida", target_cents = 100 });
        var investment = await _client.CreateAsync("/api/investments", new { name = "Paginação inválida" });
        var account = await _client.CreateAccountAsync("Paginação inválida");
        Assert.Equal(message, await (await _client.GetAsync($"/api/goals/{goal}/entries?{query}")).AssertValidationAsync(field));
        Assert.Equal(message, await (await _client.GetAsync($"/api/investments/{investment}/entries?{query}")).AssertValidationAsync(field));
        Assert.Equal(message, await (await _client.GetAsync($"/api/bank-accounts/{account}/entries?{query}")).AssertValidationAsync(field));
    }

    // ---------- MEL-15: sequências após restauração ----------

    [Fact]
    public async Task Restore_resets_autoincrement_sequences_to_the_restored_max_id()
    {
        var kept = await _client.CreateAsync("/api/bills", new { name = "Mantida", amount_cents = 100 });
        var backup = await DownloadBackupAsync();
        var discarded = await _client.CreateAsync("/api/bills", new { name = "Descartada 1", amount_cents = 100 });
        await _client.CreateAsync("/api/bills", new { name = "Descartada 2", amount_cents = 100 });
        Assert.True(discarded > kept);

        // O backup também esvazia metas (tabela ausente → vazia): a sequência delas volta a começar do 1.
        await _client.CreateAsync("/api/goals", new { name = "Some", target_cents = 100 });
        backup["data"]!.AsObject().Remove("goals");
        backup["data"]!.AsObject().Remove("goal_entries");
        await _client.SendJsonAsync(HttpMethod.Post, "/api/backup/restore", backup);

        var maxBill = (await DownloadBackupAsync())["data"]!["bills"]!.AsArray().Max(item => item!["id"]!.GetValue<long>());
        Assert.True(maxBill < discarded);
        Assert.Equal(maxBill + 1, await _client.CreateAsync("/api/bills", new { name = "Depois", amount_cents = 100 }));
        Assert.Equal(1, await _client.CreateAsync("/api/goals", new { name = "Primeira", target_cents = 100 }));
        Assert.Contains("card_invoice_payments", (await DownloadBackupAsync())["data"]!.AsObject().Select(item => item.Key));
    }

    // ---------- MEL-16: conta vinculada removida ----------

    [Fact]
    public async Task Transactions_linked_to_a_removed_account_cannot_be_updated_or_restored_but_can_be_deleted()
    {
        const string removedMessage = "A conta vinculada foi removida. Restaure a conta ou escolha outra.";
        var account = await _client.CreateAccountAsync("Será removida", 10000);
        var other = await _client.CreateAccountAsync("Outra conta", 0);
        var kept = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-06-01", description = "Fica", kind = "expense", amount_cents = 1000, account_id = account });
        var removed = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-06-02", description = "Some", kind = "expense", amount_cents = 500, account_id = account });
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/transactions/{removed}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/bank-accounts/{account}")).StatusCode);

        var update = await _client.PutAsJsonAsync($"/api/transactions/{kept}", new { description = "Editada" });
        Assert.Equal(removedMessage, await update.AssertValidationAsync("account_id"));
        Assert.Equal(removedMessage, await (await _client.PostAsync($"/api/transactions/{removed}/restore", null)).AssertValidationAsync("account_id"));

        // Escolher outra conta (ou nenhuma) libera a edição e move o efeito para a nova conta.
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{kept}", new { description = "Editada", account_id = other });
        Assert.Equal(-1000, await _client.AccountBalanceAsync(other));
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{kept}", new { account_id = (long?)null });
        Assert.Equal(0, await _client.AccountBalanceAsync(other));

        // Excluir continua permitido (desfaz o efeito na conta removida).
        var stillLinked = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-06-03", description = "Vinculada", kind = "income", amount_cents = 700, account_id = other });
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/bank-accounts/{other}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/transactions/{stillLinked}")).StatusCode);
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/bank-accounts/{other}/restore");
        Assert.Equal(0, await _client.AccountBalanceAsync(other));
    }

    // ---------- MEL-41: contagem de vínculos ----------

    [Fact]
    public async Task Links_endpoints_count_live_records()
    {
        var category = await _client.CreateAsync("/api/categories", new { name = "Vínculos", kind = "expense" });
        var card = await _client.CreateAsync("/api/cards", new { name = "Cartão vínculos" });
        await _client.CreateAsync("/api/transactions", new { date = "2026-06-01", description = "A", kind = "expense", amount_cents = 10, category_id = category, card_id = card });
        var removed = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-06-02", description = "B", kind = "expense", amount_cents = 10, category_id = category });
        await _client.DeleteAsync($"/api/transactions/{removed}");
        await _client.CreateAsync("/api/bills", new { name = "Conta", amount_cents = 10, category_id = category });
        var inactiveBill = await _client.CreateAsync("/api/bills", new { name = "Conta removida", amount_cents = 10, category_id = category });
        await _client.DeleteAsync($"/api/bills/{inactiveBill}");
        await _client.CreateAsync("/api/subscriptions", new { name = "Assinatura", amount_cents = 10, category_id = category, card_id = card });
        var inactiveSubscription = await _client.CreateAsync("/api/subscriptions", new { name = "Assinatura removida", amount_cents = 10, card_id = card });
        await _client.DeleteAsync($"/api/subscriptions/{inactiveSubscription}");

        var categoryLinks = await _client.GetJsonAsync($"/api/categories/{category}/links");
        Assert.Equal(1, categoryLinks.GetProperty("transactions").GetInt64());
        Assert.Equal(1, categoryLinks.GetProperty("bills").GetInt64());
        Assert.Equal(1, categoryLinks.GetProperty("subscriptions").GetInt64());
        var cardLinks = await _client.GetJsonAsync($"/api/cards/{card}/links");
        Assert.Equal(1, cardLinks.GetProperty("transactions").GetInt64());
        Assert.Equal(1, cardLinks.GetProperty("subscriptions").GetInt64());
        Assert.False(cardLinks.TryGetProperty("bills", out _));

        await (await _client.GetAsync("/api/categories/987654/links")).AssertNotFoundAsync();
        await (await _client.GetAsync("/api/cards/987654/links")).AssertNotFoundAsync();
    }

    private async Task<(List<long> Ids, long Total)> GetPageAsync(string url)
    {
        var response = await _client.GetAsync(url);
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, content);
        var total = long.Parse(Assert.Single(response.Headers.GetValues("X-Total-Count")));
        return (JsonDocument.Parse(content).RootElement.EnumerateArray().Select(item => item.GetProperty("id").GetInt64()).ToList(), total);
    }

    private async Task<JsonElement> StateAccount(long id) =>
        (await _client.GetJsonAsync("/api/state")).GetProperty("bank_accounts").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == id);

    private async Task<JsonObject> DownloadBackupAsync()
    {
        var response = await _client.GetAsync("/api/backup");
        response.EnsureSuccessStatusCode();
        return JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
    }

    private async Task AssertGoal(long id, long current) =>
        Assert.Equal(current, (await _client.RecordAsync("goals", id)).GetProperty("current_cents").GetInt64());

    private async Task AssertInvestment(long id, long invested, long current)
    {
        var investment = await _client.RecordAsync("investments", id);
        Assert.Equal(invested, investment.GetProperty("invested_cents").GetInt64());
        Assert.Equal(current, investment.GetProperty("current_cents").GetInt64());
    }
}
