using System.Globalization;

namespace FinanceControl.Domain.Rules;

/// <summary>Ciclo de uma fatura identificada pelo mês de vencimento (<see cref="Month"/>, AAAA-MM).</summary>
public readonly record struct InvoiceCycle(string Month, DateOnly PeriodStart, DateOnly ClosingDate, DateOnly DueDate)
{
    public DateOnly PeriodEnd => ClosingDate;
    public bool Contains(DateOnly date) => date >= PeriodStart && date <= ClosingDate;
}

/// <summary>
/// Regras de fatura de cartão com dia de fechamento C e de vencimento D (ambos limitados ao tamanho do mês).
/// A fatura do mês M vence em D/M e fecha em C/M quando D &gt; C, senão em C/(M−1). A comparação D &gt; C usa os dias
/// configurados (não os limitados), para que a regra seja a mesma em todos os meses. O período vai do dia seguinte ao
/// fechamento anterior até o fechamento; uma compra pertence à fatura cujo período contém a sua data.
/// </summary>
public static class CardInvoiceRules
{
    public const string Open = "aberta";
    public const string Closed = "fechada";
    public const string Overdue = "vencida";
    public const string Paid = "paga";

    public static DateOnly ClampedDate(int year, int month, int day) =>
        new(year, month, Math.Clamp(day, 1, DateTime.DaysInMonth(year, month)));

    public static DateOnly ClosingDate(int closingDay, int dueDay, int year, int month)
    {
        var closingMonth = dueDay > closingDay ? new DateOnly(year, month, 1) : new DateOnly(year, month, 1).AddMonths(-1);
        return ClampedDate(closingMonth.Year, closingMonth.Month, closingDay);
    }

    public static InvoiceCycle Cycle(int closingDay, int dueDay, int year, int month)
    {
        var previous = new DateOnly(year, month, 1).AddMonths(-1);
        return new InvoiceCycle(
            MonthId(year, month),
            ClosingDate(closingDay, dueDay, previous.Year, previous.Month).AddDays(1),
            ClosingDate(closingDay, dueDay, year, month),
            ClampedDate(year, month, dueDay));
    }

    /// <summary>Ciclo pelo mês de vencimento no formato AAAA-MM.</summary>
    public static InvoiceCycle Cycle(int closingDay, int dueDay, string month)
    {
        var first = DateOnly.ParseExact($"{month}-01", "yyyy-MM-dd", CultureInfo.InvariantCulture);
        return Cycle(closingDay, dueDay, first.Year, first.Month);
    }

    /// <summary>Fatura cujo período contém a data. Cada fechamento cai em um mês distinto e cresce mês a mês,
    /// então basta testar o primeiro candidato e, se a data passou do fechamento, o mês seguinte.</summary>
    public static InvoiceCycle CycleFor(int closingDay, int dueDay, DateOnly date)
    {
        var candidate = new DateOnly(date.Year, date.Month, 1);
        if (dueDay <= closingDay) candidate = candidate.AddMonths(1);
        var cycle = Cycle(closingDay, dueDay, candidate.Year, candidate.Month);
        if (date <= cycle.ClosingDate) return cycle;
        var next = candidate.AddMonths(1);
        return Cycle(closingDay, dueDay, next.Year, next.Month);
    }

    /// <summary>paga: há pagamento; aberta: até o fechamento; fechada: após o fechamento até o vencimento (ou sem valor a pagar); vencida: depois do vencimento com valor a pagar.</summary>
    public static string Status(InvoiceCycle cycle, DateOnly today, bool paid, long totalCents) =>
        paid ? Paid : today <= cycle.ClosingDate ? Open : today <= cycle.DueDate || totalCents <= 0 ? Closed : Overdue;

    /// <summary>Valor com sinal na fatura: receitas (estornos/créditos) abatem; despesas e investimentos somam.</summary>
    public static long SignedAmount(string kind, long amountCents) => kind == "income" ? -amountCents : amountCents;

    /// <summary>Limite disponível = limite pessoal (ou o real, quando o pessoal é zero) − faturas não pagas; null sem limite.</summary>
    public static long? AvailableLimit(long realLimitCents, long personalLimitCents, long unpaidInvoicesCents)
    {
        var limit = personalLimitCents > 0 ? personalLimitCents : realLimitCents;
        return limit > 0 ? limit - unpaidInvoicesCents : null;
    }

    public static string MonthId(int year, int month) => $"{year.ToString("D4", CultureInfo.InvariantCulture)}-{month.ToString("D2", CultureInfo.InvariantCulture)}";
}
