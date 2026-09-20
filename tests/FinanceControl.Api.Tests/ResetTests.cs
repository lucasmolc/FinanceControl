using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Zerar a conta (v1.4): apaga todos os dados e devolve o app ao primeiro acesso, guardando uma cópia antes.</summary>
public sealed class ResetTests : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client;

    public ResetTests(FinanceApiFactory factory) => _client = factory.CreateClient();

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("apagar tudo")]
    [InlineData("APAGAR")]
    public async Task Reset_without_the_exact_confirmation_is_refused(string? confirmation)
    {
        var response = await _client.PostAsJsonAsync("/api/reset", new { confirmation });
        await response.AssertValidationAsync("confirmation");
    }

    [Fact]
    public async Task Reset_clears_every_record_and_reopens_the_first_run()
    {
        // Conta com dados em vários módulos e o setup já concluído.
        await _client.CreateAccountAsync("Conta do reset", 500_00);
        var card = await _client.CreateAsync("/api/cards", new { name = "Cartão do reset", closing_day = 25, due_day = 5 });
        await _client.CreateAsync("/api/transactions", new { date = "2026-04-10", description = "Compra", kind = "expense", amount_cents = 50_00, payment_method = "card", card_id = card });
        await _client.CreateAsync("/api/goals", new { name = "Viagem", type = "travel", target_cents = 1_000_00 });
        await _client.SendJsonAsync(HttpMethod.Post, "/api/setup", new { display_name = "Lucas", monthly_net_income_cents = 800_000, monthly_spending_limit_cents = 400_000, emergency_months_target = 6 });
        Assert.True((await _client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("setup_completed").GetBoolean());

        var result = await (await _client.PostAsJsonAsync("/api/reset", new { confirmation = "APAGAR TUDO" })).Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(result.GetProperty("ok").GetBoolean());
        // A cópia automática fica ao lado do banco, para o caso de arrependimento.
        Assert.Contains("antes-de-zerar-", result.GetProperty("safety_copy").GetString()!, StringComparison.Ordinal);

        var state = await _client.GetJsonAsync("/api/state");
        foreach (var module in new[] { "transactions", "cards", "bank_accounts", "goals", "bills", "investments", "subscriptions" })
            Assert.Empty(state.GetProperty(module).EnumerateArray());

        // Primeiro acesso de novo: setup por fazer, tour por ver e as categorias padrão de volta.
        var settings = state.GetProperty("settings");
        Assert.False(settings.GetProperty("setup_completed").GetBoolean());
        Assert.False(settings.GetProperty("tour_completed").GetBoolean());
        Assert.Equal(0, settings.GetProperty("monthly_net_income_cents").GetInt64());
        var categories = state.GetProperty("categories").EnumerateArray().Select(item => item.GetProperty("name").GetString()).ToList();
        Assert.Contains("Alimentação", categories);
        Assert.Contains("Salário", categories);

        // Os ids recomeçam do 1, como em uma conta recém-criada.
        Assert.Equal(1, await _client.CreateAsync("/api/cards", new { name = "Primeiro cartão", closing_day = 10, due_day = 20 }));
        Assert.Equal(1, await _client.CreateAccountAsync("Primeira conta"));
    }
}
