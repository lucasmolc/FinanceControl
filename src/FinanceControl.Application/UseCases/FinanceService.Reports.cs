using System.Globalization;
using System.Text;
using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.UseCases;

/// <summary>Relatórios, exportação CSV, base das projeções, patrimônio mensal e gráficos do resumo (MEL-31/32/38).</summary>
public sealed partial class FinanceService
{
    private const int DefaultReportMonths = 6;
    private const int TopExpensesCount = 10;
    private const string Uncategorized = "Sem categoria";
    private static readonly CultureInfo PtBr = CultureInfo.GetCultureInfo("pt-BR");

    // ---------- Relatórios ----------

    public OperationResult<FinanceReport> GetReport(string? from, string? to)
    {
        var range = ReportRange(from, to);
        if (!range.IsSuccess) return range.Failure<FinanceReport>();
        var (start, end) = range.Value;
        var months = MonthsBetween(start, end);
        var transactions = store.ListReportTransactions(Iso(start), Iso(end.AddMonths(1)));
        RecordNetWorthSnapshot();

        var monthly = months.Select(month =>
        {
            var items = transactions.Where(item => item.Date.StartsWith(month, StringComparison.Ordinal)).ToList();
            var income = Sum(items, "income");
            var expense = Sum(items, "expense");
            var investment = Sum(items, "investment");
            var plan = SpendByBucket(items);
            return new ReportMonth(month, income, expense, investment, income - expense - investment,
                plan.Fixed, plan.Fun, plan.Invested, plan.Unbucketed, plan.Outside);
        }).ToList();

        var totalIncome = monthly.Sum(item => item.IncomeCents);
        var totalExpense = monthly.Sum(item => item.ExpenseCents);
        var totalInvestment = monthly.Sum(item => item.InvestmentCents);
        var totals = new ReportTotals(
            totalIncome, totalExpense, totalInvestment, totalIncome - totalExpense - totalInvestment,
            Average(totalIncome, months.Count), Average(totalExpense, months.Count),
            totalIncome == 0 ? null : Math.Round((totalIncome - totalExpense) * 100.0 / totalIncome, 1, MidpointRounding.AwayFromZero));

        var paymentMethods = PaymentMethodTotals(transactions);

        var snapshots = store.ListNetWorthSnapshots(months[0], months[^1])
            .Select(item => new NetWorthPoint(item.Month, item.TotalCents, item.BankCents, item.InvestmentsCents)).ToList();

        return OperationResult<FinanceReport>.Success(new FinanceReport(
            months[0], months[^1], monthly, totals,
            CategoryShares(transactions, "expense"), CategoryShares(transactions, "income"),
            paymentMethods, TopExpenses(transactions), snapshots, CurrencyExposureNow())
        {
            MissingRateCurrencies = MissingRates(store.ListHoldings().Select(item => item.Currency), LatestRates())
        });
    }

    public OperationResult<CsvExport> ExportTransactionsCsv(string? from, string? to)
    {
        var range = ReportRange(from, to);
        if (!range.IsSuccess) return range.Failure<CsvExport>();
        var (start, end) = range.Value;
        var transactions = store.ListReportTransactions(Iso(start), Iso(end.AddMonths(1)));
        var csv = new StringBuilder();
        csv.Append("Data;Descrição;Tipo;Categoria;Forma de pagamento;Conta;Moeda;Valor;Valor em BRL;Observações\r\n");
        foreach (var item in transactions)
        {
            var date = DateOnly.ParseExact(item.Date, "yyyy-MM-dd", Invariant).ToString("dd/MM/yyyy", Invariant);
            csv.AppendJoin(';',
                date,
                CsvText(item.Description),
                KindLabel(item.Kind),
                CsvText(item.CategoryName ?? ""),
                PaymentLabel(item.PaymentMethod),
                CsvText(item.AccountName ?? item.CardName ?? ""),
                item.Currency,
                FormatMinor(item.AmountCents, Currencies.DecimalsOf(item.Currency)),
                FormatMinor(item.BaseAmountCents, 2),
                CsvText(item.Notes ?? ""));
            csv.Append("\r\n");
        }
        var fromId = start.ToString("yyyy-MM", Invariant);
        var toId = end.ToString("yyyy-MM", Invariant);
        return OperationResult<CsvExport>.Success(new CsvExport($"lmm-lancamentos-{fromId}-a-{toId}.csv", csv.ToString()));
    }

    // ---------- Projeções ----------

    public ProjectionBase GetProjectionBase()
    {
        var settings = store.GetSettings();
        var rates = LatestRates();
        var worth = RecordNetWorthSnapshot();
        var firstOfMonth = new DateOnly(Today.Year, Today.Month, 1);
        var history = store.ListReportTransactions(Iso(firstOfMonth.AddMonths(-6)), Iso(firstOfMonth));
        long AverageOf(string kind, int months) =>
            Average(history.Where(item => item.Kind == kind && string.CompareOrdinal(item.Date, Iso(firstOfMonth.AddMonths(-months))) >= 0).Sum(item => item.BaseAmountCents), months);

        var rawState = store.GetState();
        var state = rawState with { Goals = WithFreedomProgress(rawState.Goals, rawState.Settings.WithFreedomProgress(worth.InvestmentsCents)) };
        var billsMonthly = state.Bills.Sum(bill => CurrencyRules.ToBaseCents(bill.AmountCents, bill.Currency, rates) ?? 0);
        var subscriptionsMonthly = state.Subscriptions.Sum(subscription =>
            CurrencyRules.ToBaseCents(AutoDebitRules.MonthlyEquivalent(subscription.Frequency, subscription.AmountCents), subscription.Currency, rates) ?? 0);
        var indicators = store.ListMarketIndicators().ToDictionary(item => item.Code, item => (double?)item.Value, StringComparer.Ordinal);

        return new ProjectionBase(
            Iso(Today),
            Currencies.Base,
            new ProjectionStarting(worth.BankCents, worth.InvestmentsCents, worth.TotalCents),
            new ProjectionIncome(settings.MonthlyNetIncomeCents, AverageOf("income", 3), AverageOf("income", 6)),
            new ProjectionExpenses(settings.MonthlySpendingLimitCents, billsMonthly, subscriptionsMonthly, AverageOf("expense", 3), AverageOf("expense", 6)),
            AverageOf("investment", 3),
            new ProjectionIndicators(indicators.GetValueOrDefault("selic"), indicators.GetValueOrDefault("cdi"), indicators.GetValueOrDefault("ipca_12m")),
            state.Goals.Select(goal => new ProjectionGoal(goal.Id, goal.Name, goal.TargetCents, goal.CurrentCents, goal.Currency,
                CurrencyRules.ToBaseCents(goal.TargetCents, goal.Currency, rates) ?? 0, CurrencyRules.ToBaseCents(goal.CurrentCents, goal.Currency, rates) ?? 0, goal.TargetDate)).ToList(),
            new ProjectionEmergency(settings.EmergencyMonthsTarget, settings.MonthlySpendingLimitCents, ReserveRules.Target(settings.MonthlyNetIncomeCents, settings.EmergencyMonthsTarget)),
            settings.HasPlan ? new ProjectionPlan(settings.PlanFixedPct!.Value, settings.PlanFunPct!.Value, settings.PlanInvestPct!.Value, settings.FreedomMultiplier) : null,
            settings.FreedomTargetCents)
        {
            MissingRateCurrencies = MissingRates(state, rates),
            FreedomProgressCents = worth.InvestmentsCents
        };
    }

    // ---------- Patrimônio ----------

    /// <summary>Patrimônio atual em BRL (contas + investimentos ativos, convertidos pela última cotação) gravado no mês atual.</summary>
    private NetWorthSnapshot RecordNetWorthSnapshot()
    {
        var rates = LatestRates();
        var holdings = store.ListHoldings();
        var bank = holdings.Where(item => item.Kind == "bank").Sum(item => CurrencyRules.ToBaseCents(item.NativeCents, item.Currency, rates) ?? 0);
        var investments = holdings.Where(item => item.Kind == "investment").Sum(item => CurrencyRules.ToBaseCents(item.NativeCents, item.Currency, rates) ?? 0);
        var snapshot = new NetWorthSnapshot(CurrentMonth, bank, investments, bank + investments);
        store.UpsertNetWorthSnapshot(snapshot, timeProvider.GetUtcNow().ToString("O", Invariant));
        return snapshot;
    }

    /// <summary>Contas e investimentos ativos por moeda (BRL incluído), com o valor nativo e o convertido.</summary>
    private List<CurrencyExposure> CurrencyExposureNow()
    {
        var rates = LatestRates();
        var groups = store.ListHoldings().GroupBy(item => item.Currency, StringComparer.Ordinal)
            .Select(group => (Currency: group.Key, Native: group.Sum(item => item.NativeCents), Base: CurrencyRules.ToBaseCents(group.Sum(item => item.NativeCents), group.Key, rates) ?? 0))
            .ToList();
        var total = groups.Sum(item => item.Base);
        return groups
            .OrderBy(item => Currencies.All.ToList().FindIndex(currency => currency.Code == item.Currency))
            .Select(item => new CurrencyExposure(item.Currency, item.Native, item.Base, Share(item.Base, total)))
            .ToList();
    }

    // ---------- Resumo do mês (MEL-38) ----------

    /// <summary>
    /// Acrescenta ao resumo as 10 maiores despesas, o gasto por dia (até hoje no mês atual; o mês inteiro nos anteriores; nenhum dia
    /// nos futuros), as despesas por forma de pagamento e o plano 70-20-10 do mês (null sem plano).
    /// </summary>
    private MonthlySummary WithDailyAndTopExpenses(MonthlySummary summary, string month)
    {
        var first = DateOnly.ParseExact($"{month}-01", "yyyy-MM-dd", Invariant);
        var transactions = store.ListReportTransactions(Iso(first), Iso(first.AddMonths(1)));
        var lastDay = string.CompareOrdinal(month, CurrentMonth) switch
        {
            < 0 => first.AddMonths(1).AddDays(-1),
            0 => Today,
            _ => first.AddDays(-1)
        };
        var byDay = transactions.Where(item => item.Kind == "expense").GroupBy(item => item.Date, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Sum(item => item.BaseAmountCents), StringComparer.Ordinal);
        var daily = new List<DailyExpense>();
        for (var day = first; day <= lastDay; day = day.AddDays(1)) daily.Add(new DailyExpense(Iso(day), byDay.GetValueOrDefault(Iso(day))));
        return summary with
        {
            TopExpenses = TopExpenses(transactions),
            DailyExpenses = daily,
            Plan = BuildPlanSummary(store.GetSettings(), transactions),
            PaymentMethods = PaymentMethodTotals(transactions)
        };
    }

    // ---------- Auxiliares ----------

    /// <summary>Período padrão: os últimos 6 meses incluindo o atual. Só <c>from</c> vai até o mês atual; só <c>to</c> volta 5 meses.</summary>
    private OperationResult<(DateOnly Start, DateOnly End)> ReportRange(string? from, string? to)
    {
        from = string.IsNullOrWhiteSpace(from) ? null : from.Trim();
        to = string.IsNullOrWhiteSpace(to) ? null : to.Trim();
        if (from is not null && !IsInvoiceMonth(from)) return OperationResult<(DateOnly, DateOnly)>.Invalid("from", Messages.Month);
        if (to is not null && !IsInvoiceMonth(to)) return OperationResult<(DateOnly, DateOnly)>.Invalid("to", Messages.Month);
        var current = new DateOnly(Today.Year, Today.Month, 1);
        var end = to is null ? current : FirstDay(to);
        var start = from is null ? end.AddMonths(1 - DefaultReportMonths) : FirstDay(from);
        if (end < start) return OperationResult<(DateOnly, DateOnly)>.Invalid("to", Messages.MonthRangeOrder);
        if ((end.Year - start.Year) * 12 + end.Month - start.Month + 1 > MaxInvoiceRange) return OperationResult<(DateOnly, DateOnly)>.Invalid("to", Messages.MonthRangeSize);
        return OperationResult<(DateOnly, DateOnly)>.Success((start, end));
    }

    private static List<string> MonthsBetween(DateOnly start, DateOnly end)
    {
        var months = new List<string>();
        for (var month = start; month <= end; month = month.AddMonths(1)) months.Add(month.ToString("yyyy-MM", Invariant));
        return months;
    }

    private static long Sum(IEnumerable<ReportTransaction> items, string kind) => items.Where(item => item.Kind == kind).Sum(item => item.BaseAmountCents);
    private static long Average(long total, int count) => count <= 0 ? 0 : (long)Math.Round((decimal)total / count, MidpointRounding.AwayFromZero);
    private static double Share(long part, long total) => total <= 0 ? 0 : Math.Round(part * 100.0 / total, 1, MidpointRounding.AwayFromZero);

    /// <summary>Total por categoria do tipo (categoria de outro tipo ou ausente = "Sem categoria", como no resumo), valor desc.</summary>
    private static List<ReportCategory> CategoryShares(IReadOnlyList<ReportTransaction> transactions, string kind)
    {
        var items = transactions.Where(item => item.Kind == kind).ToList();
        var total = items.Sum(item => item.BaseAmountCents);
        return items
            .GroupBy(item => item.CategoryKind == kind ? item.CategoryId : null)
            .Select(group => (Id: group.Key, Name: group.Key is null ? Uncategorized : group.First().CategoryName ?? Uncategorized, Total: group.Sum(item => item.BaseAmountCents)))
            .OrderByDescending(item => item.Total).ThenBy(item => item.Name, StringComparer.Ordinal)
            .Select(item => new ReportCategory(item.Id, item.Name, item.Total, Share(item.Total, total)))
            .ToList();
    }

    private static List<ReportExpense> TopExpenses(IReadOnlyList<ReportTransaction> transactions) =>
        transactions.Where(item => item.Kind == "expense")
            .OrderByDescending(item => item.BaseAmountCents).ThenByDescending(item => item.Date, StringComparer.Ordinal).ThenByDescending(item => item.Id)
            .Take(TopExpensesCount)
            .Select(item => new ReportExpense(item.Id, item.Date, item.Description, item.CategoryId, item.CategoryName, item.AmountCents, item.Currency, item.BaseAmountCents))
            .ToList();

    private static string KindLabel(string kind) => kind switch { "income" => "Receita", "expense" => "Despesa", "investment" => "Investimento", _ => kind };

    private static string PaymentLabel(string method) => method switch
    {
        "card" => "Cartão de crédito",
        "debit" => "Cartão de débito",
        "pix" => "Pix",
        "cash" => "Dinheiro",
        "transfer" => "Transferência",
        "boleto" => "Boleto",
        "auto_debit" => "Débito automático",
        "other" => "Outro",
        _ => method
    };

    /// <summary>Valor em unidades mínimas com vírgula decimal e sem separador de milhar (lido como número pelo Excel pt-BR).</summary>
    internal static string FormatMinor(long minor, int decimals)
    {
        if (decimals == 0) return minor.ToString(Invariant);
        var scale = 1m;
        for (var index = 0; index < decimals; index++) scale *= 10m;
        return (minor / scale).ToString("F" + decimals.ToString(Invariant), PtBr);
    }

    /// <summary>Texto seguro para CSV: aspas quando há ; " ou quebra de linha, e apóstrofo antes de =, +, - ou @ (evita fórmulas no Excel).</summary>
    internal static string CsvText(string value)
    {
        if (value.Length > 0 && value[0] is '=' or '+' or '-' or '@') value = "'" + value;
        return value.IndexOfAny([';', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"", StringComparison.Ordinal)}\"" : value;
    }
}
