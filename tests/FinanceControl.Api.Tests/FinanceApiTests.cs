using System.Net;
using System.Net.Http.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

public sealed class FinanceApiTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task State_initializes_legacy_compatible_schema()
    {
        var state = await _client.GetJsonAsync("/api/state");
        Assert.False(state.GetProperty("settings").GetProperty("setup_completed").GetBoolean());
        Assert.Equal(string.Empty, state.GetProperty("settings").GetProperty("display_name").GetString());

        var setup = await _client.PostAsJsonAsync("/api/setup", new
        {
            display_name = "",
            monthly_net_income_cents = 0,
            monthly_spending_limit_cents = 0,
            emergency_months_target = 6,
            bills = new[] { new { name = "  Aluguel  ", amount_cents = 150000, due_day = 0 }, new { name = " ", amount_cents = 100, due_day = 5 } },
            goals = Array.Empty<object>(),
            card = (object?)null
        });
        setup.EnsureSuccessStatusCode();

        var configured = await _client.GetJsonAsync("/api/state");
        Assert.True(configured.GetProperty("settings").GetProperty("setup_completed").GetBoolean());
        var bills = configured.GetProperty("bills").EnumerateArray().ToList();
        var bill = Assert.Single(bills, item => item.GetProperty("name").GetString() == "Aluguel");
        Assert.Equal(10, bill.GetProperty("due_day").GetInt32());
        Assert.DoesNotContain(bills, item => string.IsNullOrWhiteSpace(item.GetProperty("name").GetString()));
    }

    [Fact]
    public async Task Settings_accept_blank_optional_name_and_update_reserve_plan()
    {
        var response = await _client.PutAsJsonAsync("/api/settings", new
        {
            display_name = "   ",
            monthly_net_income_cents = 850000,
            monthly_spending_limit_cents = 320000,
            emergency_months_target = 9
        });

        response.EnsureSuccessStatusCode();
        var settings = (await _client.GetJsonAsync("/api/state")).GetProperty("settings");
        Assert.Equal(string.Empty, settings.GetProperty("display_name").GetString());
        Assert.Equal(850000, settings.GetProperty("monthly_net_income_cents").GetInt64());
        Assert.Equal(320000, settings.GetProperty("monthly_spending_limit_cents").GetInt64());
        Assert.Equal(9, settings.GetProperty("emergency_months_target").GetInt32());
    }

    [Fact]
    public async Task Transaction_delete_is_logical_and_restore_brings_it_back()
    {
        var id = await _client.CreateAsync("/api/transactions", new { date = "2026-08-31", description = "Teste de exclusão lógica", kind = "expense", amount_cents = 1250, payment_method = "debit" });

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/transactions/{id}")).StatusCode);
        var state = await _client.GetJsonAsync("/api/state");
        Assert.DoesNotContain(state.GetProperty("transactions").EnumerateArray(), item => item.GetProperty("id").GetInt64() == id);
        using (var connection = factory.OpenDatabase())
        {
            var command = connection.CreateCommand();
            command.CommandText = $"SELECT deleted_at IS NOT NULL FROM transactions WHERE id={id}";
            Assert.Equal(1L, (long)command.ExecuteScalar()!);
        }

        await (await _client.DeleteAsync($"/api/transactions/{id}")).AssertNotFoundAsync();
        await (await _client.PutAsJsonAsync($"/api/transactions/{id}", new { description = "Editado" })).AssertNotFoundAsync();

        await _client.SendJsonAsync(HttpMethod.Post, $"/api/transactions/{id}/restore");
        await (await _client.PostAsync($"/api/transactions/{id}/restore", null)).AssertNotFoundAsync();
        var restored = await _client.GetJsonAsync("/api/transactions");
        Assert.Contains(restored.EnumerateArray(), item => item.GetProperty("id").GetInt64() == id);
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{id}", new { description = "Editado" });
    }

    [Theory]
    [InlineData("bills", "{\"name\":\"Internet\",\"amount_cents\":9900}")]
    [InlineData("goals", "{\"name\":\"Viagem\",\"target_cents\":500000}")]
    [InlineData("investments", "{\"name\":\"CDB\"}")]
    [InlineData("cards", "{\"name\":\"Cartão\"}")]
    [InlineData("bank-accounts", "{\"name\":\"Conta\",\"institution\":\"Banco\"}")]
    [InlineData("categories", "{\"name\":\"Mercado\",\"kind\":\"expense\"}")]
    [InlineData("subscriptions", "{\"name\":\"Streaming\",\"amount_cents\":3990}")]
    public async Task Removed_records_reject_updates_and_can_be_restored(string module, string body)
    {
        var created = await _client.PostRawAsync($"/api/{module}", body);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt64();

        await _client.SendJsonAsync(HttpMethod.Put, $"/api/{module}/{id}", new { name = "Renomeado" });
        await (await _client.PostAsync($"/api/{module}/{id}/restore", null)).AssertNotFoundAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/{module}/{id}")).StatusCode);
        await (await _client.DeleteAsync($"/api/{module}/{id}")).AssertNotFoundAsync();
        await (await _client.PutAsJsonAsync($"/api/{module}/{id}", new { name = "Outro" })).AssertNotFoundAsync();
        Assert.DoesNotContain((await _client.GetJsonAsync($"/api/{module}")).EnumerateArray(), item => item.GetProperty("id").GetInt64() == id);

        await _client.SendJsonAsync(HttpMethod.Post, $"/api/{module}/{id}/restore");
        var restored = await _client.RecordAsync(module, id);
        Assert.Equal("Renomeado", restored.GetProperty("name").GetString());
    }

    [Fact]
    public async Task Missing_records_return_not_found()
    {
        await (await _client.PutAsJsonAsync("/api/bills/987654", new { name = "X" })).AssertNotFoundAsync();
        await (await _client.DeleteAsync("/api/bills/987654")).AssertNotFoundAsync();
        await (await _client.PostAsync("/api/bills/987654/restore", null)).AssertNotFoundAsync();
        await (await _client.PostAsJsonAsync("/api/goals/987654/entries", new { date = "2026-01-01", amount_cents = 100 })).AssertNotFoundAsync();
    }
}
