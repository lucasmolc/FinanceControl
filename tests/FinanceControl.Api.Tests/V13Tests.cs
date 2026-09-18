using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>v1.3: compra no cartão exige cartão (CR-06), data de referência nunca futura (CR-23) e lacunas da v1.2 (MEL-46).</summary>
public sealed class V13Tests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 18, 12, 0, 0, TimeSpan.Zero);

    // ---------- CR-06 ----------

    [Fact]
    public async Task Card_payment_method_requires_a_card_on_create()
    {
        using var api = Api();
        var client = api.CreateClient();
        var card = await client.CreateAsync("/api/cards", new { name = "Roxo", closing_day = 25, due_day = 5 });

        var explicitCard = await client.PostAsJsonAsync("/api/transactions", new { date = "2026-09-10", description = "Loja", kind = "expense", amount_cents = 100, payment_method = "card" });
        Assert.Equal("Escolha o cartão da compra.", await explicitCard.AssertValidationAsync("card_id"));
        var explicitNull = await client.PostAsJsonAsync("/api/transactions", new { date = "2026-09-10", description = "Loja", kind = "expense", amount_cents = 100, payment_method = "card", card_id = (long?)null });
        Assert.Equal("Escolha o cartão da compra.", await explicitNull.AssertValidationAsync("card_id"));
        // A forma padrão continua sendo cartão de crédito, então sem forma e sem cartão também é recusado.
        var defaultMethod = await client.PostAsJsonAsync("/api/transactions", new { date = "2026-09-10", description = "Loja", kind = "expense", amount_cents = 100 });
        Assert.Equal("Escolha o cartão da compra.", await defaultMethod.AssertValidationAsync("card_id"));
        Assert.Empty((await client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray());

        var withCard = await client.CreateAsync("/api/transactions", new { date = "2026-09-10", description = "Loja", kind = "expense", amount_cents = 100, card_id = card });
        var pix = await client.CreateAsync("/api/transactions", new { date = "2026-09-10", description = "Feira", kind = "expense", amount_cents = 100, payment_method = "pix" });
        var month = (await client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray().ToList();
        Assert.Equal("card", month.Single(item => item.GetProperty("id").GetInt64() == withCard).GetProperty("payment_method").GetString());
        Assert.Equal("pix", month.Single(item => item.GetProperty("id").GetInt64() == pix).GetProperty("payment_method").GetString());
    }

    [Fact]
    public async Task Card_payment_method_requires_a_card_on_update_but_legacy_rows_stay_readable()
    {
        using var api = Api();
        var client = api.CreateClient();
        var card = await client.CreateAsync("/api/cards", new { name = "Roxo", closing_day = 25, due_day = 5 });
        using (var connection = api.OpenDatabase())
        {
            using var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO transactions(date,description,kind,amount_cents,payment_method,currency,base_amount_cents,exchange_rate) VALUES ('2026-09-01','Compra antiga','expense',2500,'card','BRL',2500,'1')";
            command.ExecuteNonQuery();
        }
        var legacy = (await client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray().Single();
        var legacyId = legacy.GetProperty("id").GetInt64();
        Assert.Equal("card", legacy.GetProperty("payment_method").GetString());
        Assert.Equal(JsonValueKind.Null, legacy.GetProperty("card_id").ValueKind);
        Assert.Equal(2500, (await client.GetJsonAsync("/api/summary?month=2026-09")).GetProperty("expense_cents").GetInt64());

        // Editar mantendo a forma "cartão" exige escolher o cartão (ou outra forma).
        Assert.Equal("Escolha o cartão da compra.", await (await client.PutAsJsonAsync($"/api/transactions/{legacyId}", new { description = "Editada" })).AssertValidationAsync("card_id"));
        await client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{legacyId}", new { description = "Editada", card_id = card });
        await client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{legacyId}", new { card_id = (long?)null, payment_method = "debit" });

        // Voltar para "cartão" sem cartão é recusado; com cartão, aceito.
        Assert.Equal("Escolha o cartão da compra.", await (await client.PutAsJsonAsync($"/api/transactions/{legacyId}", new { payment_method = "card" })).AssertValidationAsync("card_id"));
        await client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{legacyId}", new { payment_method = "card", card_id = card });

        // Remover e desfazer não são criação nem edição: continuam liberados.
        using (var connection = api.OpenDatabase())
        {
            using var command = connection.CreateCommand();
            command.CommandText = $"UPDATE transactions SET card_id=NULL WHERE id={legacyId}";
            command.ExecuteNonQuery();
        }
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/transactions/{legacyId}")).StatusCode);
        await client.SendJsonAsync(HttpMethod.Post, $"/api/transactions/{legacyId}/restore");
    }

    // ---------- CR-23 ----------

    [Fact]
    public async Task Stored_future_reference_dates_are_never_returned()
    {
        using var api = Api();
        var client = api.CreateClient();
        using (var connection = api.OpenDatabase())
        {
            using var command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO market_indicators(code,value,reference_date,source,fetched_at) VALUES
                ('selic',15,'2026-11-04','Banco Central (SGS)','2026-09-18T12:00:00Z'),
                ('cdi',14.9,'2026-09-17','Banco Central (SGS)','2026-09-18T12:00:00Z'),
                ('ipca_12m',5.1,NULL,'Banco Central (SGS)','2026-09-18T12:00:00Z')
                """;
            command.ExecuteNonQuery();
        }
        var indicators = (await client.GetJsonAsync("/api/market")).GetProperty("indicators").EnumerateArray().ToList();
        Assert.Equal("2026-09-18", indicators[0].GetProperty("reference_date").GetString());
        Assert.Equal("2026-09-17", indicators[1].GetProperty("reference_date").GetString());
        Assert.Equal(JsonValueKind.Null, indicators[2].GetProperty("reference_date").ValueKind);
    }

    // ---------- MEL-46 ----------

    [Fact]
    public async Task Restoring_a_backup_without_market_tables_keeps_the_current_rates_and_indicators()
    {
        using var api = Api();
        var client = api.CreateClient();
        await client.CreateAsync("/api/bills", new { name = "Luz", amount_cents = 100 });
        var document = JsonNode.Parse((await client.GetJsonAsync("/api/backup")).GetRawText())!.AsObject();
        var data = document["data"]!.AsObject();
        data.Remove("exchange_rates");
        data.Remove("market_indicators");
        data.Remove("net_worth_snapshots");
        document["version"] = 2;

        await CurrencyTests.SetRateAsync(client, "EUR", "6.2");
        using (var connection = api.OpenDatabase())
        {
            using var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO market_indicators(code,value,reference_date,source,fetched_at) VALUES ('selic',15,'2026-09-17','Banco Central (SGS)','2026-09-18T12:00:00Z')";
            command.ExecuteNonQuery();
        }

        var restored = await client.SendJsonAsync(HttpMethod.Post, "/api/backup/restore", document);
        var counts = restored.GetProperty("restored");
        Assert.False(counts.TryGetProperty("exchange_rates", out _));
        Assert.False(counts.TryGetProperty("market_indicators", out _));
        Assert.Equal(0, counts.GetProperty("net_worth_snapshots").GetInt64());
        var market = await client.GetJsonAsync("/api/market");
        Assert.Equal("6.2", market.GetProperty("rates").EnumerateArray().Single().GetProperty("rate_brl").GetString());
        Assert.Equal(15, market.GetProperty("indicators").EnumerateArray().Single().GetProperty("value").GetDouble());
        Assert.Single((await client.GetJsonAsync("/api/bills")).EnumerateArray());

        // Um backup que traz as tabelas (mesmo vazias) continua substituindo o conteúdo.
        data["exchange_rates"] = new JsonArray();
        await client.SendJsonAsync(HttpMethod.Post, "/api/backup/restore", document);
        Assert.Empty((await client.GetJsonAsync("/api/market")).GetProperty("rates").EnumerateArray());
    }

    [Fact]
    public async Task Restoring_the_removed_reserve_goal_resyncs_its_target()
    {
        using var api = Api();
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 500000, emergency_months_target = 6 });
        var goalId = (await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("emergency_goal_id").GetInt64();
        await client.DeleteAsync($"/api/goals/{goalId}");
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 600000 });
        Assert.Equal("removed", (await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("emergency_goal_status").GetString());

        await client.SendJsonAsync(HttpMethod.Post, $"/api/goals/{goalId}/restore");
        Assert.Equal(3600000, (await client.RecordAsync("goals", goalId)).GetProperty("target_cents").GetInt64());
        Assert.Equal("linked", (await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("emergency_goal_status").GetString());

        // Restaurar outra meta qualquer não mexe no alvo dela.
        var trip = await client.CreateAsync("/api/goals", new { name = "Viagem", target_cents = 1234 });
        await client.DeleteAsync($"/api/goals/{trip}");
        await client.SendJsonAsync(HttpMethod.Post, $"/api/goals/{trip}/restore");
        Assert.Equal(1234, (await client.RecordAsync("goals", trip)).GetProperty("target_cents").GetInt64());
    }

    [Fact]
    public async Task Currencies_without_a_saved_rate_are_listed_and_left_out_of_brl_totals()
    {
        using var api = Api();
        var client = api.CreateClient();
        await CurrencyTests.SetRateAsync(client, "BTC", "400000");
        await client.CreateAccountAsync("Real", 100000);
        await client.CreateAsync("/api/bank-accounts", new { name = "Dólar", institution = "Wise", currency = "USD", current_balance_cents = 10000 });
        await client.CreateAsync("/api/investments", new { name = "ETF europeu", currency = "EUR", current_cents = 20000 });
        await client.CreateAsync("/api/investments", new { name = "Bitcoin", type = "crypto", currency = "BTC", current_cents = 500000 });
        await client.CreateAsync("/api/subscriptions", new { name = "App", amount_cents = 500, currency = "GBP" });

        var state = await client.GetJsonAsync("/api/state");
        Assert.Equal(["USD", "EUR", "GBP"], state.GetProperty("missing_rate_currencies").EnumerateArray().Select(item => item.GetString()));
        var report = await client.GetJsonAsync("/api/reports");
        Assert.Equal(["USD", "EUR"], report.GetProperty("missing_rate_currencies").EnumerateArray().Select(item => item.GetString()));
        // Patrimônio em BRL: só o que tem cotação (R$ 1.000 + 0,005 BTC × 400.000 = R$ 2.000).
        var worth = report.GetProperty("net_worth").EnumerateArray().Single();
        Assert.Equal(300000, worth.GetProperty("total_cents").GetInt64());
        var projection = await client.GetJsonAsync("/api/projections/base");
        Assert.Equal(["USD", "EUR", "GBP"], projection.GetProperty("missing_rate_currencies").EnumerateArray().Select(item => item.GetString()));
        Assert.Equal(300000, projection.GetProperty("starting").GetProperty("total_cents").GetInt64());

        await CurrencyTests.SetRateAsync(client, "USD", "5");
        Assert.Equal(["EUR", "GBP"], (await client.GetJsonAsync("/api/state")).GetProperty("missing_rate_currencies").EnumerateArray().Select(item => item.GetString()));
        Assert.Equal(350000, (await client.GetJsonAsync("/api/projections/base")).GetProperty("starting").GetProperty("total_cents").GetInt64());
    }

    private static FinanceApiFactory Api()
    {
        var api = new FinanceApiFactory();
        api.Time.FixedUtcNow = Now;
        return api;
    }
}
