using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using FinanceControl.Application.Ports;
using FinanceControl.Infrastructure.Market;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Cotações e indicadores (MEL-27): formatos reais das APIs (verificados em 18/09/2026), fallback, cotação manual e modo offline.</summary>
public sealed class MarketTests
{
    private const string Awesome = "https://economia.awesomeapi.com.br/json/last/";
    private const string CoinGecko = "https://api.coingecko.com/api/v3/simple/price";
    private const string Sgs = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.";

    private const string FiatBody = """
        {"USDBRL":{"code":"USD","codein":"BRL","bid":"5.1245","pctChange":"-0.493213","create_date":"2026-09-17 19:30:07"},
         "EURBRL":{"code":"EUR","codein":"BRL","bid":"5.8849","pctChange":"-0.023786"},
         "GBPBRL":{"bid":"6.9"},"JPYBRL":{"bid":"0.0345"},"CHFBRL":{"bid":"6.3"},"CADBRL":{"bid":"3.7"},"AUDBRL":{"bid":"3.4"},"ARSBRL":{"bid":"0.0055","pctChange":"1.2"}}
        """;

    private static void RespondAll(FakeMarketHandler http)
    {
        http.Respond(Awesome + "USD-BRL", FiatBody);
        http.Respond(Awesome + "BTC-BRL", """{"BTCBRL":{"bid":"397795","pctChange":"0.653"},"ETHBRL":{"bid":"12716.95","pctChange":"0.983"},"SOLBRL":{"bid":"533.1"},"USDTBRL":{"bid":"5.12"}}""");
        http.Respond(Sgs + "432/", """[{"data":"04/11/2026","valor":"13.75"}]""");
        http.Respond(Sgs + "4389/", """[{"data":"16/09/2026","valor":"13.90"}]""");
        http.Respond(Sgs + "13522/", """[{"data":"01/08/2026","valor":"4.22"}]""");
        http.Respond(Sgs + "433/", """[{"data":"01/08/2026","valor":"-0.32"}]""");
    }

    [Fact]
    public async Task Refresh_parses_awesomeapi_and_sgs_and_get_returns_the_cache()
    {
        using var api = new FinanceApiFactory();
        api.Time.FixedUtcNow = new DateTimeOffset(2026, 9, 18, 12, 0, 0, TimeSpan.Zero);
        RespondAll(api.Http);
        var client = api.CreateClient();

        var empty = await client.GetJsonAsync("/api/market");
        Assert.Equal("BRL", empty.GetProperty("base").GetString());
        Assert.True(empty.GetProperty("auto_refresh").GetBoolean());
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("last_refresh_at").ValueKind);
        Assert.Empty(empty.GetProperty("rates").EnumerateArray());

        var refreshed = await client.SendJsonAsync(HttpMethod.Post, "/api/market/refresh");
        Assert.Equal(12, refreshed.GetProperty("refreshed").GetProperty("rates").GetInt32());
        Assert.Equal(4, refreshed.GetProperty("refreshed").GetProperty("indicators").GetInt32());
        Assert.Equal(JsonValueKind.Null, refreshed.GetProperty("last_error").ValueKind);
        Assert.StartsWith("2026-09-18T12:00:00", refreshed.GetProperty("last_refresh_at").GetString());

        var market = await client.GetJsonAsync("/api/market");
        var rates = market.GetProperty("rates").EnumerateArray().ToList();
        Assert.Equal(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "ARS", "BTC", "ETH", "SOL", "USDT"], rates.Select(rate => rate.GetProperty("currency").GetString()));
        var usd = rates[0];
        Assert.Equal("5.1245", usd.GetProperty("rate_brl").GetString());
        Assert.Equal(-0.493213, usd.GetProperty("change_pct").GetDouble(), 6);
        Assert.Equal("AwesomeAPI", usd.GetProperty("source").GetString());
        Assert.False(usd.GetProperty("manual").GetBoolean());
        Assert.False(usd.GetProperty("stale").GetBoolean());
        Assert.Equal(JsonValueKind.Null, rates[2].GetProperty("change_pct").ValueKind);

        var indicators = market.GetProperty("indicators").EnumerateArray().ToList();
        Assert.Equal(["selic", "cdi", "ipca_12m", "ipca_month"], indicators.Select(item => item.GetProperty("code").GetString()));
        Assert.Equal(13.75, indicators[0].GetProperty("value").GetDouble());
        Assert.Equal("% a.a.", indicators[0].GetProperty("unit").GetString());
        Assert.Equal("Selic", indicators[0].GetProperty("label").GetString());
        // CR-23: a meta Selic vem datada na próxima reunião do Copom; a referência nunca passa de hoje.
        Assert.Equal("2026-09-18", indicators[0].GetProperty("reference_date").GetString());
        Assert.Equal("2026-09-16", indicators[1].GetProperty("reference_date").GetString());
        Assert.Equal("% em 12 meses", indicators[2].GetProperty("unit").GetString());
        Assert.Equal("% no mês", indicators[3].GetProperty("unit").GetString());
        Assert.Equal(-0.32, indicators[3].GetProperty("value").GetDouble());
        Assert.Equal("Banco Central (SGS)", indicators[1].GetProperty("source").GetString());

        // Mais de 24 h depois os valores ficam marcados como desatualizados.
        api.Time.FixedUtcNow = new DateTimeOffset(2026, 9, 19, 12, 0, 1, TimeSpan.Zero);
        var later = await client.GetJsonAsync("/api/market");
        Assert.True(later.GetProperty("rates")[0].GetProperty("stale").GetBoolean());
        Assert.True(later.GetProperty("indicators")[0].GetProperty("stale").GetBoolean());
    }

    [Fact]
    public async Task Failed_batch_falls_back_pair_by_pair_and_missing_crypto_comes_from_coingecko()
    {
        var http = new FakeMarketHandler();
        // O lote fiat falha como na API real com um par desconhecido; cada par sozinho responde.
        http.Respond(Awesome + "USD-BRL,", """{"status":404,"code":"CoinNotExists","message":"moeda nao encontrada"}""", HttpStatusCode.NotFound);
        foreach (var code in new[] { "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "ARS" })
            http.Respond($"{Awesome}{code}-BRL", "{\"" + code + "BRL\":{\"bid\":\"2.5\",\"pctChange\":\"0.1\"}}");
        http.Respond(Awesome + "USD-BRL", """{"USDBRL":{"bid":"5.2"}}""");
        http.Respond(Awesome + "BTC-BRL", """{"BTCBRL":{"bid":"397795","pctChange":"0.65"}}""");
        http.Respond(CoinGecko, """{"ethereum":{"brl":12675.04,"brl_24h_change":1.0082},"solana":{"brl":533.62},"tether":{"brl":5.12,"brl_24h_change":-0.53}}""");

        var source = new PublicMarketDataSource(new HttpClient(http));
        var result = await source.FetchAsync(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "ARS", "BTC", "ETH", "SOL", "USDT"], CancellationToken.None);

        var rates = result.Rates.ToDictionary(rate => rate.Currency);
        Assert.Equal(12, rates.Count);
        Assert.Equal(5.2m, rates["USD"].RateBrl);
        Assert.Equal("AwesomeAPI", rates["EUR"].Source);
        Assert.Equal(397795m, rates["BTC"].RateBrl);
        Assert.Equal("CoinGecko", rates["ETH"].Source);
        Assert.Equal(12675.04m, rates["ETH"].RateBrl);
        Assert.Equal(1.0082, rates["ETH"].ChangePct!.Value, 4);
        Assert.Null(rates["SOL"].ChangePct);
        Assert.Contains(http.Requests, url => url.StartsWith(CoinGecko, StringComparison.Ordinal) && url.Contains("ids=ethereum,solana,tether", StringComparison.Ordinal));
        Assert.Empty(result.Indicators);
        Assert.NotEmpty(result.Errors);
    }

    [Fact]
    public async Task Total_failure_keeps_the_cache_and_reports_the_error()
    {
        using var api = new FinanceApiFactory();
        api.Time.FixedUtcNow = new DateTimeOffset(2026, 9, 18, 12, 0, 0, TimeSpan.Zero);
        RespondAll(api.Http);
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Post, "/api/market/refresh");

        api.Http.Reset(); // offline: todas as chamadas respondem 503
        api.Time.FixedUtcNow = new DateTimeOffset(2026, 9, 18, 18, 0, 0, TimeSpan.Zero);
        var offline = await client.SendJsonAsync(HttpMethod.Post, "/api/market/refresh");
        Assert.Equal("Não foi possível atualizar as cotações agora. Os últimos valores salvos continuam valendo.", offline.GetProperty("last_error").GetString());
        Assert.Equal(0, offline.GetProperty("refreshed").GetProperty("rates").GetInt32());
        Assert.StartsWith("2026-09-18T12:00:00", offline.GetProperty("last_refresh_at").GetString());
        Assert.Equal("5.1245", offline.GetProperty("rates")[0].GetProperty("rate_brl").GetString());
        Assert.Equal(4, offline.GetProperty("indicators").GetArrayLength());

        // Transações em moeda estrangeira continuam usando o último valor salvo.
        var id = await client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-09-18", description = "Compra", kind = "expense", amount_cents = 1000, currency = "USD" });
        Assert.Equal(5125, (await client.GetJsonAsync("/api/transactions")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == id).GetProperty("base_amount_cents").GetInt64());

        RespondAll(api.Http);
        var recovered = await client.SendJsonAsync(HttpMethod.Post, "/api/market/refresh");
        Assert.Equal(JsonValueKind.Null, recovered.GetProperty("last_error").ValueKind);
    }

    [Fact]
    public async Task Manual_rates_are_not_overwritten_until_cleared()
    {
        using var api = new FinanceApiFactory();
        RespondAll(api.Http);
        var client = api.CreateClient();

        var manual = await client.SendJsonAsync(HttpMethod.Put, "/api/market/rates/usd", new { rate_brl = 5.5 });
        var usd = manual.GetProperty("rates").EnumerateArray().Single();
        Assert.Equal("5.5", usd.GetProperty("rate_brl").GetString());
        Assert.True(usd.GetProperty("manual").GetBoolean());
        Assert.Equal("Manual", usd.GetProperty("source").GetString());

        var refreshed = await client.SendJsonAsync(HttpMethod.Post, "/api/market/refresh");
        Assert.Equal(11, refreshed.GetProperty("refreshed").GetProperty("rates").GetInt32());
        Assert.Equal("5.5", Rate(refreshed, "USD").GetProperty("rate_brl").GetString());

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/market/rates/USD")).StatusCode);
        var cleared = Rate(await client.GetJsonAsync("/api/market"), "USD");
        Assert.False(cleared.GetProperty("manual").GetBoolean());
        Assert.Equal("5.5", cleared.GetProperty("rate_brl").GetString()); // mantém o valor até a próxima atualização
        Assert.Equal("5.1245", Rate(await client.SendJsonAsync(HttpMethod.Post, "/api/market/refresh"), "USD").GetProperty("rate_brl").GetString());
    }

    [Fact]
    public async Task Manual_rate_inputs_are_validated()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        Assert.Equal("O real é a moeda base e não tem cotação.", await (await client.PutAsJsonAsync("/api/market/rates/BRL", new { rate_brl = "1" })).AssertValidationAsync("currency"));
        await (await client.PutAsJsonAsync("/api/market/rates/XYZ", new { rate_brl = "1" })).AssertNotFoundAsync();
        Assert.Equal("Informe uma cotação maior que zero.", await (await client.PutAsJsonAsync("/api/market/rates/EUR", new { rate_brl = "-2" })).AssertValidationAsync("rate_brl"));
        Assert.Equal("Informe uma cotação maior que zero.", await (await client.PutAsJsonAsync("/api/market/rates/EUR", new { rate_brl = true })).AssertValidationAsync("rate_brl"));
        Assert.Equal("Campo obrigatório.", await (await client.PutAsJsonAsync("/api/market/rates/EUR", new { })).AssertValidationAsync("rate_brl"));
        await (await client.DeleteAsync("/api/market/rates/EUR")).AssertNotFoundAsync();
    }

    [Fact]
    public async Task Background_refresh_respects_the_auto_refresh_setting()
    {
        using var api = new FinanceApiFactory();
        RespondAll(api.Http);
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { market_auto_refresh = false });
        Assert.False((await client.GetJsonAsync("/api/market")).GetProperty("auto_refresh").GetBoolean());
        Assert.False((await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("market_auto_refresh").GetBoolean());

        using (var scope = api.Services.CreateScope())
            Assert.False(await scope.ServiceProvider.GetRequiredService<IFinanceUseCases>().RefreshMarketIfEnabledAsync());
        Assert.Empty(api.Http.Requests);

        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { market_auto_refresh = true });
        using (var scope = api.Services.CreateScope())
            Assert.True(await scope.ServiceProvider.GetRequiredService<IFinanceUseCases>().RefreshMarketIfEnabledAsync());
        Assert.Equal(12, (await client.GetJsonAsync("/api/market")).GetProperty("rates").GetArrayLength());
    }

    private static JsonElement Rate(JsonElement market, string currency) =>
        market.GetProperty("rates").EnumerateArray().Single(rate => rate.GetProperty("currency").GetString() == currency);
}
