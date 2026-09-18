using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using FinanceControl.Domain.Rules;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Débito automático (MEL-29). Hoje = 18/09/2026 09:00 (UTC−3).</summary>
public sealed class AutoDebitTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 18, 12, 0, 0, TimeSpan.Zero);

    // ---------- Regras de datas ----------

    [Fact]
    public void Monthly_charges_clamp_the_billing_day_to_each_month()
    {
        var dates = AutoDebitRules.SubscriptionChargeDates("monthly", 31, null, new DateOnly(2026, 1, 15), new DateOnly(2026, 3, 31));
        Assert.Equal([new DateOnly(2026, 1, 31), new DateOnly(2026, 2, 28), new DateOnly(2026, 3, 31)], dates);
        Assert.Empty(AutoDebitRules.SubscriptionChargeDates("monthly", 10, null, new DateOnly(2026, 3, 11), new DateOnly(2026, 4, 9)));
    }

    [Fact]
    public void Yearly_charges_use_the_month_and_day_of_the_next_billing_date()
    {
        var dates = AutoDebitRules.SubscriptionChargeDates("yearly", 1, new DateOnly(2024, 2, 29), new DateOnly(2025, 1, 1), new DateOnly(2026, 12, 31));
        Assert.Equal([new DateOnly(2025, 2, 28), new DateOnly(2026, 2, 28)], dates);
        Assert.Empty(AutoDebitRules.SubscriptionChargeDates("yearly", 1, null, new DateOnly(2025, 1, 1), new DateOnly(2026, 12, 31)));
    }

    [Theory]
    [InlineData("2026-09-01")]
    [InlineData("2026-10-06")]
    [InlineData("2025-12-30")]
    public void Weekly_charges_repeat_every_seven_days_anchored_on_the_next_billing_date(string anchor)
    {
        var dates = AutoDebitRules.SubscriptionChargeDates("weekly", 1, DateOnly.Parse(anchor, System.Globalization.CultureInfo.InvariantCulture), new DateOnly(2026, 9, 10), new DateOnly(2026, 9, 30));
        Assert.Equal([new DateOnly(2026, 9, 15), new DateOnly(2026, 9, 22), new DateOnly(2026, 9, 29)], dates);
        Assert.Empty(AutoDebitRules.SubscriptionChargeDates("weekly", 1, null, new DateOnly(2026, 9, 10), new DateOnly(2026, 9, 30)));
    }

    [Theory]
    [InlineData("monthly", 3990L, 3990L)]
    [InlineData("yearly", 12000L, 1000L)]
    [InlineData("yearly", 1001L, 83L)]
    [InlineData("weekly", 1000L, 4333L)]
    public void Monthly_equivalent_of_a_subscription(string frequency, long amount, long expected) =>
        Assert.Equal(expected, AutoDebitRules.MonthlyEquivalent(frequency, amount));

    // ---------- Cadastro ----------

    [Fact]
    public async Task Auto_debit_requires_an_account_and_tracks_since_when_enabled()
    {
        using var api = Api();
        var client = api.CreateClient();
        var account = await client.CreateAccountAsync("Corrente");

        Assert.Equal("Escolha a conta que será debitada.", await (await client.PostAsJsonAsync("/api/bills", new { name = "Luz", amount_cents = 100, auto_debit = true })).AssertValidationAsync("account_id"));
        Assert.Equal("Escolha a conta que será debitada ou um cartão.", await (await client.PostAsJsonAsync("/api/subscriptions", new { name = "Stream", amount_cents = 100, auto_debit = true })).AssertValidationAsync("account_id"));

        var bill = await client.CreateAsync("/api/bills", new { name = "Luz", amount_cents = 100, due_day = 10, auto_debit = true, account_id = account });
        var created = await client.RecordAsync("bills", bill);
        Assert.Equal(1, created.GetProperty("auto_debit").GetInt64());
        Assert.Equal("2026-09-18", created.GetProperty("auto_debit_since").GetString());
        Assert.Equal("Corrente", created.GetProperty("account_name").GetString());
        Assert.Equal("BRL", created.GetProperty("currency").GetString());

        // Tirar a conta com o débito ligado é inválido; desligar limpa a data de ativação.
        Assert.Equal("Escolha a conta que será debitada.", await (await client.PutAsJsonAsync($"/api/bills/{bill}", new { account_id = (long?)null })).AssertValidationAsync("account_id"));
        await client.SendJsonAsync(HttpMethod.Put, $"/api/bills/{bill}", new { auto_debit = false });
        Assert.Equal(JsonValueKind.Null, (await client.RecordAsync("bills", bill)).GetProperty("auto_debit_since").ValueKind);

        // Religar (em outra data) grava a nova ativação; reenviar true não muda a data.
        api.Time.FixedUtcNow = Now.AddDays(2);
        await client.SendJsonAsync(HttpMethod.Put, $"/api/bills/{bill}", new { auto_debit = true });
        api.Time.FixedUtcNow = Now.AddDays(3);
        await client.SendJsonAsync(HttpMethod.Put, $"/api/bills/{bill}", new { auto_debit = true, amount_cents = 200 });
        Assert.Equal("2026-09-20", (await client.RecordAsync("bills", bill)).GetProperty("auto_debit_since").GetString());

        var card = await client.CreateAsync("/api/cards", new { name = "Cartão" });
        var subscription = await client.CreateAsync("/api/subscriptions", new { name = "Stream", amount_cents = 100, auto_debit = true, card_id = card });
        Assert.Equal(1, (await client.RecordAsync("subscriptions", subscription)).GetProperty("auto_debit").GetInt64());

        var usd = await client.CreateAsync("/api/bank-accounts", new { name = "Dólar", institution = "Wise", currency = "USD" });
        Assert.Equal("A conta escolhida usa outra moeda.", await (await client.PostAsJsonAsync("/api/bills", new { name = "X", amount_cents = 100, currency = "BRL", account_id = usd })).AssertValidationAsync("account_id"));
        var inherited = await client.CreateAsync("/api/bills", new { name = "Hospedagem", amount_cents = 500, account_id = usd });
        Assert.Equal("USD", (await client.RecordAsync("bills", inherited)).GetProperty("currency").GetString());
    }

    // ---------- Contas a pagar ----------

    [Fact]
    public async Task Due_bills_are_paid_once_on_the_due_date_and_unpaying_skips_the_month()
    {
        using var api = Api();
        var client = api.CreateClient();
        var account = await client.CreateAccountAsync("Corrente", 100000);
        var dueToday = await client.CreateAsync("/api/bills", new { name = "Internet", amount_cents = 9990, due_day = 18, auto_debit = true, account_id = account });
        var alreadyDue = await client.CreateAsync("/api/bills", new { name = "Água", amount_cents = 5000, due_day = 10, auto_debit = true, account_id = account });
        await client.CreateAsync("/api/bills", new { name = "Aluguel", amount_cents = 150000, due_day = 25, auto_debit = true, account_id = account });
        await client.CreateAsync("/api/bills", new { name = "Manual", amount_cents = 700, due_day = 1 });

        // A água venceu (dia 10) antes da ativação (dia 18): não é debitada.
        var run = await client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run");
        var created = Assert.Single(run.GetProperty("created").EnumerateArray());
        Assert.Equal("bill", created.GetProperty("kind").GetString());
        Assert.Equal(dueToday, created.GetProperty("id").GetInt64());
        Assert.Equal("Internet", created.GetProperty("name").GetString());
        Assert.Equal("2026-09-18", created.GetProperty("date").GetString());
        Assert.Equal(9990, created.GetProperty("amount_cents").GetInt64());
        Assert.Equal("BRL", created.GetProperty("currency").GetString());
        var transactionId = created.GetProperty("transaction_id").GetInt64();
        var transaction = (await client.GetJsonAsync("/api/transactions")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == transactionId);
        Assert.Equal("auto_debit", transaction.GetProperty("payment_method").GetString());
        Assert.Equal(account, transaction.GetProperty("account_id").GetInt64());
        Assert.Equal("Pagamento da conta Internet (2026-09)", transaction.GetProperty("notes").GetString());
        Assert.Equal(100000 - 9990, await client.AccountBalanceAsync(account));

        Assert.Empty((await client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run")).GetProperty("created").EnumerateArray());

        using (var connection = api.OpenDatabase())
        {
            using var command = connection.CreateCommand();
            command.CommandText = $"UPDATE bills SET auto_debit_since='2026-09-01' WHERE id={alreadyDue}";
            command.ExecuteNonQuery();
        }
        var late = await client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run");
        Assert.Equal("2026-09-10", Assert.Single(late.GetProperty("created").EnumerateArray()).GetProperty("date").GetString());

        var checklist = (await client.GetJsonAsync("/api/checklist")).EnumerateArray().ToList();
        var internet = checklist.Single(item => item.GetProperty("id").GetInt64() == dueToday);
        Assert.True(internet.GetProperty("paid").GetBoolean());
        Assert.True(internet.GetProperty("auto_debit").GetBoolean());
        Assert.Equal(account, internet.GetProperty("account_id").GetInt64());
        Assert.Equal("BRL", internet.GetProperty("currency").GetString());

        // Desmarcar desfaz o débito e impede um novo neste mês.
        await client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = dueToday, month = "2026-09", paid = false });
        Assert.Equal(100000 - 5000, await client.AccountBalanceAsync(account));
        Assert.Empty((await client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run")).GetProperty("created").EnumerateArray());
        Assert.True((await client.GetJsonAsync("/api/checklist")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == dueToday).GetProperty("auto_debit_skipped").GetBoolean());

        // No mês seguinte o débito volta a acontecer.
        api.Time.FixedUtcNow = new DateTimeOffset(2026, 10, 20, 12, 0, 0, TimeSpan.Zero);
        var october = await client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run");
        Assert.Equal(2, october.GetProperty("created").GetArrayLength());
    }

    // ---------- Assinaturas ----------

    [Fact]
    public async Task Subscription_charges_are_created_for_due_dates_in_the_window_without_duplicates()
    {
        using var api = Api();
        var client = api.CreateClient();
        var account = await client.CreateAccountAsync("Corrente", 100000);
        var category = await client.CreateAsync("/api/categories", new { name = "Streaming", kind = "expense" });
        var subscription = await client.CreateAsync("/api/subscriptions", new { name = "Filmes", amount_cents = 3990, billing_day = 5, category_id = category, auto_debit = true, account_id = account });
        SetSince(api, "subscriptions", subscription, "2026-06-01");

        // Janela: 62 dias antes de hoje (18/07) até hoje → cobranças de 05/08 e 05/09.
        var run = await client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run");
        var created = run.GetProperty("created").EnumerateArray().ToList();
        Assert.Equal(["2026-08-05", "2026-09-05"], created.Select(item => item.GetProperty("date").GetString()));
        Assert.All(created, item => Assert.Equal("subscription", item.GetProperty("kind").GetString()));
        Assert.Equal(100000 - 2 * 3990, await client.AccountBalanceAsync(account));

        var transactions = (await client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray().ToList();
        var charge = transactions.Single(item => item.GetProperty("description").GetString() == "Filmes");
        Assert.Equal("auto_debit", charge.GetProperty("payment_method").GetString());
        Assert.Equal("Cobrança automática de Filmes", charge.GetProperty("notes").GetString());
        Assert.Equal(category, charge.GetProperty("category_id").GetInt64());
        Assert.Equal("2026-09-05", (await client.RecordAsync("subscriptions", subscription)).GetProperty("last_charge_date").GetString());

        Assert.Empty((await client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run")).GetProperty("created").EnumerateArray());

        // Remover o lançamento gerado mantém a cobrança registrada: não é recriado.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/transactions/{charge.GetProperty("id").GetInt64()}")).StatusCode);
        Assert.Empty((await client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run")).GetProperty("created").EnumerateArray());

        // O "Lançar cobrança" manual continua recusando duplicata ativa.
        var duplicate = await client.PostAsJsonAsync($"/api/subscriptions/{subscription}/charge", new { date = "2026-08-05" });
        Assert.Equal("Esta cobrança já foi lançada.", await duplicate.AssertValidationAsync("date"));
    }

    [Fact]
    public async Task Card_subscriptions_are_charged_on_the_card_and_closed_months_are_skipped()
    {
        using var api = Api();
        var client = api.CreateClient();
        var card = await client.CreateAsync("/api/cards", new { name = "Roxo", closing_day = 25, due_day = 5 });
        var subscription = await client.CreateAsync("/api/subscriptions", new { name = "Música", amount_cents = 2190, billing_day = 10, auto_debit = true, card_id = card });
        SetSince(api, "subscriptions", subscription, "2026-08-01");
        await client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-08/close");

        var created = Assert.Single((await client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run")).GetProperty("created").EnumerateArray());
        Assert.Equal("2026-09-10", created.GetProperty("date").GetString());
        var transaction = (await client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray().Single();
        Assert.Equal("card", transaction.GetProperty("payment_method").GetString());
        Assert.Equal(card, transaction.GetProperty("card_id").GetInt64());
        Assert.Equal(JsonValueKind.Null, transaction.GetProperty("account_id").ValueKind);
        Assert.Equal(2190, (await client.GetJsonAsync($"/api/cards/{card}/invoices/2026-10")).GetProperty("total_cents").GetInt64());

        // Ao reabrir agosto, a cobrança de 10/08 é lançada.
        await client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-08/reopen");
        Assert.Equal("2026-08-10", Assert.Single((await client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run")).GetProperty("created").EnumerateArray()).GetProperty("date").GetString());
    }

    [Fact]
    public async Task Foreign_currency_subscriptions_wait_for_a_rate()
    {
        using var api = Api();
        var client = api.CreateClient();
        var usd = await client.CreateAsync("/api/bank-accounts", new { name = "Dólar", institution = "Wise", currency = "USD", current_balance_cents = 10000 });
        var subscription = await client.CreateAsync("/api/subscriptions", new { name = "Software", amount_cents = 2000, billing_day = 18, auto_debit = true, account_id = usd });
        Assert.Equal("USD", (await client.RecordAsync("subscriptions", subscription)).GetProperty("currency").GetString());

        Assert.Empty((await client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run")).GetProperty("created").EnumerateArray());
        await CurrencyTests.SetRateAsync(client, "USD", "5");
        var created = Assert.Single((await client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run")).GetProperty("created").EnumerateArray());
        Assert.Equal("USD", created.GetProperty("currency").GetString());
        Assert.Equal(8000, await client.AccountBalanceAsync(usd));
        var transaction = (await client.GetJsonAsync("/api/transactions")).EnumerateArray().Single();
        Assert.Equal(10000, transaction.GetProperty("base_amount_cents").GetInt64());
        Assert.Equal("5", transaction.GetProperty("exchange_rate").GetString());
    }

    [Fact]
    public async Task Manual_charge_of_a_foreign_currency_subscription_needs_a_rate()
    {
        using var api = Api();
        var client = api.CreateClient();
        var subscription = await client.CreateAsync("/api/subscriptions", new { name = "Nuvem", amount_cents = 999, currency = "EUR" });
        var url = $"/api/subscriptions/{subscription}/charge";
        Assert.Equal("Informe a cotação usada ou atualize as cotações.", await (await client.PostAsJsonAsync(url, new { })).AssertValidationAsync("exchange_rate"));
        var charged = await client.SendJsonAsync(HttpMethod.Post, url, new { exchange_rate = "6" }, HttpStatusCode.Created);
        Assert.True(charged.GetProperty("ok").GetBoolean());
        var transaction = (await client.GetJsonAsync("/api/transactions")).EnumerateArray().Single();
        Assert.Equal("EUR", transaction.GetProperty("currency").GetString());
        Assert.Equal(5994, transaction.GetProperty("base_amount_cents").GetInt64());
    }

    private static FinanceApiFactory Api()
    {
        var api = new FinanceApiFactory();
        api.Time.FixedUtcNow = Now;
        return api;
    }

    private static void SetSince(FinanceApiFactory api, string table, long id, string since)
    {
        using var connection = api.OpenDatabase();
        using var command = connection.CreateCommand();
        command.CommandText = $"UPDATE {table} SET auto_debit_since='{since}' WHERE id={id}";
        command.ExecuteNonQuery();
    }
}
