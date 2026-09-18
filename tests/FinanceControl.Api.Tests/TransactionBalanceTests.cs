using System.Net;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

public sealed class TransactionBalanceTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Linked_transaction_keeps_account_balances_consistent_through_its_lifecycle()
    {
        var a = await _client.CreateAccountAsync("Conta A", 100000);
        var b = await _client.CreateAccountAsync("Conta B", 50000);

        var id = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-03-10", description = "Mercado", kind = "expense", amount_cents = 2500, account_id = a });
        Assert.Equal(97500, await _client.AccountBalanceAsync(a));

        await _client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{id}", new { amount_cents = 3000 });
        Assert.Equal(97000, await _client.AccountBalanceAsync(a));

        await _client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{id}", new { kind = "income" });
        Assert.Equal(103000, await _client.AccountBalanceAsync(a));

        await _client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{id}", new { account_id = b, kind = "investment", amount_cents = 1000 });
        Assert.Equal(100000, await _client.AccountBalanceAsync(a));
        Assert.Equal(49000, await _client.AccountBalanceAsync(b));

        await _client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{id}", new { description = "Só texto" });
        Assert.Equal(49000, await _client.AccountBalanceAsync(b));

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/transactions/{id}")).StatusCode);
        Assert.Equal(50000, await _client.AccountBalanceAsync(b));

        await _client.SendJsonAsync(HttpMethod.Post, $"/api/transactions/{id}/restore");
        Assert.Equal(49000, await _client.AccountBalanceAsync(b));

        await _client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{id}", new { account_id = (long?)null });
        Assert.Equal(50000, await _client.AccountBalanceAsync(b));
        Assert.Equal(100000, await _client.AccountBalanceAsync(a));
    }

    [Fact]
    public async Task Transactions_expose_account_and_category_names()
    {
        var account = await _client.CreateAccountAsync("Nubank");
        var category = await _client.CreateAsync("/api/categories", new { name = "Lazer", kind = "expense" });
        var id = await _client.CreateAsync("/api/transactions", new { date = "2026-04-02", description = "Cinema", kind = "expense", amount_cents = 4000, account_id = account, category_id = category, payment_method = "pix" });

        var transaction = (await _client.GetJsonAsync("/api/transactions?month=2026-04")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == id);
        Assert.Equal("Nubank", transaction.GetProperty("account_name").GetString());
        Assert.Equal(account, transaction.GetProperty("account_id").GetInt64());
        Assert.Equal("Lazer", transaction.GetProperty("category_name").GetString());
        Assert.False(transaction.TryGetProperty("deleted_at", out _));

        var fromState = (await _client.GetJsonAsync("/api/state")).GetProperty("transactions").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == id);
        Assert.Equal("Nubank", fromState.GetProperty("account_name").GetString());

        var plain = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-04-03", description = "Sem conta", kind = "expense", amount_cents = 100 });
        var unlinked = (await _client.GetJsonAsync("/api/transactions?month=2026-04")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == plain);
        Assert.Equal(JsonValueKind.Null, unlinked.GetProperty("account_id").ValueKind);
        Assert.Equal("pix", unlinked.GetProperty("payment_method").GetString());
    }
}

/// <summary>Classe própria: cria mais de 250 lançamentos, o que empurraria os demais para fora do limite do estado.</summary>
public sealed class TransactionMonthFilterTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Month_filter_returns_every_transaction_of_the_month_without_the_250_cap()
    {
        for (var index = 0; index < 260; index++)
            await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = $"2032-01-{index % 28 + 1:00}", description = $"Item {index}", kind = "expense", amount_cents = 100 + index });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2032-02-01", description = "Outro mês", kind = "expense", amount_cents = 100 });
        var removed = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2032-01-15", description = "Removido", kind = "expense", amount_cents = 100 });
        await _client.DeleteAsync($"/api/transactions/{removed}");

        var month = (await _client.GetJsonAsync("/api/transactions?month=2032-01")).EnumerateArray().ToList();
        Assert.Equal(260, month.Count);
        Assert.All(month, item => Assert.StartsWith("2032-01-", item.GetProperty("date").GetString()));
        var ordered = month.OrderByDescending(item => item.GetProperty("date").GetString(), StringComparer.Ordinal).ThenByDescending(item => item.GetProperty("id").GetInt64()).Select(item => item.GetProperty("id").GetInt64());
        Assert.Equal(ordered, month.Select(item => item.GetProperty("id").GetInt64()));

        Assert.Equal(250, (await _client.GetJsonAsync("/api/transactions")).GetArrayLength());
        Assert.Equal(250, (await _client.GetJsonAsync("/api/state")).GetProperty("transactions").GetArrayLength());
    }
}
