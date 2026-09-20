using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;
using FinanceControl.Api.Tests.Support;
using FinanceControl.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Rodada de correções R1 (backend). Hoje = 18/09/2026 (UTC−3).</summary>
public sealed class R1FixTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 18, 12, 0, 0, TimeSpan.Zero);

    // ---------- R1-BILLS-1: a conta só existe a partir do mês em que foi cadastrada ----------

    [Fact]
    public async Task Bills_only_appear_from_the_month_they_became_active_including_the_closing_snapshot()
    {
        using var api = Api();
        var client = api.CreateClient();
        var september = await client.CreateAsync("/api/bills", new { name = "Luz nova", amount_cents = 10000, due_day = 10 });
        var august = await client.CreateAsync("/api/bills", new { name = "Água agosto", amount_cents = 5000, due_day = 25, active_since = "2026-08-20" });
        var legacy = await client.CreateAsync("/api/bills", new { name = "Aluguel antigo", amount_cents = 200000, due_day = 5, active_since = (string?)null });

        Assert.Equal("2026-09-18", (await client.RecordAsync("bills", september)).GetProperty("active_since").GetString());
        Assert.Equal("2026-08-20", (await client.RecordAsync("bills", august)).GetProperty("active_since").GetString());
        Assert.Equal(JsonValueKind.Null, (await client.RecordAsync("bills", legacy)).GetProperty("active_since").ValueKind);
        var stateBill = (await client.GetJsonAsync("/api/state")).GetProperty("bills").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == september);
        Assert.Equal("2026-09-18", stateBill.GetProperty("active_since").GetString());

        Assert.Equal([legacy, september, august], await ChecklistIdsAsync(client, "2026-09"));
        Assert.Equal([legacy, august], await ChecklistIdsAsync(client, "2026-08"));
        Assert.Equal([legacy], await ChecklistIdsAsync(client, "2026-07"));
        Assert.Equal("2026-09-18", (await client.GetJsonAsync("/api/checklist?month=2026-09")).EnumerateArray()
            .Single(item => item.GetProperty("id").GetInt64() == september).GetProperty("active_since").GetString());

        var augustBills = (await client.GetJsonAsync("/api/summary?month=2026-08")).GetProperty("bills");
        Assert.Equal(2, augustBills.GetProperty("total_count").GetInt32());
        Assert.Equal(205000, augustBills.GetProperty("total_cents").GetInt64());
        Assert.Equal(3, (await client.GetJsonAsync("/api/summary?month=2026-09")).GetProperty("bills").GetProperty("total_count").GetInt32());

        // Pagar num mês em que a conta ainda não existia → 400; desmarcar continua idempotente.
        var early = await client.PostAsJsonAsync("/api/checklist", new { bill_id = september, month = "2026-08", paid = true });
        Assert.Equal("Esta conta ainda não existia neste mês.", await early.AssertValidationAsync("month"));
        await client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = september, month = "2026-08", paid = false });
        await client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = august, month = "2026-08", paid = true, register_transaction = false });

        // O fechamento de agosto guarda só as contas que existiam em agosto.
        await client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-08/close");
        var closing = (await client.GetJsonAsync("/api/months/closings")).EnumerateArray().Single(item => item.GetProperty("month").GetString() == "2026-08");
        var frozen = closing.GetProperty("summary").GetProperty("bills");
        Assert.Equal(2, frozen.GetProperty("total_count").GetInt32());
        Assert.Equal(1, frozen.GetProperty("paid_count").GetInt32());

        // Editável: null tira a restrição; data inválida → 400.
        await client.SendJsonAsync(HttpMethod.Put, $"/api/bills/{september}", new { active_since = (string?)null });
        Assert.Equal([legacy, september], await ChecklistIdsAsync(client, "2026-07"));
        await client.SendJsonAsync(HttpMethod.Put, $"/api/bills/{september}", new { active_since = "2026-10-01" });
        Assert.DoesNotContain(september, await ChecklistIdsAsync(client, "2026-09"));
        var invalid = await client.PutAsJsonAsync($"/api/bills/{september}", new { active_since = "2026-13-01" });
        await invalid.AssertValidationAsync("active_since");
    }

    [Fact]
    public async Task Migration_009_adds_a_nullable_active_since_to_bills_and_keeps_existing_rows()
    {
        var directory = Path.Combine(Path.GetTempPath(), "finance-control-tests", Guid.NewGuid().ToString("N"));
        try
        {
            var factory = new SqliteConnectionFactory(new DatabaseOptions { Path = Path.Combine(directory, "finance.db") });
            await using (var legacy = factory.CreateOpenConnection())
            {
                // Banco no estado da 008 com uma conta: a migração 009 não pode alterar a linha.
                await new DatabaseMigrator(factory).MigrateAsync();
                await legacy.ExecuteAsync("DELETE FROM schema_migrations WHERE id='009_bill_active_since'");
                await legacy.ExecuteAsync("ALTER TABLE bills DROP COLUMN active_since");
                await legacy.ExecuteAsync("INSERT INTO bills(name,amount_cents,due_day) VALUES ('Antiga',1000,5)");
            }
            await new DatabaseMigrator(factory).MigrateAsync();
            await using var connection = factory.CreateOpenConnection();
            Assert.Equal(1L, await connection.ExecuteScalarAsync<long>("SELECT COUNT(*) FROM pragma_table_info('bills') WHERE name='active_since' AND type='TEXT' AND \"notnull\"=0 AND dflt_value IS NULL"));
            Assert.Equal(1L, await connection.ExecuteScalarAsync<long>("SELECT COUNT(*) FROM bills WHERE name='Antiga' AND amount_cents=1000 AND active_since IS NULL"));
            Assert.Equal("010_imports_and_installments", await connection.ExecuteScalarAsync<string>("SELECT MAX(id) FROM schema_migrations"));
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            try { Directory.Delete(directory, recursive: true); } catch (IOException) { }
        }
    }

    // ---------- R1-CARD-1 / R1-BILLS-2: faturas vencidas nunca somem ----------

    [Fact]
    public async Task Default_invoice_window_also_lists_older_unpaid_invoices()
    {
        using var api = Api();
        var client = api.CreateClient();
        var (card, _) = await SeedCardsAsync(client);

        var invoices = (await client.GetJsonAsync($"/api/cards/{card}/invoices")).EnumerateArray().ToList();
        Assert.Equal(["2026-06", "2026-08", "2026-09", "2026-10", "2026-11"], invoices.Select(item => item.GetProperty("month").GetString()));
        Assert.Equal([1000L, 3000L, 4000L, 5000L, 0L], invoices.Select(item => item.GetProperty("total_cents").GetInt64()));
        Assert.Equal(["vencida", "vencida", "vencida", "aberta", "aberta"], invoices.Select(item => item.GetProperty("status").GetString()));

        // Com intervalo explícito nada muda.
        var explicitRange = (await client.GetJsonAsync($"/api/cards/{card}/invoices?from=2026-09&to=2026-10")).EnumerateArray();
        Assert.Equal(["2026-09", "2026-10"], explicitRange.Select(item => item.GetProperty("month").GetString()));
    }

    [Fact]
    public async Task Card_invoices_to_pay_list_due_invoices_and_overdue_carry_over()
    {
        using var api = Api();
        var client = api.CreateClient();
        var (nubank, itau) = await SeedCardsAsync(client);

        var current = (await client.GetJsonAsync("/api/card-invoices")).EnumerateArray().ToList();
        Assert.Equal([(nubank, "2026-06"), (nubank, "2026-08"), (nubank, "2026-09"), (itau, "2026-09")],
            current.Select(item => (item.GetProperty("card_id").GetInt64(), item.GetProperty("month").GetString())));
        Assert.Equal(["2026-06-05", "2026-08-05", "2026-09-05", "2026-09-10"], current.Select(item => item.GetProperty("due_date").GetString()));
        Assert.All(current, item => Assert.Equal("vencida", item.GetProperty("status").GetString()));
        var first = current[0];
        Assert.Equal("Nubank R1", first.GetProperty("card_name").GetString());
        Assert.Equal("nubank", first.GetProperty("brand").GetString());
        Assert.Equal("#820ad1", first.GetProperty("color").GetString());
        Assert.Equal(1000, first.GetProperty("total_cents").GetInt64());
        Assert.Equal(1, first.GetProperty("items_count").GetInt64());
        Assert.Equal(JsonValueKind.Null, first.GetProperty("paid").ValueKind);
        Assert.Equal(current.Select(item => item.GetProperty("month").GetString()),
            (await client.GetJsonAsync("/api/card-invoices?month=2026-09")).EnumerateArray().Select(item => item.GetProperty("month").GetString()));

        // Mês passado: só as que vencem nele (pagas também aparecem).
        var august = (await client.GetJsonAsync("/api/card-invoices?month=2026-08")).EnumerateArray().ToList();
        Assert.Equal([(nubank, "2026-08")], august.Select(item => (item.GetProperty("card_id").GetInt64(), item.GetProperty("month").GetString())));
        var july = Assert.Single((await client.GetJsonAsync("/api/card-invoices?month=2026-07")).EnumerateArray());
        Assert.Equal("paga", july.GetProperty("status").GetString());
        Assert.Equal(2000, july.GetProperty("paid").GetProperty("amount_cents").GetInt64());

        // Mês futuro: a que vence nele (aberta) + todas as anteriores fechadas sem pagamento.
        var october = (await client.GetJsonAsync("/api/card-invoices?month=2026-10")).EnumerateArray().ToList();
        Assert.Equal([(nubank, "2026-06"), (nubank, "2026-08"), (nubank, "2026-09"), (itau, "2026-09"), (nubank, "2026-10")],
            october.Select(item => (item.GetProperty("card_id").GetInt64(), item.GetProperty("month").GetString())));
        Assert.Equal("aberta", october[^1].GetProperty("status").GetString());

        // Pagar tira a fatura da lista do mês atual.
        var account = await client.CreateAccountAsync("Conta faturas", 100000);
        await client.SendJsonAsync(HttpMethod.Post, $"/api/cards/{nubank}/invoices/2026-06/pay", new { account_id = account }, HttpStatusCode.Created);
        Assert.DoesNotContain("2026-06", (await client.GetJsonAsync("/api/card-invoices")).EnumerateArray().Select(item => item.GetProperty("month").GetString()));

        var invalid = await client.GetAsync("/api/card-invoices?month=2026-13");
        await invalid.AssertValidationAsync("month");
    }

    // ---------- Decisão 3: progresso do número da liberdade = patrimônio investido ----------

    [Fact]
    public async Task Freedom_goal_progress_is_the_invested_wealth()
    {
        using var api = Api();
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1000000 });
        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", new { fixed_pct = 70, fun_pct = 20, invest_pct = 10 });
        await client.CreateAsync("/api/investments", new { name = "Tesouro", invested_cents = 4000000, current_cents = 5000000 });
        await client.CreateAsync("/api/investments", new { name = "CDB", invested_cents = 1000000, current_cents = 1000000 });
        await client.CreateAsync("/api/investments", new { name = "Ações EUA", current_cents = 100000, currency = "USD" });
        var removed = await client.CreateAsync("/api/investments", new { name = "Removido", current_cents = 999 });
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/investments/{removed}")).StatusCode);

        var state = await client.GetJsonAsync("/api/state");
        var settings = state.GetProperty("settings");
        Assert.Equal(6000000, settings.GetProperty("freedom_progress_cents").GetInt64());
        var freedomId = settings.GetProperty("freedom_goal_id").GetInt64();
        var emergencyId = settings.GetProperty("emergency_goal_id").GetInt64();
        var goals = state.GetProperty("goals").EnumerateArray().ToList();
        Assert.Equal(6000000, goals.Single(goal => goal.GetProperty("id").GetInt64() == freedomId).GetProperty("current_cents").GetInt64());
        Assert.Equal(0, goals.Single(goal => goal.GetProperty("id").GetInt64() == emergencyId).GetProperty("current_cents").GetInt64());
        Assert.Equal(6000000, (await client.RecordAsync("goals", freedomId)).GetProperty("current_cents").GetInt64());
        Assert.Equal(0, (await client.RecordAsync("goals", emergencyId)).GetProperty("current_cents").GetInt64());

        var projection = await client.GetJsonAsync("/api/projections/base");
        Assert.Equal(6000000, projection.GetProperty("freedom_progress_cents").GetInt64());
        Assert.Equal(6000000, projection.GetProperty("starting").GetProperty("investments_cents").GetInt64());
        var projected = projection.GetProperty("goals").EnumerateArray().Single(goal => goal.GetProperty("id").GetInt64() == freedomId);
        Assert.Equal(6000000, projected.GetProperty("current_cents").GetInt64());
        Assert.Equal(6000000, projected.GetProperty("base_current_cents").GetInt64());

        // Aporte manual não muda o progresso exibido enquanto a meta estiver vinculada.
        await client.CreateAsync($"/api/goals/{freedomId}/entries", new { date = "2026-09-18", amount_cents = 12345 });
        Assert.Equal(6000000, (await client.RecordAsync("goals", freedomId)).GetProperty("current_cents").GetInt64());
    }

    [Fact]
    public async Task Freedom_progress_is_exposed_without_a_linked_goal()
    {
        using var api = Api();
        var client = api.CreateClient();
        await client.CreateAsync("/api/investments", new { name = "Poupança", current_cents = 250000 });
        var goal = await client.CreateAsync("/api/goals", new { name = "Viagem", target_cents = 100000, current_cents = 3000 });

        var state = await client.GetJsonAsync("/api/state");
        Assert.Equal(250000, state.GetProperty("settings").GetProperty("freedom_progress_cents").GetInt64());
        Assert.Equal("none", state.GetProperty("settings").GetProperty("freedom_goal_status").GetString());
        Assert.Equal(3000, (await client.RecordAsync("goals", goal)).GetProperty("current_cents").GetInt64());
    }

    private static async Task<(long Nubank, long Itau)> SeedCardsAsync(HttpClient client)
    {
        // Fechamento 25, vencimento 5: compra em 10/05 → fatura 2026-06; 10/06 → 2026-07; … 10/09 → 2026-10 (aberta).
        var nubank = await client.CreateAsync("/api/cards", new { name = "Nubank R1", closing_day = 25, due_day = 5, brand = "nubank", color = "#820ad1" });
        await client.CreateAsync("/api/transactions", new { date = "2026-04-10", description = "Estorno antigo", kind = "income", amount_cents = 500, card_id = nubank });
        await Purchase(client, nubank, "2026-05-10", 1000);
        await Purchase(client, nubank, "2026-06-10", 2000);
        await Purchase(client, nubank, "2026-07-10", 3000);
        await Purchase(client, nubank, "2026-08-10", 4000);
        await Purchase(client, nubank, "2026-09-10", 5000);
        var account = await client.CreateAccountAsync("Conta R1", 100000);
        await client.SendJsonAsync(HttpMethod.Post, $"/api/cards/{nubank}/invoices/2026-07/pay", new { account_id = account, date = "2026-07-05" }, HttpStatusCode.Created);
        // Fechamento 3, vencimento 10: compra em 01/09 → fatura 2026-09 (vence 10/09).
        var itau = await client.CreateAsync("/api/cards", new { name = "Itaú R1", closing_day = 3, due_day = 10 });
        await Purchase(client, itau, "2026-09-01", 31800);
        // Cartão removido não entra.
        var removed = await client.CreateAsync("/api/cards", new { name = "Removido R1", closing_day = 3, due_day = 10 });
        await Purchase(client, removed, "2026-09-01", 777);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/cards/{removed}")).StatusCode);
        return (nubank, itau);
    }

    private static Task<long> Purchase(HttpClient client, long card, string date, long amount) =>
        client.CreateAsync("/api/transactions", new { date, description = $"Compra {date}", kind = "expense", amount_cents = amount, card_id = card });

    private static async Task<List<long>> ChecklistIdsAsync(HttpClient client, string month) =>
        (await client.GetJsonAsync($"/api/checklist?month={month}")).EnumerateArray().Select(item => item.GetProperty("id").GetInt64()).ToList();

    private static FinanceApiFactory Api()
    {
        var api = new FinanceApiFactory();
        api.Time.FixedUtcNow = Now;
        return api;
    }
}
