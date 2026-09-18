using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Application.Validation;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.UseCases;

/// <summary>Cotações de moedas/cripto e indicadores (MEL-27): cache no banco, atualização manual/automática e cotação manual.</summary>
public sealed partial class FinanceService
{
    public const string ManualSource = "Manual";
    private static readonly TimeSpan StaleAfter = TimeSpan.FromHours(24);

    /// <summary>Indicadores exibidos: código → (rótulo, unidade), na ordem da tela.</summary>
    private static readonly (string Code, string Label, string Unit)[] IndicatorCatalog =
    [
        ("selic", "Selic", "% a.a."),
        ("cdi", "CDI", "% a.a."),
        ("ipca_12m", "IPCA (12 meses)", "% em 12 meses"),
        ("ipca_month", "IPCA (mês)", "% no mês")
    ];

    public MarketSnapshot GetMarket()
    {
        var status = store.GetMarketStatus();
        var now = timeProvider.GetUtcNow();
        var rates = store.ListExchangeRates().ToDictionary(rate => rate.Currency, StringComparer.Ordinal);
        var indicators = store.ListMarketIndicators().ToDictionary(indicator => indicator.Code, StringComparer.Ordinal);
        return new MarketSnapshot(
            Currencies.Base,
            status.AutoRefresh,
            status.LastRefreshAt,
            status.LastError,
            Currencies.Quoted.Where(currency => rates.ContainsKey(currency.Code)).Select(currency => rates[currency.Code])
                .Select(rate => new MarketRateView(rate.Currency, rate.RateBrl, rate.ChangePct, rate.Source, rate.FetchedAt, rate.Manual, !rate.Manual && IsStale(rate.FetchedAt, now)))
                .ToList(),
            IndicatorCatalog.Where(item => indicators.ContainsKey(item.Code))
                .Select(item => (Meta: item, Value: indicators[item.Code]))
                .Select(item => new MarketIndicatorView(item.Meta.Code, item.Meta.Label, item.Value.Value, item.Meta.Unit, NotAfterToday(item.Value.ReferenceDate), item.Value.Source, item.Value.FetchedAt, IsStale(item.Value.FetchedAt, now)))
                .ToList());
    }

    public async Task<MarketSnapshot> RefreshMarketAsync(CancellationToken cancellationToken = default)
    {
        MarketFetchResult fetched;
        try
        {
            fetched = await marketData.FetchAsync(Currencies.Quoted.Select(currency => currency.Code).ToList(), cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            fetched = new MarketFetchResult([], [], [exception.Message]);
        }

        var now = timeProvider.GetUtcNow().ToString("O", Invariant);
        var counts = store.SaveMarketData(
            fetched.Rates.Where(rate => Currencies.IsSupported(rate.Currency) && rate.Currency != Currencies.Base && rate.RateBrl > 0)
                .Select(rate => new ExchangeRate { Currency = rate.Currency, RateBrl = CurrencyRules.FormatRate(rate.RateBrl), ChangePct = rate.ChangePct, Source = rate.Source, FetchedAt = now })
                .ToList(),
            fetched.Indicators.Where(indicator => IndicatorCatalog.Any(item => item.Code == indicator.Code))
                .Select(indicator => new MarketIndicator { Code = indicator.Code, Value = indicator.Value, ReferenceDate = NotAfterToday(indicator.ReferenceDate), Source = indicator.Source, FetchedAt = now })
                .ToList());

        // Falha total: mantém o cache e a data da última atualização, registrando o aviso.
        var anyFetched = fetched.Rates.Count > 0 || fetched.Indicators.Count > 0;
        store.SetMarketRefreshResult(anyFetched ? now : null, anyFetched ? null : Messages.MarketRefreshFailed);
        return GetMarket() with { Refreshed = counts };
    }

    public async Task<bool> RefreshMarketIfEnabledAsync(CancellationToken cancellationToken = default)
    {
        if (!store.GetMarketStatus().AutoRefresh) return false;
        await RefreshMarketAsync(cancellationToken);
        return true;
    }

    public OperationResult<MarketSnapshot> SetManualRate(string currency, RecordData data)
    {
        var code = currency.Trim().ToUpperInvariant();
        if (!Currencies.IsSupported(code)) return OperationResult<MarketSnapshot>.NotFound();
        if (code == Currencies.Base) return OperationResult<MarketSnapshot>.Invalid("currency", Messages.BaseCurrencyRate);
        var validated = InputValidator.Validate(ModuleSchemas.ManualRate, data.Values, ValidationMode.Create);
        if (!validated.IsSuccess) return validated.Failure<MarketSnapshot>();
        store.SetManualRate(code, validated.Value!.Text("rate_brl")!, timeProvider.GetUtcNow().ToString("O", Invariant));
        return OperationResult<MarketSnapshot>.Success(GetMarket());
    }

    public OperationResult<bool> ClearManualRate(string currency)
    {
        var code = currency.Trim().ToUpperInvariant();
        if (!Currencies.IsSupported(code)) return OperationResult<bool>.NotFound();
        if (code == Currencies.Base) return OperationResult<bool>.Invalid("currency", Messages.BaseCurrencyRate);
        return store.ClearManualRate(code) ? OperationResult<bool>.Success(true) : OperationResult<bool>.NotFound();
    }

    /// <summary>
    /// CR-23: a data de referência nunca é futura. A série 432 do SGS (meta Selic) publica a meta vigente com datas até a próxima
    /// reunião do Copom; datas posteriores a hoje (local) viram hoje, a data em que o valor está valendo.
    /// </summary>
    private string? NotAfterToday(string? referenceDate) =>
        referenceDate is not null && string.CompareOrdinal(referenceDate, Iso(Today)) > 0 ? Iso(Today) : referenceDate;

    private static bool IsStale(string fetchedAt, DateTimeOffset now) =>
        !DateTimeOffset.TryParse(fetchedAt, Invariant, System.Globalization.DateTimeStyles.AssumeUniversal, out var at) || now - at > StaleAfter;
}
