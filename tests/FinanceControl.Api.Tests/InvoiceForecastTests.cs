using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>
/// Gasto mensal sem prazo (v1.4): a assinatura aparece nas faturas que ainda não fecharam, com o valor atual,
/// até ser desativada. A previsão fica em um total à parte, fora do que já foi gasto.
/// </summary>
public sealed class InvoiceForecastTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();
    private readonly FinanceApiFactory _factory = factory;

    private async Task<JsonElement> InvoiceAsync(long card, string month) =>
        await _client.GetJsonAsync($"/api/cards/{card}/invoices/{month}");

    [Fact]
    public async Task A_monthly_subscription_shows_on_every_open_invoice_until_it_is_disabled()
    {
        _factory.Time.FixedUtcNow = new DateTimeOffset(2026, 9, 20, 12, 0, 0, TimeSpan.Zero);
        try
        {
            var card = await _client.CreateAsync("/api/cards", new { name = "Academia", closing_day = 25, due_day = 5 });
            var subscription = await _client.CreateAsync("/api/subscriptions", new
            {
                name = "Academia", amount_cents = 149_90, billing_day = 10, frequency = "monthly", card_id = card,
            });

            // Fatura aberta e as seguintes trazem a cobrança prevista; o total realizado continua zerado.
            foreach (var month in new[] { "2026-10", "2026-11", "2026-12" })
            {
                var invoice = await InvoiceAsync(card, month);
                Assert.Equal(1, invoice.GetProperty("projected_count").GetInt32());
                Assert.Equal(149_90, invoice.GetProperty("projected_cents").GetInt64());
                Assert.Equal(0, invoice.GetProperty("total_cents").GetInt64());
                Assert.Equal("Academia", invoice.GetProperty("projected").EnumerateArray().Single().GetProperty("name").GetString());
            }

            // Mudar o valor vale para as faturas seguintes, sem tocar no que já passou.
            await _client.SendJsonAsync(HttpMethod.Put, $"/api/subscriptions/{subscription}", new { amount_cents = 179_90 });
            Assert.Equal(179_90, (await InvoiceAsync(card, "2026-11")).GetProperty("projected_cents").GetInt64());

            // Lançada a cobrança do ciclo (fatura de outubro fecha em 25/09), ela deixa de ser previsão e vira gasto.
            await _client.PostAsJsonAsync($"/api/subscriptions/{subscription}/charge", new { date = "2026-09-10" });
            var charged = await InvoiceAsync(card, "2026-10");
            Assert.Equal(0, charged.GetProperty("projected_count").GetInt32());
            Assert.Equal(179_90, charged.GetProperty("total_cents").GetInt64());

            // Desativada, some das faturas futuras.
            await _client.DeleteAsync($"/api/subscriptions/{subscription}");
            Assert.Equal(0, (await InvoiceAsync(card, "2026-12")).GetProperty("projected_count").GetInt32());
        }
        finally
        {
            _factory.Time.FixedUtcNow = null;
        }
    }

    [Fact]
    public async Task Closed_invoices_never_carry_a_forecast()
    {
        _factory.Time.FixedUtcNow = new DateTimeOffset(2026, 9, 20, 12, 0, 0, TimeSpan.Zero);
        try
        {
            var card = await _client.CreateAsync("/api/cards", new { name = "Streaming", closing_day = 25, due_day = 5 });
            await _client.CreateAsync("/api/subscriptions", new { name = "Streaming", amount_cents = 39_90, billing_day = 8, frequency = "monthly", card_id = card });

            // Fatura de agosto (fechada em 25/07) não recebe mais cobrança.
            Assert.Equal(0, (await InvoiceAsync(card, "2026-08")).GetProperty("projected_count").GetInt32());
            Assert.Equal(1, (await InvoiceAsync(card, "2026-10")).GetProperty("projected_count").GetInt32());
        }
        finally
        {
            _factory.Time.FixedUtcNow = null;
        }
    }
}
