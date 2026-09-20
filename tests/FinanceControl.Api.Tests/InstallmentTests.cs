using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Compra parcelada (v1.4): uma compra "6/10" vira dez lançamentos, um por mês, para trás e para frente.</summary>
public sealed class InstallmentTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();
    private readonly FinanceApiFactory _factory = factory;

    private async Task<long> CardAsync(string name) =>
        await _client.CreateAsync("/api/cards", new { name, closing_day = 25, due_day = 5 });

    private async Task<JsonElement[]> MonthAsync(string month) =>
        (await _client.GetJsonAsync($"/api/transactions?month={month}")).EnumerateArray().ToArray();

    [Fact]
    public async Task Card_purchase_in_installments_creates_one_transaction_per_month()
    {
        var card = await CardAsync("Parcelado");
        var id = await _client.CreateAsync("/api/transactions", new
        {
            date = "2026-09-17", description = "Notebook", kind = "expense", amount_cents = 100_00,
            payment_method = "card", card_id = card, installment_count = 10, installment_number = 6,
        });

        // Cinco parcelas atrás e quatro à frente, no mesmo dia de cada mês.
        var first = (await MonthAsync("2026-04")).Single(item => item.NullableInt64("card_id") == card);
        Assert.Equal("2026-04-17", first.GetProperty("date").GetString());
        Assert.Equal("Notebook (1/10)", first.GetProperty("description").GetString());
        Assert.Equal(1, first.GetProperty("installment_number").GetInt32());
        Assert.Equal(10, first.GetProperty("installment_count").GetInt32());

        var last = (await MonthAsync("2027-01")).Single(item => item.NullableInt64("card_id") == card);
        Assert.Equal("2027-01-17", last.GetProperty("date").GetString());
        Assert.Equal("Notebook (10/10)", last.GetProperty("description").GetString());

        // O id devolvido é o da parcela informada.
        var current = (await MonthAsync("2026-09")).Single(item => item.GetProperty("id").GetInt64() == id);
        Assert.Equal("Notebook (6/10)", current.GetProperty("description").GetString());
        Assert.Equal(100_00, current.GetProperty("amount_cents").GetInt64());

        // Todas as dez parcelas entram nas faturas do cartão, uma em cada mês.
        var invoices = await _client.GetJsonAsync($"/api/cards/{card}/invoices?from=2026-04&to=2027-02");
        Assert.Equal(10, invoices.EnumerateArray().Count(invoice => invoice.GetProperty("items_count").GetInt32() == 1));
    }

    [Fact]
    public async Task Total_purchase_value_is_split_with_the_remainder_on_the_first_installments()
    {
        var card = await CardAsync("Rateio");
        await _client.CreateAsync("/api/transactions", new
        {
            date = "2026-06-10", description = "Curso", kind = "expense", amount_cents = 1,
            payment_method = "card", card_id = card, installment_count = 3, installment_number = 1,
            installment_total_cents = 100_00,
        });

        var amounts = new[] { "2026-06", "2026-07", "2026-08" }
            .Select(async month => (await MonthAsync(month)).Single(item => item.NullableInt64("card_id") == card).GetProperty("amount_cents").GetInt64());
        var values = await Task.WhenAll(amounts);
        Assert.Equal([33_34L, 33_33L, 33_33L], values);
        Assert.Equal(100_00L, values.Sum());
    }

    [Fact]
    public async Task Installments_in_account_payment_methods_only_reach_the_balance_when_due()
    {
        _factory.Time.FixedUtcNow = new DateTimeOffset(2026, 5, 20, 12, 0, 0, TimeSpan.Zero);
        try
        {
            var account = await _client.CreateAccountAsync("Conta parcelas", 100_000);
            await _client.CreateAsync("/api/transactions", new
            {
                date = "2026-05-10", description = "Boleto", kind = "expense", amount_cents = 300_00,
                payment_method = "boleto", account_id = account, installment_count = 3, installment_number = 1,
            });

            // Só a primeira parcela já venceu; as duas seguintes ficam pendentes.
            Assert.Equal(100_000 - 300_00, await _client.AccountBalanceAsync(account));

            _factory.Time.FixedUtcNow = new DateTimeOffset(2026, 7, 10, 12, 0, 0, TimeSpan.Zero);
            await _client.SendJsonAsync(HttpMethod.Post, "/api/auto-debits/run");
            Assert.Equal(100_000 - 900_00, await _client.AccountBalanceAsync(account));
        }
        finally
        {
            _factory.Time.FixedUtcNow = null;
        }
    }

    [Fact]
    public async Task Installments_are_refused_when_any_month_of_the_series_is_closed()
    {
        var card = await CardAsync("Mês fechado");
        await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2025-11/close");
        try
        {
            var response = await _client.PostAsJsonAsync("/api/transactions", new
            {
                date = "2026-01-15", description = "TV", kind = "expense", amount_cents = 50_00,
                payment_method = "card", card_id = card, installment_count = 4, installment_number = 3,
            });
            await response.AssertValidationAsync("date");
            Assert.DoesNotContain(await MonthAsync("2026-01"), item => item.GetProperty("description").GetString()!.StartsWith("TV", StringComparison.Ordinal));
        }
        finally
        {
            await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2025-11/reopen");
        }
    }

    [Theory]
    // Parcela atual maior que o total.
    [InlineData(3, 4, null, "installment_number")]
    // Fora dos limites aceitos.
    [InlineData(1, 1, null, "installment_count")]
    [InlineData(73, 1, null, "installment_count")]
    // Total que não cobre um centavo por parcela.
    [InlineData(10, 1, 9, "installment_total_cents")]
    public async Task Invalid_installment_input_is_refused(int count, int number, int? total, string field)
    {
        var card = await CardAsync($"Inválido {count}-{number}-{total}");
        var response = await _client.PostAsJsonAsync("/api/transactions", new
        {
            date = "2026-02-10", description = "Compra", kind = "expense", amount_cents = 10_00,
            payment_method = "card", card_id = card, installment_count = count, installment_number = number,
            installment_total_cents = total,
        });
        await response.AssertValidationAsync(field);
    }

    [Fact]
    public async Task Installment_fields_are_refused_on_update()
    {
        var card = await CardAsync("Edição");
        var id = await _client.CreateAsync("/api/transactions", new { date = "2026-03-05", description = "Fone", kind = "expense", amount_cents = 20_00, payment_method = "card", card_id = card });
        var response = await _client.PutAsJsonAsync($"/api/transactions/{id}", new { installment_count = 3 });
        await response.AssertValidationAsync("installment_count");
    }

    [Fact]
    public async Task A_transaction_without_installments_reports_no_series()
    {
        var card = await CardAsync("Simples");
        var id = await _client.CreateAsync("/api/transactions", new { date = "2026-03-06", description = "Café", kind = "expense", amount_cents = 1_50, payment_method = "card", card_id = card });
        var item = (await MonthAsync("2026-03")).Single(row => row.GetProperty("id").GetInt64() == id);
        Assert.Equal(JsonValueKind.Null, item.GetProperty("installment_number").ValueKind);
        Assert.Equal(JsonValueKind.Null, item.GetProperty("installment_count").ValueKind);
        Assert.False(item.GetProperty("imported").GetBoolean());
    }

    [Fact]
    public async Task Cards_keep_the_last_four_digits()
    {
        var card = await _client.CreateAsync("/api/cards", new { name = "Adicional", closing_day = 25, due_day = 5, last_digits = "1234" });
        Assert.Equal("1234", (await _client.RecordAsync("cards", card)).GetProperty("last_digits").GetString());

        var response = await _client.PutAsJsonAsync($"/api/cards/{card}", new { last_digits = "12a4" });
        await response.AssertValidationAsync("last_digits");
    }
}
