using System.Globalization;

namespace FinanceControl.Domain.Rules;

/// <summary>Moeda do catálogo: valores guardados em unidades mínimas (10^<see cref="Decimals"/>) da própria moeda.</summary>
public sealed record CurrencyInfo(string Code, string Name, string Symbol, int Decimals, string Kind);

/// <summary>Catálogo único de moedas (v1.2). A moeda base é o real (BRL), com cotação implícita 1.</summary>
public static class Currencies
{
    public const string Base = "BRL";
    public const string Fiat = "fiat";
    public const string Crypto = "crypto";

    public static readonly IReadOnlyList<CurrencyInfo> All =
    [
        new("BRL", "Real brasileiro", "R$", 2, Fiat),
        new("USD", "Dólar americano", "US$", 2, Fiat),
        new("EUR", "Euro", "€", 2, Fiat),
        new("GBP", "Libra esterlina", "£", 2, Fiat),
        new("JPY", "Iene japonês", "¥", 0, Fiat),
        new("CHF", "Franco suíço", "CHF", 2, Fiat),
        new("CAD", "Dólar canadense", "C$", 2, Fiat),
        new("AUD", "Dólar australiano", "A$", 2, Fiat),
        new("ARS", "Peso argentino", "ARS", 2, Fiat),
        new("BTC", "Bitcoin", "₿", 8, Crypto),
        new("ETH", "Ethereum", "Ξ", 8, Crypto),
        new("SOL", "Solana", "SOL", 8, Crypto),
        new("USDT", "Tether (USDT)", "USDT", 2, Crypto)
    ];

    private static readonly Dictionary<string, CurrencyInfo> ByCode = All.ToDictionary(item => item.Code, StringComparer.Ordinal);

    public static bool IsSupported(string? code) => code is not null && ByCode.ContainsKey(code);
    public static CurrencyInfo? Find(string? code) => code is not null && ByCode.TryGetValue(code, out var info) ? info : null;
    public static int DecimalsOf(string code) => Find(code)?.Decimals ?? 2;

    /// <summary>Moedas com cotação (todas menos a base), na ordem do catálogo.</summary>
    public static IEnumerable<CurrencyInfo> Quoted => All.Where(item => item.Code != Base);
}

/// <summary>Conversão para a moeda base: <c>base = round(minor / 10^dec × cotação × 100)</c>, arredondando o meio para longe do zero.</summary>
public static class CurrencyRules
{
    private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;

    public static long ToBaseCents(long amountMinor, string currency, decimal rateBrl)
    {
        if (currency == Currencies.Base) return amountMinor;
        var scale = Pow10(Currencies.DecimalsOf(currency));
        return (long)Math.Round(amountMinor * rateBrl * 100m / scale, MidpointRounding.AwayFromZero);
    }

    /// <summary>Conversão com cotação conhecida; sem cotação (moeda estrangeira sem valor salvo) devolve null.</summary>
    public static long? ToBaseCents(long amountMinor, string currency, IReadOnlyDictionary<string, decimal> rates) =>
        currency == Currencies.Base ? amountMinor
        : rates.TryGetValue(currency, out var rate) ? ToBaseCents(amountMinor, currency, rate)
        : null;

    /// <summary>Lê uma cotação decimal (ponto ou vírgula como separador); null quando inválida ou não positiva.</summary>
    public static decimal? ParseRate(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var normalized = text.Trim();
        if (normalized.Contains(',') && !normalized.Contains('.')) normalized = normalized.Replace(',', '.');
        return decimal.TryParse(normalized, NumberStyles.AllowDecimalPoint | NumberStyles.AllowLeadingSign, Invariant, out var value) && value > 0 ? value : null;
    }

    /// <summary>Texto canônico da cotação (ponto decimal, até 10 casas, sem zeros à direita).</summary>
    public static string FormatRate(decimal rate) => rate.ToString("0.##########", Invariant);

    private static decimal Pow10(int decimals)
    {
        var value = 1m;
        for (var index = 0; index < decimals; index++) value *= 10m;
        return value;
    }
}
