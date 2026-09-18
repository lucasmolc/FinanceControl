using FinanceControl.Domain.Rules;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Regras puras de ciclo de fatura (MEL-23).</summary>
public sealed class CardInvoiceRulesTests
{
    private static DateOnly D(string iso) => DateOnly.ParseExact(iso, "yyyy-MM-dd");

    [Theory]
    // D ≤ C: fecha no mês anterior ao vencimento.
    [InlineData(25, 5, "2026-10", "2026-08-26", "2026-09-25", "2026-10-05")]
    [InlineData(10, 10, "2026-05", "2026-03-11", "2026-04-10", "2026-05-10")]
    // D > C: fecha no próprio mês do vencimento.
    [InlineData(5, 15, "2026-03", "2026-02-06", "2026-03-05", "2026-03-15")]
    // Dias limitados ao tamanho do mês (fevereiro comum e bissexto).
    [InlineData(31, 10, "2026-03", "2026-02-01", "2026-02-28", "2026-03-10")]
    [InlineData(31, 10, "2026-04", "2026-03-01", "2026-03-31", "2026-04-10")]
    [InlineData(31, 10, "2028-03", "2028-02-01", "2028-02-29", "2028-03-10")]
    [InlineData(30, 31, "2026-02", "2026-01-31", "2026-02-28", "2026-02-28")]
    [InlineData(30, 31, "2026-03", "2026-03-01", "2026-03-30", "2026-03-31")]
    // Virada de ano.
    [InlineData(25, 5, "2027-01", "2026-11-26", "2026-12-25", "2027-01-05")]
    [InlineData(10, 20, "2027-01", "2026-12-11", "2027-01-10", "2027-01-20")]
    public void Cycle_follows_closing_and_due_days(int closing, int due, string month, string start, string closingDate, string dueDate)
    {
        var cycle = CardInvoiceRules.Cycle(closing, due, month);
        Assert.Equal(month, cycle.Month);
        Assert.Equal(D(start), cycle.PeriodStart);
        Assert.Equal(D(closingDate), cycle.ClosingDate);
        Assert.Equal(D(closingDate), cycle.PeriodEnd);
        Assert.Equal(D(dueDate), cycle.DueDate);
    }

    [Theory]
    [InlineData(25, 5, "2026-09-25", "2026-10")]
    [InlineData(25, 5, "2026-09-26", "2026-11")]
    [InlineData(25, 5, "2026-08-26", "2026-10")]
    [InlineData(5, 15, "2026-03-05", "2026-03")]
    [InlineData(5, 15, "2026-03-06", "2026-04")]
    [InlineData(31, 10, "2026-02-28", "2026-03")]
    [InlineData(31, 10, "2026-03-01", "2026-04")]
    [InlineData(30, 31, "2026-01-31", "2026-02")]
    [InlineData(30, 31, "2026-03-01", "2026-03")]
    [InlineData(25, 5, "2026-12-26", "2027-02")]
    [InlineData(25, 5, "2026-12-31", "2027-02")]
    [InlineData(10, 20, "2026-12-15", "2027-01")]
    [InlineData(10, 20, "2026-12-10", "2026-12")]
    public void Purchase_date_belongs_to_the_invoice_whose_period_contains_it(int closing, int due, string date, string expectedMonth) =>
        Assert.Equal(expectedMonth, CardInvoiceRules.CycleFor(closing, due, D(date)).Month);

    [Theory]
    [InlineData(1, 1)]
    [InlineData(25, 5)]
    [InlineData(5, 15)]
    [InlineData(31, 10)]
    [InlineData(30, 31)]
    [InlineData(28, 28)]
    [InlineData(31, 31)]
    public void Periods_are_contiguous_and_every_day_maps_to_exactly_one_invoice(int closing, int due)
    {
        for (var month = new DateOnly(2025, 1, 1); month < new DateOnly(2029, 1, 1); month = month.AddMonths(1))
        {
            var current = CardInvoiceRules.Cycle(closing, due, month.Year, month.Month);
            var next = CardInvoiceRules.Cycle(closing, due, month.AddMonths(1).Year, month.AddMonths(1).Month);
            Assert.Equal(current.ClosingDate.AddDays(1), next.PeriodStart);
            Assert.True(current.ClosingDate <= current.DueDate, $"{current.Month}: fechamento após o vencimento");
        }
        for (var day = new DateOnly(2025, 6, 1); day < new DateOnly(2028, 6, 1); day = day.AddDays(1))
            Assert.True(CardInvoiceRules.CycleFor(closing, due, day).Contains(day), day.ToString("O"));
    }

    [Theory]
    [InlineData("2026-09-18", false, 1000, "aberta")]
    [InlineData("2026-09-25", false, 1000, "aberta")]
    [InlineData("2026-09-26", false, 1000, "fechada")]
    [InlineData("2026-10-05", false, 1000, "fechada")]
    [InlineData("2026-10-06", false, 1000, "vencida")]
    [InlineData("2026-10-06", false, 0, "fechada")]
    [InlineData("2026-10-06", false, -500, "fechada")]
    [InlineData("2026-10-06", true, 1000, "paga")]
    [InlineData("2026-09-01", true, 1000, "paga")]
    public void Status_depends_on_today_payment_and_total(string today, bool paid, long total, string expected) =>
        Assert.Equal(expected, CardInvoiceRules.Status(CardInvoiceRules.Cycle(25, 5, "2026-10"), D(today), paid, total));

    [Theory]
    [InlineData("expense", 1000, 1000)]
    [InlineData("investment", 1000, 1000)]
    [InlineData("income", 1000, -1000)]
    public void Credits_reduce_the_invoice(string kind, long amount, long expected) =>
        Assert.Equal(expected, CardInvoiceRules.SignedAmount(kind, amount));

    [Theory]
    [InlineData(500000, 300000, 100000, 200000L)]
    [InlineData(500000, 0, 100000, 400000L)]
    [InlineData(0, 0, 100000, null)]
    [InlineData(100000, 0, 150000, -50000L)]
    public void Available_limit_uses_the_personal_limit_first(long real, long personal, long unpaid, long? expected) =>
        Assert.Equal(expected, CardInvoiceRules.AvailableLimit(real, personal, unpaid));
}
