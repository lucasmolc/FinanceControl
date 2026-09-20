namespace FinanceControl.Domain.Rules;

/// <summary>Uma parcela da série: posição (1..total), data e valor em unidades mínimas da moeda.</summary>
public readonly record struct Installment(int Number, DateOnly Date, long AmountCents);

/// <summary>
/// Compra parcelada: a mesma compra vira uma parcela por mês, para trás e para frente a partir da parcela informada
/// (ex.: "6/10" lançada hoje coloca 5 parcelas em meses anteriores e 4 em meses seguintes).
/// O usuário informa o valor de uma parcela ou o valor total; o outro é derivado.
/// </summary>
public static class InstallmentRules
{
    public const int MinCount = 2;
    public const int MaxCount = 72;

    public static bool IsValidCount(int count) => count is >= MinCount and <= MaxCount;
    public static bool IsValidNumber(int number, int count) => number >= 1 && number <= count;
    /// <summary>Cada parcela precisa de pelo menos um centavo (o valor de um lançamento é sempre maior que zero).</summary>
    public static bool FitsTotal(long totalCents, int count) => totalCents >= count;

    public static long TotalOf(long perInstallmentCents, int count) => perInstallmentCents * count;

    /// <summary>
    /// Valor da parcela ao dividir o total: base = total ÷ parcelas e o resto é distribuído um centavo por parcela,
    /// começando pela primeira (como fazem as administradoras). A soma das parcelas fecha exatamente o total.
    /// </summary>
    public static long AmountOf(long totalCents, int count, int number)
    {
        var quotient = Math.DivRem(totalCents, count, out var remainder);
        return quotient + (number <= remainder ? 1 : 0);
    }

    /// <summary>
    /// Data da parcela <paramref name="number"/> a partir da data da parcela <paramref name="anchorNumber"/>: mesmo dia
    /// do mês, deslocado pela diferença de parcelas e limitado ao tamanho do mês (31/01 → 28/02 → 31/03).
    /// </summary>
    public static DateOnly DateOf(DateOnly anchorDate, int anchorNumber, int number)
    {
        var month = new DateOnly(anchorDate.Year, anchorDate.Month, 1).AddMonths(number - anchorNumber);
        return CardInvoiceRules.ClampedDate(month.Year, month.Month, anchorDate.Day);
    }

    /// <summary>Série completa (parcela 1 até <paramref name="count"/>) em ordem, a partir da parcela informada.</summary>
    public static IReadOnlyList<Installment> Series(DateOnly anchorDate, int anchorNumber, int count, long totalCents) =>
        Enumerable.Range(1, count)
            .Select(number => new Installment(number, DateOf(anchorDate, anchorNumber, number), AmountOf(totalCents, count, number)))
            .ToList();

    /// <summary>Sufixo usado na descrição de cada parcela, no formato das faturas ("6/10").</summary>
    public static string Label(int number, int count) => $"{number}/{count}";
}
