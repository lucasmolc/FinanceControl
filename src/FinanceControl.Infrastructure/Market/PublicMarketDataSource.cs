using System.Globalization;
using System.Text.Json;
using FinanceControl.Application.Contracts;
using FinanceControl.Application.Ports;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Infrastructure.Market;

/// <summary>
/// Cotações e indicadores de APIs públicas sem chave (somente leitura; nenhum dado do usuário é enviado):
/// AwesomeAPI (moedas e cripto, lote fiat e lote cripto; se o lote falhar, par a par), CoinGecko (cripto que a AwesomeAPI
/// não trouxe) e Banco Central SGS (Selic, CDI, IPCA). O <see cref="HttpClient"/> vem do IHttpClientFactory (cliente tipado).
/// </summary>
public sealed class PublicMarketDataSource(HttpClient http) : IMarketDataSource
{
    public const string AwesomeSource = "AwesomeAPI";
    public const string CoinGeckoSource = "CoinGecko";
    public const string CentralBankSource = "Banco Central (SGS)";

    internal const string AwesomeUrl = "https://economia.awesomeapi.com.br/json/last/";
    internal const string CoinGeckoUrl = "https://api.coingecko.com/api/v3/simple/price";
    internal const string SgsUrl = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{0}/dados/ultimos/1?formato=json";

    private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;

    /// <summary>Ids da CoinGecko por código do catálogo.</summary>
    internal static readonly IReadOnlyDictionary<string, string> CoinGeckoIds = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["BTC"] = "bitcoin", ["ETH"] = "ethereum", ["SOL"] = "solana", ["USDT"] = "tether"
    };

    /// <summary>Séries do SGS por código de indicador.</summary>
    internal static readonly (string Code, int Series)[] Indicators = [("selic", 432), ("cdi", 4389), ("ipca_12m", 13522), ("ipca_month", 433)];

    public async Task<MarketFetchResult> FetchAsync(IReadOnlyCollection<string> currencies, CancellationToken cancellationToken)
    {
        var errors = new List<string>();
        var rates = new Dictionary<string, FetchedRate>(StringComparer.Ordinal);
        var wanted = currencies.Where(code => code != Currencies.Base && Currencies.IsSupported(code)).ToList();

        foreach (var kind in new[] { Currencies.Fiat, Currencies.Crypto })
        {
            var batch = wanted.Where(code => Currencies.Find(code)!.Kind == kind).ToList();
            if (batch.Count == 0) continue;
            var fetched = await AwesomeAsync(batch, errors, cancellationToken);
            // Um par desconhecido derruba o lote inteiro: tenta par a par.
            if (fetched is null && batch.Count > 1)
            {
                fetched = [];
                foreach (var code in batch)
                    foreach (var rate in await AwesomeAsync([code], errors, cancellationToken) ?? []) fetched.Add(rate);
            }
            foreach (var rate in fetched ?? []) rates[rate.Currency] = rate;
        }

        var missingCrypto = wanted.Where(code => !rates.ContainsKey(code) && CoinGeckoIds.ContainsKey(code)).ToList();
        if (missingCrypto.Count > 0)
            foreach (var rate in await CoinGeckoAsync(missingCrypto, errors, cancellationToken)) rates[rate.Currency] = rate;

        var indicators = new List<FetchedIndicator>();
        foreach (var (code, series) in Indicators)
            if (await SgsAsync(code, series, errors, cancellationToken) is FetchedIndicator indicator) indicators.Add(indicator);

        return new MarketFetchResult(rates.Values.OrderBy(rate => rate.Currency, StringComparer.Ordinal).ToList(), indicators, errors);
    }

    /// <summary>AwesomeAPI: <c>{ "USDBRL": { "bid": "5.1245", "pctChange": "-0.49", ... } }</c>; null quando a chamada falha.</summary>
    private async Task<List<FetchedRate>?> AwesomeAsync(IReadOnlyList<string> codes, List<string> errors, CancellationToken cancellationToken)
    {
        var url = AwesomeUrl + string.Join(',', codes.Select(code => $"{code}-BRL"));
        using var document = await GetJsonAsync(url, errors, cancellationToken);
        if (document is null || document.RootElement.ValueKind != JsonValueKind.Object) return null;
        var result = new List<FetchedRate>();
        foreach (var code in codes)
        {
            if (!document.RootElement.TryGetProperty($"{code}BRL", out var quote) || quote.ValueKind != JsonValueKind.Object) continue;
            var bid = ReadDecimal(quote, "bid");
            if (bid is not > 0) continue;
            result.Add(new FetchedRate(code, bid.Value, (double?)ReadDecimal(quote, "pctChange"), AwesomeSource));
        }
        return result;
    }

    /// <summary>CoinGecko: <c>{ "bitcoin": { "brl": 396444, "brl_24h_change": 0.64 } }</c>.</summary>
    private async Task<List<FetchedRate>> CoinGeckoAsync(IReadOnlyList<string> codes, List<string> errors, CancellationToken cancellationToken)
    {
        var ids = string.Join(',', codes.Select(code => CoinGeckoIds[code]));
        using var document = await GetJsonAsync($"{CoinGeckoUrl}?ids={ids}&vs_currencies=brl&include_24hr_change=true", errors, cancellationToken);
        var result = new List<FetchedRate>();
        if (document is null || document.RootElement.ValueKind != JsonValueKind.Object) return result;
        foreach (var code in codes)
        {
            if (!document.RootElement.TryGetProperty(CoinGeckoIds[code], out var quote) || quote.ValueKind != JsonValueKind.Object) continue;
            var price = ReadDecimal(quote, "brl");
            if (price is not > 0) continue;
            result.Add(new FetchedRate(code, price.Value, (double?)ReadDecimal(quote, "brl_24h_change"), CoinGeckoSource));
        }
        return result;
    }

    /// <summary>SGS: <c>[{ "data": "dd/MM/yyyy", "valor": "13.75" }]</c> → valor e data de referência AAAA-MM-DD.</summary>
    private async Task<FetchedIndicator?> SgsAsync(string code, int series, List<string> errors, CancellationToken cancellationToken)
    {
        using var document = await GetJsonAsync(string.Format(Invariant, SgsUrl, series), errors, cancellationToken);
        if (document is null || document.RootElement.ValueKind != JsonValueKind.Array || document.RootElement.GetArrayLength() == 0) return null;
        var last = document.RootElement[document.RootElement.GetArrayLength() - 1];
        if (last.ValueKind != JsonValueKind.Object || ReadDecimal(last, "valor") is not decimal value) return null;
        string? reference = null;
        if (last.TryGetProperty("data", out var date) && date.ValueKind == JsonValueKind.String
            && DateOnly.TryParseExact(date.GetString(), "dd/MM/yyyy", Invariant, DateTimeStyles.None, out var parsed))
            reference = parsed.ToString("yyyy-MM-dd", Invariant);
        return new FetchedIndicator(code, (double)value, reference, CentralBankSource);
    }

    private async Task<JsonDocument?> GetJsonAsync(string url, List<string> errors, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await http.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                errors.Add($"{new Uri(url).Host}: HTTP {(int)response.StatusCode}");
                return null;
            }
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            errors.Add($"{new Uri(url).Host}: {exception.GetType().Name}");
            return null;
        }
    }

    /// <summary>Número JSON ou texto com ponto decimal (as APIs usam os dois).</summary>
    private static decimal? ReadDecimal(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value)) return null;
        return value.ValueKind switch
        {
            JsonValueKind.Number when value.TryGetDecimal(out var number) => number,
            JsonValueKind.String when decimal.TryParse(value.GetString(), NumberStyles.Float, Invariant, out var parsed) => parsed,
            _ => null
        };
    }
}
