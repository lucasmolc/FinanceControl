using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Fechamento mensal (MEL-22): fechar, reabrir, resumo congelado e bloqueio das alterações do mês.</summary>
public sealed class ClosingTests : IClassFixture<FinanceApiFactory>
{
    private const string JulyClosed = "O mês 07/2026 está fechado. Reabra-o para alterar.";
    private readonly HttpClient _client;

    public ClosingTests(FinanceApiFactory factory)
    {
        factory.Time.FixedUtcNow = new DateTimeOffset(2026, 9, 18, 12, 0, 0, TimeSpan.Zero);
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Closing_stores_the_summary_flags_the_month_and_reopen_unflags_it()
    {
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-05-05", description = "Salário", kind = "income", amount_cents = 100000 });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-05-10", description = "Mercado", kind = "expense", amount_cents = 30000 });

        var closed = await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-05/close", new { notes = "  Tudo conferido  " });
        Assert.True(closed.GetProperty("ok").GetBoolean());
        Assert.Equal("2026-05", closed.GetProperty("month").GetString());
        var closedAt = closed.GetProperty("closed_at").GetString();
        Assert.StartsWith("2026-09-18T12:00:00", closedAt);

        var summary = await _client.GetJsonAsync("/api/summary?month=2026-05");
        Assert.True(summary.GetProperty("closed").GetBoolean());
        Assert.Equal(closedAt, summary.GetProperty("closed_at").GetString());
        var open = await _client.GetJsonAsync("/api/summary?month=2026-04");
        Assert.False(open.GetProperty("closed").GetBoolean());
        Assert.Equal(JsonValueKind.Null, open.GetProperty("closed_at").ValueKind);

        var closing = (await _client.GetJsonAsync("/api/months/closings")).EnumerateArray().Single(item => item.GetProperty("month").GetString() == "2026-05");
        Assert.Equal(closedAt, closing.GetProperty("closed_at").GetString());
        Assert.Equal("Tudo conferido", closing.GetProperty("notes").GetString());
        var stored = closing.GetProperty("summary");
        Assert.Equal("2026-05", stored.GetProperty("month").GetString());
        Assert.Equal(100000, stored.GetProperty("income_cents").GetInt64());
        Assert.Equal(30000, stored.GetProperty("expense_cents").GetInt64());
        Assert.True(stored.GetProperty("closed").GetBoolean());
        Assert.True(stored.TryGetProperty("categories", out _));

        Assert.Equal("Este mês já está fechado.", await (await _client.PostAsJsonAsync("/api/months/2026-05/close", new { })).AssertValidationAsync("month"));

        Assert.True((await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-05/reopen")).GetProperty("ok").GetBoolean());
        Assert.False((await _client.GetJsonAsync("/api/summary?month=2026-05")).GetProperty("closed").GetBoolean());
        Assert.DoesNotContain((await _client.GetJsonAsync("/api/months/closings")).EnumerateArray(), item => item.GetProperty("month").GetString() == "2026-05");
        await (await _client.PostAsync("/api/months/2026-05/reopen", null)).AssertNotFoundAsync();

        // Pode fechar de novo após reabrir; a lista vem do mais recente para o mais antigo.
        await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-05/close");
        await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-04/close");
        var months = (await _client.GetJsonAsync("/api/months/closings")).EnumerateArray().Select(item => item.GetProperty("month").GetString()).ToList();
        Assert.True(months.IndexOf("2026-05") < months.IndexOf("2026-04"));
        Assert.Equal(JsonValueKind.Null, (await _client.GetJsonAsync("/api/months/closings")).EnumerateArray().Single(item => item.GetProperty("month").GetString() == "2026-04").GetProperty("notes").ValueKind);
        await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-05/reopen");
        await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-04/reopen");
    }

    [Fact]
    public async Task Close_validates_the_month_and_notes()
    {
        Assert.Equal("Não é possível fechar um mês que ainda não começou.", await (await _client.PostAsync("/api/months/2026-10/close", null)).AssertValidationAsync("month"));
        Assert.Equal("Use uma competência válida no formato AAAA-MM.", await (await _client.PostAsync("/api/months/2026-13/close", null)).AssertValidationAsync("month"));
        Assert.Equal("Use uma competência válida no formato AAAA-MM.", await (await _client.PostAsync("/api/months/abc/reopen", null)).AssertValidationAsync("month"));
        Assert.Equal("Use no máximo 500 caracteres.", await (await _client.PostAsJsonAsync("/api/months/2026-03/close", new { notes = new string('x', 501) })).AssertValidationAsync("notes"));
        Assert.Equal("Valor inválido.", await (await _client.PostAsJsonAsync("/api/months/2026-03/close", new { notes = 5 })).AssertValidationAsync("notes"));
        Assert.Equal("O corpo da requisição não é um JSON válido.", await (await _client.PostRawAsync("/api/months/2026-03/close", "{")).AssertValidationAsync("body"));
        Assert.DoesNotContain((await _client.GetJsonAsync("/api/months/closings")).EnumerateArray(), item => item.GetProperty("month").GetString() == "2026-03");

        // O mês atual (local) pode ser fechado.
        await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-09/close");
        await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-09/reopen");
    }

    [Fact]
    public async Task A_closed_month_blocks_every_change_dated_in_it_until_reopened()
    {
        var account = await _client.CreateAccountAsync("Conta fechamento", 100000);
        var target = await _client.CreateAccountAsync("Destino fechamento");
        var goal = await _client.CreateAsync("/api/goals", new { name = "Meta fechamento", target_cents = 100000 });
        var investment = await _client.CreateAsync("/api/investments", new { name = "Invest fechamento" });
        var bill = await _client.CreateAsync("/api/bills", new { name = "Luz fechamento", amount_cents = 9000, due_day = 10, active_since = "2026-01-01" });
        var subscription = await _client.CreateAsync("/api/subscriptions", new { name = "Assinatura fechamento", amount_cents = 1000 });

        var july = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-07-10", description = "Julho", kind = "expense", amount_cents = 1000, account_id = account });
        var august = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-08-10", description = "Agosto", kind = "expense", amount_cents = 1000 });
        var removedJuly = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-07-11", description = "Removido", kind = "expense", amount_cents = 1000 });
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/transactions/{removedJuly}")).StatusCode);
        var goalEntry = await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = "2026-07-01", amount_cents = 5000 });
        var reversedGoalEntry = await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = "2026-07-02", amount_cents = 100 });
        await _client.DeleteAsync($"/api/goals/{goal}/entries/{reversedGoalEntry}");
        var investmentEntry = await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-07-01", kind = "deposit", amount_cents = 5000 });
        var reversedInvestmentEntry = await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-07-02", kind = "deposit", amount_cents = 100 });
        await _client.DeleteAsync($"/api/investments/{investment}/entries/{reversedInvestmentEntry}");
        var bankEntry = await _client.CreateAsync($"/api/bank-accounts/{account}/entries", new { date = "2026-07-01", kind = "transfer_out", amount_cents = 500, related_account_id = target });
        var reversedBankEntry = await _client.CreateAsync($"/api/bank-accounts/{account}/entries", new { date = "2026-07-02", kind = "deposit", amount_cents = 100 });
        await _client.DeleteAsync($"/api/bank-accounts/{account}/entries/{reversedBankEntry}");
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/subscriptions/{subscription}/charge", new { date = "2026-07-05" }, HttpStatusCode.Created);
        await _client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = bill, month = "2026-07", paid = true, date = "2026-07-10" });

        await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-07/close");
        var before = await _client.AccountBalanceAsync(account);

        var blocked = new (Func<Task<HttpResponseMessage>> Request, string Field)[]
        {
            (() => _client.PostAsJsonAsync("/api/transactions", new { payment_method = "pix", date = "2026-07-15", description = "Novo", kind = "expense", amount_cents = 10 }), "date"),
            (() => _client.PutAsJsonAsync($"/api/transactions/{july}", new { description = "Editado" }), "date"),
            (() => _client.PutAsJsonAsync($"/api/transactions/{august}", new { date = "2026-07-20" }), "date"),
            (() => _client.DeleteAsync($"/api/transactions/{july}"), "date"),
            (() => _client.PostAsync($"/api/transactions/{removedJuly}/restore", null), "date"),
            (() => _client.PostAsJsonAsync("/api/checklist", new { bill_id = bill, month = "2026-07", paid = false }), "month"),
            (() => _client.PostAsJsonAsync("/api/checklist", new { bill_id = bill, month = "2026-08", paid = true, date = "2026-07-31" }), "date"),
            (() => _client.PostAsJsonAsync($"/api/subscriptions/{subscription}/charge", new { date = "2026-07-20" }), "date"),
            (() => _client.DeleteAsync($"/api/subscriptions/{subscription}/charge?date=2026-07-05"), "date"),
            (() => _client.PostAsJsonAsync($"/api/goals/{goal}/entries", new { date = "2026-07-03", amount_cents = 10 }), "date"),
            (() => _client.DeleteAsync($"/api/goals/{goal}/entries/{goalEntry}"), "date"),
            (() => _client.PostAsync($"/api/goals/{goal}/entries/{reversedGoalEntry}/restore", null), "date"),
            (() => _client.PostAsJsonAsync($"/api/investments/{investment}/entries", new { date = "2026-07-03", kind = "yield", amount_cents = 10 }), "date"),
            (() => _client.DeleteAsync($"/api/investments/{investment}/entries/{investmentEntry}"), "date"),
            (() => _client.PostAsync($"/api/investments/{investment}/entries/{reversedInvestmentEntry}/restore", null), "date"),
            (() => _client.PostAsJsonAsync($"/api/bank-accounts/{account}/entries", new { date = "2026-07-03", kind = "deposit", amount_cents = 10 }), "date"),
            (() => _client.DeleteAsync($"/api/bank-accounts/{account}/entries/{bankEntry}"), "date"),
            (() => _client.PostAsync($"/api/bank-accounts/{account}/entries/{reversedBankEntry}/restore", null), "date"),
        };
        for (var index = 0; index < blocked.Length; index++)
        {
            var message = await (await blocked[index].Request()).AssertValidationAsync(blocked[index].Field);
            Assert.True(message == JulyClosed, $"operação {index}: {message}");
        }
        Assert.Equal(before, await _client.AccountBalanceAsync(account));
        Assert.Equal(5000, (await _client.RecordAsync("goals", goal)).GetProperty("current_cents").GetInt64());
        Assert.Equal("2026-08-10", (await _client.GetJsonAsync("/api/transactions?month=2026-08")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == august).GetProperty("date").GetString());
        Assert.True(Assert.Single((await _client.GetJsonAsync("/api/checklist?month=2026-07")).EnumerateArray(), item => item.GetProperty("id").GetInt64() == bill).GetProperty("paid").GetBoolean());

        // Operações fora do mês fechado continuam liberadas.
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{august}", new { description = "Agosto editado" });

        await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-07/reopen");
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{july}", new { description = "Editado" });
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/transactions/{july}")).StatusCode);
        Assert.Equal(before + 1000, await _client.AccountBalanceAsync(account));
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/goals/{goal}/entries/{reversedGoalEntry}/restore");
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/bank-accounts/{account}/entries/{bankEntry}")).StatusCode);
        await _client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = bill, month = "2026-07", paid = false });
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/subscriptions/{subscription}/charge?date=2026-07-05")).StatusCode);
    }
}
