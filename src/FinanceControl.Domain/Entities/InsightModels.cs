using System.Text.Json.Serialization;

namespace FinanceControl.Domain.Entities;

// ---------- Mercado ----------

/// <summary>Cotação salva: reais por 1 unidade da moeda (texto decimal).</summary>
public sealed class ExchangeRate
{
    public string Currency { get; init; } = "";
    public string RateBrl { get; init; } = "";
    public double? ChangePct { get; init; }
    public string Source { get; init; } = "";
    public string FetchedAt { get; init; } = "";
    public bool Manual { get; init; }
}

public sealed class MarketIndicator
{
    public string Code { get; init; } = "";
    public double Value { get; init; }
    public string? ReferenceDate { get; init; }
    public string Source { get; init; } = "";
    public string FetchedAt { get; init; } = "";
}

public sealed record MarketRateView(string Currency, string RateBrl, double? ChangePct, string Source, string FetchedAt, bool Manual, bool Stale);
public sealed record MarketIndicatorView(string Code, string Label, double Value, string Unit, string? ReferenceDate, string Source, string FetchedAt, bool Stale);
public sealed record MarketRefreshCounts(int Rates, int Indicators);

public sealed record MarketSnapshot(
    string Base,
    bool AutoRefresh,
    string? LastRefreshAt,
    string? LastError,
    IReadOnlyList<MarketRateView> Rates,
    IReadOnlyList<MarketIndicatorView> Indicators,
    MarketRefreshCounts? Refreshed = null);

/// <summary>Estado da última atualização automática/manual das cotações.</summary>
public sealed record MarketStatus(bool AutoRefresh, string? LastRefreshAt, string? LastError);

// ---------- Débito automático ----------

public sealed record AutoDebitItem(string Kind, long Id, string Name, string Date, long AmountCents, string Currency, long TransactionId);
public sealed record AutoDebitRun(IReadOnlyList<AutoDebitItem> Created);

// ---------- Relatórios ----------

/// <summary>Totais do mês; os campos do plano seguem as regras de <see cref="PlanSummary"/> (balde da categoria).</summary>
public sealed record ReportMonth(string Month, long IncomeCents, long ExpenseCents, long InvestmentCents, long NetCents,
    long FixedSpentCents = 0, long FunSpentCents = 0, long InvestedCents = 0, long UnbucketedExpenseCents = 0, long OutOfPlanExpenseCents = 0);
public sealed record ReportTotals(long IncomeCents, long ExpenseCents, long InvestmentCents, long NetCents, long AvgMonthlyIncomeCents, long AvgMonthlyExpenseCents, double? SavingsRatePct);
public sealed record ReportCategory(long? CategoryId, string Name, long TotalCents, double SharePct);
public sealed record ReportPaymentMethod(string Method, long TotalCents, long Count);
public sealed record ReportExpense(long Id, string Date, string Description, long? CategoryId, string? CategoryName, long AmountCents, string Currency, long BaseAmountCents);
public sealed record NetWorthPoint(string Month, long TotalCents, long BankCents, long InvestmentsCents);
public sealed record CurrencyExposure(string Currency, long NativeCents, long BaseCents, double SharePct);
public sealed record DailyExpense(string Date, long TotalCents);

public sealed record FinanceReport(
    string From,
    string To,
    IReadOnlyList<ReportMonth> Months,
    ReportTotals Totals,
    IReadOnlyList<ReportCategory> ExpenseCategories,
    IReadOnlyList<ReportCategory> IncomeCategories,
    IReadOnlyList<ReportPaymentMethod> PaymentMethods,
    IReadOnlyList<ReportExpense> TopExpenses,
    IReadOnlyList<NetWorthPoint> NetWorth,
    IReadOnlyList<CurrencyExposure> CurrencyExposure)
{
    /// <summary>Moedas de contas/investimentos ativos sem cotação salva (fora dos totais em BRL).</summary>
    public IReadOnlyList<string> MissingRateCurrencies { get; init; } = [];
}

/// <summary>Lançamento não removido com os valores necessários para relatórios e exportação.</summary>
public sealed class ReportTransaction
{
    public long Id { get; init; }
    public string Date { get; init; } = "";
    public string Description { get; init; } = "";
    public string Kind { get; init; } = "";
    public long? CategoryId { get; init; }
    public string? CategoryName { get; init; }
    public string? CategoryKind { get; init; }
    /// <summary>Balde do plano da categoria (fixo, lazer, investimento, fora) ou null.</summary>
    public string? CategoryBucket { get; init; }
    public string PaymentMethod { get; init; } = "";
    public string? AccountName { get; init; }
    public string? CardName { get; init; }
    public string Currency { get; init; } = "BRL";
    public long AmountCents { get; init; }
    public long BaseAmountCents { get; init; }
    public string? Notes { get; init; }
}

/// <summary>Posição de uma conta ou investimento ativo na moeda nativa.</summary>
public sealed record Holding(string Kind, string Currency, long NativeCents);

// ---------- Projeções ----------

public sealed record ProjectionStarting(long BankCents, long InvestmentsCents, long TotalCents);
public sealed record ProjectionIncome(long PlannedMonthlyCents, [property: JsonPropertyName("avg_3m_cents")] long Avg3mCents, [property: JsonPropertyName("avg_6m_cents")] long Avg6mCents);
public sealed record ProjectionExpenses(long PlannedLimitCents, long BillsMonthlyCents, long SubscriptionsMonthlyCents, [property: JsonPropertyName("avg_3m_cents")] long Avg3mCents, [property: JsonPropertyName("avg_6m_cents")] long Avg6mCents);
public sealed record ProjectionIndicators(double? SelicPct, double? CdiPct, [property: JsonPropertyName("ipca_12m_pct")] double? Ipca12mPct);
public sealed record ProjectionGoal(long Id, string Name, long TargetCents, long CurrentCents, string Currency, long BaseTargetCents, long BaseCurrentCents, string? TargetDate);
public sealed record ProjectionEmergency(int MonthsTarget, long MonthlyLimitCents, long ReserveTargetCents);
/// <summary>Plano 70-20-10 aplicado: percentuais e multiplicador do número da liberdade.</summary>
public sealed record ProjectionPlan(int FixedPct, int FunPct, int InvestPct, int FreedomMultiplier);

public sealed record ProjectionBase(
    string AsOf,
    string Currency,
    ProjectionStarting Starting,
    ProjectionIncome Income,
    ProjectionExpenses Expenses,
    [property: JsonPropertyName("investment_contribution_avg_3m_cents")] long InvestmentContributionAvg3mCents,
    ProjectionIndicators Indicators,
    IReadOnlyList<ProjectionGoal> Goals,
    ProjectionEmergency Emergency,
    ProjectionPlan? Plan,
    long FreedomTargetCents)
{
    /// <summary>Moedas de contas, investimentos, metas, contas a pagar e assinaturas sem cotação salva (fora dos totais em BRL).</summary>
    public IReadOnlyList<string> MissingRateCurrencies { get; init; } = [];
    /// <summary>Progresso do número da liberdade = patrimônio investido em BRL (= <c>Starting.InvestmentsCents</c>).</summary>
    public long FreedomProgressCents { get; init; }
}

/// <summary>Patrimônio (em centavos de real) guardado por mês.</summary>
public sealed record NetWorthSnapshot(string Month, long BankCents, long InvestmentsCents, long TotalCents);
