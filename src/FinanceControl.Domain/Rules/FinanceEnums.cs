namespace FinanceControl.Domain.Rules;

/// <summary>Conjuntos de valores aceitos para os campos enumerados do domínio financeiro.</summary>
public static class FinanceEnums
{
    public static readonly IReadOnlySet<string> TransactionKinds = Set("income", "expense", "investment");
    public static readonly IReadOnlySet<string> CategoryKinds = Set("income", "expense", "investment");
    public static readonly IReadOnlySet<string> PaymentMethods = Set("card", "debit", "pix", "cash", "transfer", "boleto", "other", "auto_debit");
    public static readonly IReadOnlySet<string> AccountTypes = Set("checking", "payment", "savings", "brokerage", "cash");
    public static readonly IReadOnlySet<string> GoalTypes = Set("emergency", "travel", "purchase", "education", "retirement", "custom");
    public static readonly IReadOnlySet<string> InvestmentTypes = Set("fixed_income", "treasury", "stocks", "funds", "real_estate_funds", "crypto", "pension", "other");
    public static readonly IReadOnlySet<string> SubscriptionFrequencies = Set("monthly", "yearly", "weekly");
    public static readonly IReadOnlySet<string> InvestmentEntryKinds = Set("deposit", "withdrawal", "yield", "adjustment");
    public static readonly IReadOnlySet<string> GoalEntryKinds = Set("contribution", "withdrawal");
    public static readonly IReadOnlySet<string> BankEntryKinds = Set("deposit", "withdrawal", "transfer_in", "transfer_out", "adjustment");
    public static readonly IReadOnlySet<string> CardNetworks = Set("visa", "mastercard", "elo", "amex", "hipercard", "other");

    private static HashSet<string> Set(params string[] values) => new(values, StringComparer.Ordinal);
}
