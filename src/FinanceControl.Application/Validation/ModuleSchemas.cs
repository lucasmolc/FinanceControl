using FinanceControl.Application.Common;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.Validation;

/// <summary>Fonte única dos campos aceitos por módulo e por comando (nomes = colunas/campos snake_case da API).</summary>
public static class ModuleSchemas
{
    public static readonly IReadOnlyDictionary<string, InputSchema> Records = new[]
    {
        new InputSchema("transactions", true,
            Field.Date("date", required: true),
            Field.Text("description", 160, required: true),
            Field.Reference("category_id", ReferenceTarget.Category),
            Field.Choice("kind", FinanceEnums.TransactionKinds, required: true),
            Field.Money("amount_cents", MoneyRule.Positive, required: true),
            Field.Choice("payment_method", FinanceEnums.PaymentMethods),
            Field.Reference("account_id", ReferenceTarget.ActiveBankAccount),
            Field.Reference("card_id", ReferenceTarget.ActiveCard),
            Field.Text("notes", 500),
            Field.Currency("currency"),
            Field.Decimal("exchange_rate"),
            Field.Identifier("brand"),
            // Parcelamento (v1.4): só na criação. O total da compra é opcional — sem ele vale valor da parcela x parcelas.
            Field.Integer("installment_count", InstallmentRules.MinCount, InstallmentRules.MaxCount, Messages.InstallmentCountRange),
            Field.Integer("installment_number", 1, InstallmentRules.MaxCount, Messages.InstallmentNumberRange),
            Field.Money(InstallmentTotalField, MoneyRule.Positive)),
        new InputSchema("bills", true,
            Field.Text("name", 120, required: true),
            Field.Money("amount_cents", MoneyRule.Positive, required: true),
            Field.Day("due_day"),
            Field.Reference("category_id", ReferenceTarget.Category),
            Field.Flag("recurring"),
            Field.Flag("active"),
            Field.Flag("auto_debit"),
            Field.Reference("account_id", ReferenceTarget.ActiveBankAccount),
            Field.Currency("currency"),
            Field.Identifier("icon"),
            Field.Identifier("brand"),
            Field.Date("active_since")),
        new InputSchema("goals", true,
            Field.Text("name", 120, required: true),
            Field.Choice("type", FinanceEnums.GoalTypes),
            Field.Money("target_cents", MoneyRule.Positive, required: true),
            Field.Money("current_cents", MoneyRule.NonNegative),
            Field.Date("target_date"),
            Field.Currency("currency"),
            Field.Flag("active"),
            Field.Text("notes", 500),
            Field.Flag(DetachAutoField)),
        new InputSchema("investments", true,
            Field.Text("name", 120, required: true),
            Field.Text("institution", 120),
            Field.Choice("type", FinanceEnums.InvestmentTypes),
            Field.Money("invested_cents", MoneyRule.NonNegative),
            Field.Money("current_cents", MoneyRule.NonNegative),
            Field.Text("liquidity", 80),
            Field.Text("benchmark", 80),
            Field.Flag("active"),
            Field.Currency("currency"),
            Field.Identifier("brand"),
            Field.LogoData("logo_data")),
        new InputSchema("cards", true,
            Field.Text("name", 120, required: true),
            Field.Day("closing_day"),
            Field.Day("due_day"),
            Field.Money("real_limit_cents", MoneyRule.NonNegative),
            Field.Money("personal_limit_cents", MoneyRule.NonNegative),
            Field.Flag("active"),
            Field.Identifier("brand"),
            new FieldSpec("network", FieldType.Choice) { Options = FinanceEnums.CardNetworks },
            Field.Color("color"),
            // Últimos 4 dígitos: identificam o cartão nas faturas com adicionais (v1.4).
            Field.Digits("last_digits", 4, Messages.CardDigits)),
        new InputSchema("bank-accounts", true,
            Field.Text("name", 120, required: true),
            Field.Text("institution", 120, required: true),
            Field.Choice("account_type", FinanceEnums.AccountTypes),
            Field.Money("current_balance_cents", MoneyRule.Any),
            Field.Text("color_label", 80),
            Field.Flag("active"),
            Field.Currency("currency"),
            Field.Identifier("brand"),
            Field.LogoData("logo_data")),
        new InputSchema("categories", true,
            Field.Text("name", 120, required: true),
            Field.Choice("kind", FinanceEnums.CategoryKinds, required: true),
            Field.Money("monthly_budget_cents", MoneyRule.NonNegative),
            Field.Flag("active"),
            Field.Identifier("icon"),
            Field.Color("color"),
            // Balde do plano 70-20-10; null ou texto vazio limpa.
            new FieldSpec("bucket", FieldType.Choice) { Options = PlanRules.Buckets }),
        new InputSchema("subscriptions", true,
            Field.Text("name", 120, required: true),
            Field.Money("amount_cents", MoneyRule.Positive, required: true),
            Field.Day("billing_day"),
            Field.Reference("category_id", ReferenceTarget.Category),
            Field.Reference("card_id", ReferenceTarget.Card),
            Field.Choice("frequency", FinanceEnums.SubscriptionFrequencies),
            Field.Date("next_billing_date"),
            Field.Flag("active"),
            Field.Text("notes", 500),
            Field.Flag("auto_debit"),
            Field.Reference("account_id", ReferenceTarget.ActiveBankAccount),
            Field.Currency("currency"),
            Field.Identifier("icon"),
            Field.Identifier("brand"))
    }.ToDictionary(schema => schema.Name, StringComparer.Ordinal);

    /// <summary>Campo de controle de PUT /api/goals/{id} (não é coluna): confirma desligar o cálculo automático da reserva.</summary>
    public const string DetachAutoField = "detach_auto";

    /// <summary>Campo de controle de POST /api/transactions (não é coluna): valor total da compra parcelada.</summary>
    public const string InstallmentTotalField = "installment_total_cents";

    /// <summary>Campos de esquema que são comandos, não colunas: nunca chegam ao banco.</summary>
    public static readonly IReadOnlySet<string> ControlFields = new HashSet<string>([DetachAutoField, InstallmentTotalField], StringComparer.Ordinal);

    public static readonly InputSchema Checklist = new("checklist", false,
        Field.Integer("bill_id", 1, long.MaxValue, Messages.Identifier, required: true),
        Field.Month("month", required: true),
        Field.Flag("paid", required: true),
        Field.Flag("register_transaction"),
        Field.Date("date"),
        Field.Money("amount_cents", MoneyRule.Positive),
        Field.Reference("account_id", ReferenceTarget.ActiveBankAccount),
        Field.Choice("payment_method", FinanceEnums.PaymentMethods));

    public static readonly InputSchema GoalEntry = new("goal-entry", false,
        Field.Date("date", required: true),
        Field.Choice("kind", FinanceEnums.GoalEntryKinds),
        Field.Money("amount_cents", MoneyRule.Positive, required: true),
        Field.Text("notes", 500));

    /// <summary>O valor mínimo depende do tipo (ajuste aceita zero); a regra fica no caso de uso.</summary>
    public static readonly InputSchema InvestmentEntry = new("investment-entry", false,
        Field.Date("date", required: true),
        Field.Choice("kind", FinanceEnums.InvestmentEntryKinds, required: true),
        Field.Money("amount_cents", MoneyRule.Any, required: true),
        Field.Text("notes", 500));

    /// <summary>Ajuste aceita qualquer saldo (inclusive negativo); os demais tipos exigem valor positivo.</summary>
    public static readonly InputSchema BankEntry = new("bank-entry", false,
        Field.Date("date", required: true),
        Field.Text("description", 160),
        Field.Choice("kind", FinanceEnums.BankEntryKinds, required: true),
        Field.Money("amount_cents", MoneyRule.Any, required: true),
        Field.Reference("related_account_id", ReferenceTarget.ActiveBankAccount),
        Field.Text("notes", 500),
        Field.Money("related_amount_cents", MoneyRule.Positive));

    /// <summary>Todos opcionais: data padrão hoje (local), valor da assinatura e forma de pagamento conforme o cartão vinculado.</summary>
    public static readonly InputSchema SubscriptionCharge = new("subscription-charge", false,
        Field.Date("date"),
        Field.Money("amount_cents", MoneyRule.Positive),
        Field.Reference("account_id", ReferenceTarget.ActiveBankAccount),
        Field.Choice("payment_method", FinanceEnums.PaymentMethods),
        Field.Decimal("exchange_rate"));

    public static readonly InputSchema MonthClose = new("month-close", false,
        Field.Text("notes", 500));

    /// <summary>Conta obrigatória (ativa); data padrão hoje (local) e valor padrão o total da fatura.</summary>
    public static readonly InputSchema InvoicePayment = new("invoice-payment", false,
        Field.Reference("account_id", ReferenceTarget.ActiveBankAccount, required: true),
        Field.Date("date"),
        Field.Money("amount_cents", MoneyRule.Positive));

    /// <summary>PUT /api/settings: campos opcionais; null é ignorado (mantém o valor atual). <c>ui_preferences</c> é validado à parte.</summary>
    public static readonly InputSchema Settings = new("settings", false,
        Field.Flag("setup_completed"),
        Field.Text("display_name", 120),
        Field.Text("currency", 10),
        Field.Money("monthly_net_income_cents", MoneyRule.NonNegative),
        Field.Money("monthly_spending_limit_cents", MoneyRule.NonNegative),
        Field.Integer("emergency_months_target", 1, 120, Messages.MonthsRange),
        Field.Flag("tour_completed"),
        Field.Flag("market_auto_refresh"),
        Field.Flag("emergency_goal_auto"),
        Field.Integer("freedom_multiplier", 1, PlanRules.MaxFreedomMultiplier, Messages.MultiplierRange),
        Field.Flag("freedom_goal_auto"));

    /// <summary>
    /// POST /api/plan: percentuais obrigatórios (≥ 0; a soma = 100 é conferida no caso de uso); meses e multiplicador opcionais
    /// (valem os atuais); <c>monthly_net_income_cents</c> opcional grava o salário junto. Campos desconhecidos são ignorados.
    /// </summary>
    public static readonly InputSchema Plan = new("plan", false,
        Field.Integer("fixed_pct", 0, long.MaxValue, Messages.NonNegative, required: true),
        Field.Integer("fun_pct", 0, long.MaxValue, Messages.NonNegative, required: true),
        Field.Integer("invest_pct", 0, long.MaxValue, Messages.NonNegative, required: true),
        Field.Integer("emergency_months", 1, 120, Messages.MonthsRange),
        Field.Integer("freedom_multiplier", 1, PlanRules.MaxFreedomMultiplier, Messages.MultiplierRange),
        Field.Flag("create_buckets"),
        Field.Money("monthly_net_income_cents", MoneyRule.NonNegative));

    /// <summary>PUT /api/market/rates/{moeda}.</summary>
    public static readonly InputSchema ManualRate = new("manual-rate", false,
        Field.Decimal("rate_brl", required: true));
}
