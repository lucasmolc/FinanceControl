namespace FinanceControl.Domain.Entities;

public class CategorySpend { public long CategoryId { get; init; } public string Name { get; init; } = ""; public long MonthlyBudgetCents { get; init; } public long SpentCents { get; init; } public bool Active { get; init; } public string? Bucket { get; init; } }
public class BillsSummary { public long TotalCount { get; init; } public long PaidCount { get; init; } public long TotalCents { get; init; } public long PaidCents { get; init; } }
public class MonthTotals { public long IncomeCents { get; init; } public long ExpenseCents { get; init; } public long InvestmentCents { get; init; } public long TransactionsCount { get; init; } public long UncategorizedExpenseCents { get; init; } public long UncategorizedIncomeCents { get; init; } public long UncategorizedInvestmentCents { get; init; } }

public sealed record MonthlySummary(
    string Month,
    long IncomeCents,
    long ExpenseCents,
    long InvestmentCents,
    long TransactionsCount,
    long UncategorizedExpenseCents,
    IReadOnlyList<CategorySpend> Categories,
    BillsSummary Bills,
    IReadOnlyList<CategorySpend> IncomeCategories,
    IReadOnlyList<CategorySpend> InvestmentCategories,
    long UncategorizedIncomeCents,
    long UncategorizedInvestmentCents,
    bool Closed = false,
    string? ClosedAt = null,
    IReadOnlyList<ReportExpense>? TopExpenses = null,
    IReadOnlyList<DailyExpense>? DailyExpenses = null,
    PlanSummary? Plan = null,
    IReadOnlyList<ReportPaymentMethod>? PaymentMethods = null);

/// <summary>
/// Plano 70-20-10 no mês (BRL): limites = salário × percentual; realizado pelas despesas conforme o balde da categoria
/// (fixo, lazer; "fora" não entra no plano; sem balde ou sem categoria = <see cref="UnbucketedExpenseCents"/>) e investido =
/// lançamentos do tipo investimento + despesas em categorias do balde "investimento".
/// </summary>
public sealed record PlanSummary(
    int FixedPct,
    int FunPct,
    int InvestPct,
    long FixedLimitCents,
    long FunLimitCents,
    long InvestMinCents,
    long FixedSpentCents,
    long FunSpentCents,
    long InvestedCents,
    long UnbucketedExpenseCents,
    long OutOfPlanExpenseCents);

public class GoalEntry { public long Id { get; init; } public long GoalId { get; init; } public string Date { get; init; } = ""; public string Kind { get; init; } = "contribution"; public long AmountCents { get; init; } public string? Notes { get; init; } }
public class InvestmentEntry { public long Id { get; init; } public long InvestmentId { get; init; } public string Date { get; init; } = ""; public string Kind { get; init; } = ""; public long AmountCents { get; init; } public string? Notes { get; init; } }

public sealed record BankStatementItem(
    long Id,
    string Source,
    string Date,
    string Description,
    string Kind,
    long AmountCents,
    long? DeltaCents,
    long? RelatedAccountId,
    string? RelatedAccountName,
    string? Notes);

/// <summary>Quantidade de registros vinculados a uma categoria (ou movidos ao transferir seus vínculos).</summary>
public sealed record ReassignCounts(long Transactions, long Bills, long Subscriptions);

/// <summary>Quantidade de lançamentos não removidos e assinaturas ativas vinculados a um cartão.</summary>
public sealed record CardLinks(long Transactions, long Subscriptions);

/// <summary>Registros movidos ao transferir os vínculos de um cartão.</summary>
public sealed record CardReassignCounts(long Subscriptions, long Transactions);

/// <summary>Uma página de movimentações e o total de linhas disponíveis.</summary>
public sealed record EntryPage<T>(IReadOnlyList<T> Items, long Total);

/// <summary>Mês fechado: data do fechamento, observações e o resumo (JSON de /api/summary) congelado no fechamento.</summary>
public sealed class MonthlyClosing { public string Month { get; init; } = ""; public string? ClosedAt { get; init; } public string? Notes { get; init; } public string? SummaryJson { get; init; } }

/// <summary>Pagamento registrado de uma fatura (identificada pelo mês de vencimento).</summary>
public sealed class CardInvoicePayment { public long CardId { get; init; } public string Month { get; init; } = ""; public long AmountCents { get; init; } public string Date { get; init; } = ""; public long? AccountId { get; init; } public string? AccountName { get; init; } public long? BankEntryId { get; init; } }

public sealed record InvoicePaymentInfo(long AmountCents, string Date, long? AccountId, string? AccountName, long? BankEntryId);

/// <summary>Fatura de cartão: <c>Month</c> é o mês de vencimento; período = dia seguinte ao fechamento anterior … fechamento.</summary>
public class CardInvoice
{
    public string Month { get; init; } = "";
    public string PeriodStart { get; init; } = "";
    public string PeriodEnd { get; init; } = "";
    public string ClosingDate { get; init; } = "";
    public string DueDate { get; init; } = "";
    public long TotalCents { get; init; }
    public long ItemsCount { get; init; }
    public string Status { get; init; } = "";
    public InvoicePaymentInfo? Paid { get; init; }
}

/// <summary>Fatura com os dados do cartão, para a lista de contas a pagar (R1-BILLS-2).</summary>
public sealed class CardInvoiceRow : CardInvoice
{
    public long CardId { get; init; }
    public string CardName { get; init; } = "";
    public string? Brand { get; init; }
    public string? Network { get; init; }
    public string? Color { get; init; }
}

public sealed class CardInvoiceDetail : CardInvoice
{
    public IReadOnlyList<Transaction> Items { get; init; } = [];
}

public sealed record AboutInfo(string DatabasePath, string SchemaVersion);

public sealed record RestoreResult(bool Ok, string SafetyCopy, IReadOnlyDictionary<string, long> Restored);
