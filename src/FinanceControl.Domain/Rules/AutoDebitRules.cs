namespace FinanceControl.Domain.Rules;

/// <summary>Datas de cobrança automática de contas a pagar e assinaturas (débito automático, MEL-29).</summary>
public static class AutoDebitRules
{
    /// <summary>Janela máxima de recuperação de cobranças atrasadas de assinaturas (dias antes de hoje).</summary>
    public const int SubscriptionLookbackDays = 62;

    /// <summary>Vencimento da conta no mês (dia limitado ao tamanho do mês).</summary>
    public static DateOnly BillDueDate(int dueDay, int year, int month) => CardInvoiceRules.ClampedDate(year, month, dueDay);

    /// <summary>
    /// Datas de cobrança da assinatura dentro de [<paramref name="from"/>, <paramref name="to"/>]: mensal no dia de cobrança
    /// (limitado ao mês), anual no mês/dia da próxima cobrança e semanal a cada 7 dias a partir da próxima cobrança.
    /// Anual e semanal sem data de referência não geram cobranças.
    /// </summary>
    public static IReadOnlyList<DateOnly> SubscriptionChargeDates(string frequency, int billingDay, DateOnly? nextBillingDate, DateOnly from, DateOnly to)
    {
        var dates = new List<DateOnly>();
        if (to < from) return dates;
        switch (frequency)
        {
            case "monthly":
                for (var month = new DateOnly(from.Year, from.Month, 1); month <= to; month = month.AddMonths(1))
                    Add(dates, CardInvoiceRules.ClampedDate(month.Year, month.Month, billingDay), from, to);
                break;
            case "yearly" when nextBillingDate is DateOnly anchor:
                for (var year = from.Year; year <= to.Year; year++)
                    Add(dates, CardInvoiceRules.ClampedDate(year, anchor.Month, anchor.Day), from, to);
                break;
            case "weekly" when nextBillingDate is DateOnly anchor:
                var offset = ((from.DayNumber - anchor.DayNumber) % 7 + 7) % 7;
                var first = offset == 0 ? from : from.AddDays(7 - offset);
                for (var date = first; date <= to; date = date.AddDays(7)) dates.Add(date);
                break;
        }
        return dates;
    }

    private static void Add(List<DateOnly> dates, DateOnly date, DateOnly from, DateOnly to)
    {
        if (date >= from && date <= to) dates.Add(date);
    }

    /// <summary>Valor mensal equivalente: anual ÷ 12 e semanal × 52 ÷ 12 (arredondado ao centavo, meio para cima).</summary>
    public static long MonthlyEquivalent(string frequency, long amount) => frequency switch
    {
        "yearly" => (long)Math.Round(amount / 12m, MidpointRounding.AwayFromZero),
        "weekly" => (long)Math.Round(amount * 52m / 12m, MidpointRounding.AwayFromZero),
        _ => amount
    };
}

/// <summary>Reserva de emergência (MEL-43): salário líquido mensal × meses de reserva.</summary>
public static class ReserveRules
{
    public const string Linked = "linked";
    public const string Removed = "removed";
    public const string None = "none";
    public const string DefaultGoalName = "Reserva de emergência";

    public static long Target(long monthlyNetIncomeCents, int months) => monthlyNetIncomeCents > 0 && months > 0 ? monthlyNetIncomeCents * months : 0;
}
