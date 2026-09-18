using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using FinanceControl.Domain.Rules;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Múltiplas moedas (MEL-26): catálogo, conversão para BRL, moeda herdada da conta e transferências entre moedas.</summary>
public sealed class CurrencyTests
{
    [Theory]
    [InlineData(1000L, "USD", "5.1245", 5125L)]      // US$ 10,00 × 5,1245 = R$ 51,245 → 51,25 (meio para longe do zero)
    [InlineData(500000L, "BTC", "397795", 198898L)]  // ₿ 0,005 × 397.795 = R$ 1.988,975 → 1.988,98
    [InlineData(1500L, "JPY", "0.0345", 5175L)]      // ¥ 1.500 (0 casas) × 0,0345 = R$ 51,75
    [InlineData(-1000L, "USD", "5.1245", -5125L)]
    [InlineData(12345L, "BRL", "7", 12345L)]         // BRL ignora a cotação
    public void Conversion_uses_currency_decimals_and_rounds_half_away_from_zero(long amount, string currency, string rate, long expected) =>
        Assert.Equal(expected, CurrencyRules.ToBaseCents(amount, currency, decimal.Parse(rate, System.Globalization.CultureInfo.InvariantCulture)));

    [Theory]
    [InlineData("5.1234", "5.1234")]
    [InlineData("5,1234", "5.1234")]
    [InlineData(" 397795.10 ", "397795.1")]
    [InlineData("0", null)]
    [InlineData("-1", null)]
    [InlineData("abc", null)]
    [InlineData("1.234,56", null)]
    public void Rates_are_parsed_and_formatted_canonically(string text, string? expected) =>
        Assert.Equal(expected, CurrencyRules.ParseRate(text) is decimal value ? CurrencyRules.FormatRate(value) : null);

    [Fact]
    public void Catalog_has_the_thirteen_currencies_with_their_decimals()
    {
        Assert.Equal(13, Currencies.All.Count);
        Assert.Equal(["BRL", "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "ARS", "BTC", "ETH", "SOL", "USDT"], Currencies.All.Select(item => item.Code));
        Assert.Equal(0, Currencies.DecimalsOf("JPY"));
        Assert.Equal(8, Currencies.DecimalsOf("BTC"));
        Assert.Equal(2, Currencies.DecimalsOf("USDT"));
        Assert.Equal(Currencies.Crypto, Currencies.Find("USDT")!.Kind);
    }

    [Fact]
    public async Task Currencies_endpoint_lists_the_catalog()
    {
        using var api = new FinanceApiFactory();
        var currencies = (await api.CreateClient().GetJsonAsync("/api/currencies")).EnumerateArray().ToList();
        Assert.Equal(13, currencies.Count);
        var btc = currencies.Single(item => item.GetProperty("code").GetString() == "BTC");
        Assert.Equal("Bitcoin", btc.GetProperty("name").GetString());
        Assert.Equal("₿", btc.GetProperty("symbol").GetString());
        Assert.Equal(8, btc.GetProperty("decimals").GetInt32());
        Assert.Equal("crypto", btc.GetProperty("kind").GetString());
    }

    [Fact]
    public async Task Transactions_inherit_the_account_currency_and_store_the_brl_value()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        await SetRateAsync(client, "USD", "5.00");
        var usd = await client.CreateAsync("/api/bank-accounts", new { name = "Conta dólar", institution = "Wise", currency = "USD", current_balance_cents = 100000 });

        var inherited = await client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-09-10", description = "Assinatura", kind = "expense", amount_cents = 1000, account_id = usd });
        var row = await TransactionAsync(client, inherited);
        Assert.Equal("USD", row.GetProperty("currency").GetString());
        Assert.Equal("5", row.GetProperty("exchange_rate").GetString());
        Assert.Equal(5000, row.GetProperty("base_amount_cents").GetInt64());
        Assert.Equal(99000, await client.AccountBalanceAsync(usd));

        var withRate = await client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-09-11", description = "Loja", kind = "expense", amount_cents = 2000, account_id = usd, currency = "USD", exchange_rate = "5,25" });
        Assert.Equal(10500, (await TransactionAsync(client, withRate)).GetProperty("base_amount_cents").GetInt64());

        var mismatch = await client.PostAsJsonAsync("/api/transactions", new { payment_method = "pix", date = "2026-09-11", description = "X", kind = "expense", amount_cents = 10, account_id = usd, currency = "EUR" });
        Assert.Equal("O lançamento deve usar a moeda da conta vinculada.", await mismatch.AssertValidationAsync("currency"));

        var summary = await client.GetJsonAsync("/api/summary?month=2026-09");
        Assert.Equal(15500, summary.GetProperty("expense_cents").GetInt64());

        // Mudar só o valor recalcula pela cotação gravada no lançamento (não pela atual).
        await SetRateAsync(client, "USD", "6.00");
        await client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{inherited}", new { amount_cents = 2000 });
        var edited = await TransactionAsync(client, inherited);
        Assert.Equal("5", edited.GetProperty("exchange_rate").GetString());
        Assert.Equal(10000, edited.GetProperty("base_amount_cents").GetInt64());
        Assert.Equal(98000 - 2000, await client.AccountBalanceAsync(usd));
    }

    [Fact]
    public async Task Foreign_currency_without_a_known_rate_requires_the_rate()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        var response = await client.PostAsJsonAsync("/api/transactions", new { payment_method = "pix", date = "2026-09-10", description = "Café em Paris", kind = "expense", amount_cents = 450, currency = "EUR" });
        Assert.Equal("Informe a cotação usada ou atualize as cotações.", await response.AssertValidationAsync("exchange_rate"));

        var id = await client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-09-10", description = "Café em Paris", kind = "expense", amount_cents = 450, currency = "EUR", exchange_rate = 6.1 });
        var row = await TransactionAsync(client, id);
        Assert.Equal("6.1", row.GetProperty("exchange_rate").GetString());
        Assert.Equal(2745, row.GetProperty("base_amount_cents").GetInt64());

        // Trocar para BRL zera a cotação.
        await client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{id}", new { currency = "BRL" });
        var brl = await TransactionAsync(client, id);
        Assert.Equal("1", brl.GetProperty("exchange_rate").GetString());
        Assert.Equal(450, brl.GetProperty("base_amount_cents").GetInt64());

        Assert.Equal("Informe uma cotação maior que zero.", await (await client.PostAsJsonAsync("/api/transactions",
            new { date = "2026-09-10", description = "X", kind = "expense", amount_cents = 1, currency = "EUR", exchange_rate = "0" })).AssertValidationAsync("exchange_rate"));
    }

    [Theory]
    [InlineData("bank-accounts", "{\"name\":\"A\",\"institution\":\"B\",\"currency\":\"XYZ\"}", "currency", "Moeda não suportada. Escolha uma moeda da lista.")]
    [InlineData("investments", "{\"name\":\"I\",\"currency\":\"usd\"}", "currency", "Use o código da moeda com 3 letras maiúsculas, como BRL.")]
    [InlineData("goals", "{\"name\":\"G\",\"target_cents\":100,\"currency\":\"DOGE\"}", "currency", "Moeda não suportada. Escolha uma moeda da lista.")]
    [InlineData("bills", "{\"name\":\"B\",\"amount_cents\":100,\"currency\":7}", "currency", "Valor inválido.")]
    public async Task Currency_fields_accept_only_catalog_codes(string module, string body, string field, string message)
    {
        using var api = new FinanceApiFactory();
        Assert.Equal(message, await (await api.CreateClient().PostRawAsync($"/api/{module}", body)).AssertValidationAsync(field));
    }

    [Fact]
    public async Task Crypto_holdings_use_eight_decimals_and_usdt_is_accepted()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        var wallet = await client.CreateAsync("/api/investments", new { name = "Carteira", type = "crypto", currency = "BTC", invested_cents = 500000, current_cents = 500000 });
        var stable = await client.CreateAsync("/api/goals", new { name = "Reserva cripto", target_cents = 100000, currency = "USDT" });
        Assert.Equal("BTC", (await client.RecordAsync("investments", wallet)).GetProperty("currency").GetString());
        Assert.Equal("USDT", (await client.RecordAsync("goals", stable)).GetProperty("currency").GetString());
    }

    [Fact]
    public async Task Account_currency_cannot_change_once_the_account_has_movements()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        var empty = await client.CreateAsync("/api/bank-accounts", new { name = "Nova", institution = "Banco", currency = "EUR" });
        await client.SendJsonAsync(HttpMethod.Put, $"/api/bank-accounts/{empty}", new { currency = "USD" });
        Assert.Equal("USD", (await client.RecordAsync("bank-accounts", empty)).GetProperty("currency").GetString());

        var used = await client.CreateAccountAsync("Usada", 1000);
        await client.CreateAsync($"/api/bank-accounts/{used}/entries", new { date = "2026-09-01", kind = "deposit", amount_cents = 100 });
        var response = await client.PutAsJsonAsync($"/api/bank-accounts/{used}", new { currency = "USD" });
        Assert.Equal("Não é possível trocar a moeda de uma conta com movimentações.", await response.AssertValidationAsync("currency"));
    }

    [Fact]
    public async Task Cross_currency_transfer_requires_the_received_amount_and_reverses_both_sides()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        var brl = await client.CreateAccountAsync("Conta real", 100000);
        var usd = await client.CreateAsync("/api/bank-accounts", new { name = "Conta dólar", institution = "Nomad", currency = "USD" });
        var url = $"/api/bank-accounts/{brl}/entries";

        var missing = await client.PostAsJsonAsync(url, new { date = "2026-09-01", kind = "transfer_out", amount_cents = 51245, related_account_id = usd });
        Assert.Equal("Informe o valor recebido na conta de destino.", await missing.AssertValidationAsync("related_amount_cents"));

        var entry = await client.CreateAsync(url, new { date = "2026-09-01", kind = "transfer_out", amount_cents = 51245, related_account_id = usd, related_amount_cents = 10000 });
        Assert.Equal(48755, await client.AccountBalanceAsync(brl));
        Assert.Equal(10000, await client.AccountBalanceAsync(usd));
        var received = (await client.GetJsonAsync($"/api/bank-accounts/{usd}/entries")).EnumerateArray().Single();
        Assert.Equal("transfer_in", received.GetProperty("kind").GetString());
        Assert.Equal(10000, received.GetProperty("amount_cents").GetInt64());

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{url}/{entry}")).StatusCode);
        Assert.Equal(100000, await client.AccountBalanceAsync(brl));
        Assert.Equal(0, await client.AccountBalanceAsync(usd));
        await client.SendJsonAsync(HttpMethod.Post, $"{url}/{entry}/restore");
        Assert.Equal(48755, await client.AccountBalanceAsync(brl));
        Assert.Equal(10000, await client.AccountBalanceAsync(usd));
    }

    [Fact]
    public async Task Same_currency_transfer_accepts_only_an_equal_received_amount()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        var source = await client.CreateAccountAsync("Origem", 1000);
        var target = await client.CreateAccountAsync("Destino");
        var url = $"/api/bank-accounts/{source}/entries";
        var response = await client.PostAsJsonAsync(url, new { date = "2026-09-01", kind = "transfer_out", amount_cents = 500, related_account_id = target, related_amount_cents = 499 });
        Assert.Equal("Entre contas da mesma moeda, o valor recebido deve ser igual ao enviado.", await response.AssertValidationAsync("related_amount_cents"));
        await client.CreateAsync(url, new { date = "2026-09-01", kind = "transfer_out", amount_cents = 500, related_account_id = target, related_amount_cents = 500 });
        Assert.Equal(500, await client.AccountBalanceAsync(target));
    }

    [Fact]
    public async Task Card_purchases_in_foreign_currency_enter_the_invoice_in_brl()
    {
        using var api = new FinanceApiFactory();
        api.Time.FixedUtcNow = new DateTimeOffset(2026, 9, 18, 12, 0, 0, TimeSpan.Zero);
        var client = api.CreateClient();
        var card = await client.CreateAsync("/api/cards", new { name = "Internacional", closing_day = 25, due_day = 5 });
        await client.CreateAsync("/api/transactions", new { date = "2026-09-10", description = "App", kind = "expense", amount_cents = 1000, card_id = card, currency = "USD", exchange_rate = "5.5" });
        var invoice = await client.GetJsonAsync($"/api/cards/{card}/invoices/2026-10");
        Assert.Equal(5500, invoice.GetProperty("total_cents").GetInt64());
        Assert.Equal("USD", invoice.GetProperty("items")[0].GetProperty("currency").GetString());
    }

    internal static async Task SetRateAsync(HttpClient client, string currency, string rate) =>
        await client.SendJsonAsync(HttpMethod.Put, $"/api/market/rates/{currency}", new { rate_brl = rate });

    private static async Task<JsonElement> TransactionAsync(HttpClient client, long id) =>
        (await client.GetJsonAsync("/api/transactions")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == id);
}
