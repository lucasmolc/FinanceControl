using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

public sealed class ChecklistTests : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client;

    public ChecklistTests(FinanceApiFactory factory)
    {
        // 01/10/2026 01:00 UTC = 30/09/2026 22:00 em UTC−3: o mês local ainda é setembro.
        factory.Time.FixedUtcNow = new DateTimeOffset(2026, 10, 1, 1, 0, 0, TimeSpan.Zero);
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Paying_a_bill_creates_one_linked_expense_and_unpaying_reverses_it()
    {
        var account = await _client.CreateAccountAsync("Corrente", 100000);
        var category = await _client.CreateAsync("/api/categories", new { name = "Moradia", kind = "expense" });
        var bill = await _client.CreateAsync("/api/bills", new { name = "Aluguel", amount_cents = 12000, due_day = 31, category_id = category, active_since = "2026-01-01" });

        var paid = await _client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = bill, month = "2026-02", paid = true, account_id = account });
        var transactionId = paid.GetProperty("transaction_id").GetInt64();
        Assert.True(paid.GetProperty("ok").GetBoolean());
        Assert.Equal(88000, await _client.AccountBalanceAsync(account));

        var transaction = Assert.Single((await _client.GetJsonAsync("/api/transactions?month=2026-02")).EnumerateArray());
        Assert.Equal(transactionId, transaction.GetProperty("id").GetInt64());
        Assert.Equal("2026-02-28", transaction.GetProperty("date").GetString());
        Assert.Equal("expense", transaction.GetProperty("kind").GetString());
        Assert.Equal("Aluguel", transaction.GetProperty("description").GetString());
        Assert.Equal(category, transaction.GetProperty("category_id").GetInt64());
        Assert.Equal("other", transaction.GetProperty("payment_method").GetString());
        Assert.Equal("Pagamento da conta Aluguel (2026-02)", transaction.GetProperty("notes").GetString());

        var item = (await _client.GetJsonAsync("/api/checklist?month=2026-02")).EnumerateArray().Single(entry => entry.GetProperty("id").GetInt64() == bill);
        Assert.True(item.GetProperty("paid").GetBoolean());
        Assert.Equal(transactionId, item.GetProperty("transaction_id").GetInt64());
        Assert.Equal("Moradia", item.GetProperty("category_name").GetString());

        var again = await _client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = bill, month = "2026-02", paid = true, account_id = account });
        Assert.Equal(transactionId, again.GetProperty("transaction_id").GetInt64());
        Assert.Single((await _client.GetJsonAsync("/api/transactions?month=2026-02")).EnumerateArray());
        Assert.Equal(88000, await _client.AccountBalanceAsync(account));

        var unpaid = await _client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = bill, month = "2026-02", paid = false });
        Assert.Equal(JsonValueKind.Null, unpaid.GetProperty("transaction_id").ValueKind);
        Assert.Empty((await _client.GetJsonAsync("/api/transactions?month=2026-02")).EnumerateArray());
        Assert.Equal(100000, await _client.AccountBalanceAsync(account));
        var reopened = (await _client.GetJsonAsync("/api/checklist?month=2026-02")).EnumerateArray().Single(entry => entry.GetProperty("id").GetInt64() == bill);
        Assert.False(reopened.GetProperty("paid").GetBoolean());
        Assert.Equal(JsonValueKind.Null, reopened.GetProperty("transaction_id").ValueKind);
        Assert.Equal(JsonValueKind.Null, reopened.GetProperty("paid_at").ValueKind);
    }

    [Fact]
    public async Task Payment_options_and_register_flag_are_respected()
    {
        var bill = await _client.CreateAsync("/api/bills", new { name = "Internet", amount_cents = 9900, due_day = 10, active_since = "2026-01-01" });

        var withoutTransaction = await _client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = bill, month = "2026-05", paid = true, register_transaction = false });
        Assert.Equal(JsonValueKind.Null, withoutTransaction.GetProperty("transaction_id").ValueKind);
        Assert.Empty((await _client.GetJsonAsync("/api/transactions?month=2026-05")).EnumerateArray());

        var custom = await _client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = bill, month = "2026-06", paid = true, date = "2026-06-03", amount_cents = 10500, payment_method = "pix" });
        var transaction = (await _client.GetJsonAsync("/api/transactions?month=2026-06")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == custom.GetProperty("transaction_id").GetInt64());
        Assert.Equal("2026-06-03", transaction.GetProperty("date").GetString());
        Assert.Equal(10500, transaction.GetProperty("amount_cents").GetInt64());
        Assert.Equal("pix", transaction.GetProperty("payment_method").GetString());
    }

    [Fact]
    public async Task Current_month_and_today_use_local_time()
    {
        var bill = await _client.CreateAsync("/api/bills", new { name = "Condomínio", amount_cents = 50000, due_day = 5 });
        var paid = await _client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = bill, month = "2026-09", paid = true });

        var current = (await _client.GetJsonAsync("/api/checklist")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == bill);
        Assert.True(current.GetProperty("paid").GetBoolean());

        var transaction = (await _client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == paid.GetProperty("transaction_id").GetInt64());
        Assert.Equal("2026-09-30", transaction.GetProperty("date").GetString());

        Assert.Equal("2026-09", (await _client.GetJsonAsync("/api/summary")).GetProperty("month").GetString());
    }

    [Fact]
    public async Task Unknown_bill_returns_not_found()
    {
        var response = await _client.PostAsync("/api/checklist", new StringContent("{\"bill_id\":987654,\"month\":\"2026-01\",\"paid\":true}", System.Text.Encoding.UTF8, "application/json"));
        await response.AssertNotFoundAsync();
    }
}
