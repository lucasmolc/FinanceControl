using System.Globalization;
using System.Text;

namespace FinanceControl.Domain.Rules;

/// <summary>Plano 70-20-10 (MEL-45): baldes de categorias, limites do mês e número da liberdade (salário × multiplicador).</summary>
public static class PlanRules
{
    public const string Fixed = "fixo";
    public const string Fun = "lazer";
    public const string Invest = "investimento";
    public const string Outside = "fora";

    /// <summary>Valores aceitos em <c>categories.bucket</c> (null = sem balde).</summary>
    public static readonly IReadOnlySet<string> Buckets = new HashSet<string>([Fixed, Fun, Invest, Outside], StringComparer.Ordinal);

    public const int DefaultFreedomMultiplier = 150;
    public const int MaxFreedomMultiplier = 600;
    public const string FreedomGoalName = "Número da liberdade";
    public const string FreedomGoalType = "retirement";

    /// <summary>Nomes de metas de aposentadoria religadas como número da liberdade (comparação sem caixa e sem acentos).</summary>
    public static readonly IReadOnlyList<string> FreedomGoalNames = [FreedomGoalName, "Independência financeira"];

    /// <summary>Categorias-balde criadas por <c>POST /api/plan</c> com <c>create_buckets</c>: nome, tipo e balde.</summary>
    public static readonly IReadOnlyList<(string Name, string Kind, string Bucket)> BucketCategories =
    [
        ("Gastos fixos", "expense", Fixed),
        ("Lazer", "expense", Fun),
        ("Investimentos", "investment", Invest)
    ];

    /// <summary>Parte do salário: <c>round(salário × pct / 100)</c>, meio centavo para longe do zero.</summary>
    public static long Share(long monthlyNetIncomeCents, int pct) =>
        monthlyNetIncomeCents <= 0 || pct <= 0 ? 0 : (long)Math.Round(monthlyNetIncomeCents * (decimal)pct / 100m, MidpointRounding.AwayFromZero);

    /// <summary>Número da liberdade = salário líquido × multiplicador (150 por padrão).</summary>
    public static long FreedomTarget(long monthlyNetIncomeCents, int multiplier) =>
        monthlyNetIncomeCents > 0 && multiplier > 0 ? monthlyNetIncomeCents * multiplier : 0;

    /// <summary>Percentuais válidos: todos entre 0 e 100 e somando exatamente 100.</summary>
    public static bool IsValidSplit(long fixedPct, long funPct, long investPct) =>
        fixedPct is >= 0 and <= 100 && funPct is >= 0 and <= 100 && investPct is >= 0 and <= 100 && fixedPct + funPct + investPct == 100;

    /// <summary>Nome comparável: aparado, minúsculo, sem acentos e com espaços simples.</summary>
    public static string NormalizeName(string name)
    {
        var decomposed = name.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        var lastWasSpace = false;
        foreach (var character in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark) continue;
            var isSpace = char.IsWhiteSpace(character);
            if (isSpace && lastWasSpace) continue;
            builder.Append(isSpace ? ' ' : character);
            lastWasSpace = isSpace;
        }
        return builder.ToString().Normalize(NormalizationForm.FormC);
    }

    public static bool IsFreedomGoalName(string name)
    {
        var normalized = NormalizeName(name);
        return FreedomGoalNames.Any(candidate => NormalizeName(candidate) == normalized);
    }
}
