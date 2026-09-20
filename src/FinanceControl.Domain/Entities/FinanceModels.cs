using System.Text.Json.Serialization;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Domain.Entities;

public class Settings
{
    public long Id { get; init; }
    public bool SetupCompleted { get; init; }
    public string DisplayName { get; init; } = "";
    public string Currency { get; init; } = "BRL";
    public long MonthlyNetIncomeCents { get; init; }
    public long MonthlySpendingLimitCents { get; init; }
    public int EmergencyMonthsTarget { get; init; }
    public bool TourCompleted { get; init; }
    public string CreatedAt { get; init; } = "";
    public string UpdatedAt { get; init; } = "";
    /// <summary>Preferências de interface com os padrões preenchidos.</summary>
    public UiPreferences UiPreferences { get; init; } = UiPreferenceRules.Default;
    public bool MarketAutoRefresh { get; init; } = true;
    /// <summary>Reserva de emergência = salário líquido × meses (MEL-43).</summary>
    public long EmergencyReserveTargetCents { get; init; }
    public long? EmergencyGoalId { get; init; }
    public bool EmergencyGoalAuto { get; init; } = true;
    /// <summary>"linked" (meta ativa vinculada), "removed" (meta vinculada removida) ou "none".</summary>
    public string EmergencyGoalStatus { get; init; } = ReserveRules.None;
    /// <summary>Plano 70-20-10 (MEL-45): percentuais de gastos fixos, lazer e investimento; null = sem plano.</summary>
    public int? PlanFixedPct { get; init; }
    public int? PlanFunPct { get; init; }
    public int? PlanInvestPct { get; init; }
    /// <summary>Multiplicador do número da liberdade (salários), 150 por padrão.</summary>
    public int FreedomMultiplier { get; init; } = PlanRules.DefaultFreedomMultiplier;
    /// <summary>Número da liberdade = salário líquido × multiplicador.</summary>
    public long FreedomTargetCents { get; init; }
    public long? FreedomGoalId { get; init; }
    public bool FreedomGoalAuto { get; init; } = true;
    /// <summary>Situação da meta "Número da liberdade" vinculada: "linked", "removed" ou "none".</summary>
    public string FreedomGoalStatus { get; init; } = ReserveRules.None;
    /// <summary>Progresso do número da liberdade = patrimônio investido (investimentos ativos em BRL; moedas sem cotação ficam fora).</summary>
    public long FreedomProgressCents { get; private set; }

    /// <summary>Cópia com o progresso do número da liberdade calculado pela aplicação.</summary>
    public Settings WithFreedomProgress(long cents)
    {
        var copy = (Settings)MemberwiseClone();
        copy.FreedomProgressCents = cents;
        return copy;
    }

    /// <summary>Há um plano aplicado (os três percentuais preenchidos).</summary>
    [JsonIgnore]
    public bool HasPlan => PlanFixedPct is not null && PlanFunPct is not null && PlanInvestPct is not null;
}

public class Category { public long Id { get; init; } public string Name { get; init; } = ""; public string Kind { get; init; } = ""; public long MonthlyBudgetCents { get; init; } public bool Active { get; init; } public string? Icon { get; init; } public string? Color { get; init; } public string? Bucket { get; init; } }
public class Transaction
{
    public long Id { get; init; } public string Date { get; init; } = ""; public string Description { get; init; } = ""; public long? CategoryId { get; init; } public string Kind { get; init; } = ""; public long AmountCents { get; init; } public string PaymentMethod { get; init; } = ""; public string? Notes { get; init; } public string? CategoryName { get; init; } public long? AccountId { get; init; } public string? AccountName { get; init; } public long? CardId { get; init; } public string? CardName { get; init; }
    /// <summary>Moeda do lançamento; <see cref="AmountCents"/> está em unidades mínimas dela.</summary>
    public string Currency { get; init; } = "BRL";
    /// <summary>Valor em centavos de real na data do lançamento (usado por resumos, relatórios e orçamentos).</summary>
    public long BaseAmountCents { get; init; }
    /// <summary>Reais por 1 unidade da moeda (texto decimal; "1" para BRL).</summary>
    public string ExchangeRate { get; init; } = "1";
    public string? Brand { get; init; }
    /// <summary>Parcelamento (v1.4): posição e total de parcelas da compra, e o grupo que une a série.</summary>
    public int? InstallmentNumber { get; init; }
    public int? InstallmentCount { get; init; }
    public string? InstallmentGroup { get; init; }
    /// <summary>Veio de uma importação de fatura ou extrato (v1.4).</summary>
    public bool Imported { get; init; }
}
public class Bill
{
    public long Id { get; init; } public string Name { get; init; } = ""; public long AmountCents { get; init; } public int DueDay { get; init; } public long? CategoryId { get; init; } public bool Recurring { get; init; } public bool Active { get; init; } public string? CategoryName { get; init; }
    public bool AutoDebit { get; init; } public string? AutoDebitSince { get; init; } public long? AccountId { get; init; } public string? AccountName { get; init; } public string Currency { get; init; } = "BRL"; public string? Icon { get; init; } public string? Brand { get; init; }
    /// <summary>Data (AAAA-MM-DD) a partir da qual a conta existe; só entra no checklist/resumo dos meses a partir desse mês. null = sem restrição (R1-BILLS-1).</summary>
    public string? ActiveSince { get; init; }
}
public class BillChecklistItem : Bill { public bool Paid { get; init; } public string? PaidAt { get; init; } public long? TransactionId { get; init; } public bool AutoDebitSkipped { get; init; } }
public class Goal { public long Id { get; init; } public string Name { get; init; } = ""; public string Type { get; init; } = ""; public long TargetCents { get; init; } public long CurrentCents { get; init; } public string? TargetDate { get; init; } public string Currency { get; init; } = "BRL"; public bool Active { get; init; } public string? Notes { get; init; } }
public class Investment { public long Id { get; init; } public string Name { get; init; } = ""; public string? Institution { get; init; } public string Type { get; init; } = ""; public long InvestedCents { get; init; } public long CurrentCents { get; init; } public string? Liquidity { get; init; } public string? Benchmark { get; init; } public bool Active { get; init; } public string Currency { get; init; } = "BRL"; public string? Brand { get; init; } public string? LogoData { get; init; } }
public class Card { public long Id { get; init; } public string Name { get; init; } = ""; public int ClosingDay { get; init; } public int DueDay { get; init; } public long RealLimitCents { get; init; } public long PersonalLimitCents { get; init; } public bool Active { get; init; }
    public string? Brand { get; init; } public string? Network { get; init; } public string? Color { get; init; }
    /// <summary>Últimos 4 dígitos: identificam o cartão nas faturas importadas com cartões adicionais (v1.4).</summary>
    public string? LastDigits { get; init; }
    /// <summary>Calculados a partir das faturas (somente em <c>/api/state</c>).</summary>
    public long OpenInvoiceCents { get; init; } public long UnpaidInvoicesCents { get; init; } public long? AvailableLimitCents { get; init; } }
public class BankAccount { public long Id { get; init; } public string Name { get; init; } = ""; public string Institution { get; init; } = ""; public string AccountType { get; init; } = ""; public long CurrentBalanceCents { get; init; } public string? ColorLabel { get; init; } public bool Active { get; init; } public string? LastMovementDate { get; init; } public string Currency { get; init; } = "BRL"; public string? Brand { get; init; } public string? LogoData { get; init; } }
public class Subscription
{
    public long Id { get; init; } public string Name { get; init; } = ""; public long AmountCents { get; init; } public int BillingDay { get; init; } public long? CategoryId { get; init; } public long? CardId { get; init; } public string Frequency { get; init; } = ""; public string? NextBillingDate { get; init; } public bool Active { get; init; } public string? Notes { get; init; } public string? CategoryName { get; init; } public string? CardName { get; init; } public string? LastChargeDate { get; init; }
    public bool AutoDebit { get; init; } public string? AutoDebitSince { get; init; } public long? AccountId { get; init; } public string? AccountName { get; init; } public string Currency { get; init; } = "BRL"; public string? Icon { get; init; } public string? Brand { get; init; }
}

public sealed record FinanceState(
    Settings Settings,
    IReadOnlyList<Category> Categories,
    IReadOnlyList<Bill> Bills,
    IReadOnlyList<Goal> Goals,
    IReadOnlyList<Investment> Investments,
    IReadOnlyList<Card> Cards,
    IReadOnlyList<BankAccount> BankAccounts,
    IReadOnlyList<Subscription> Subscriptions,
    IReadOnlyList<Transaction> Transactions)
{
    /// <summary>Moedas estrangeiras de registros ativos sem cotação salva: ficam fora dos totais em BRL (MEL-46).</summary>
    public IReadOnlyList<string> MissingRateCurrencies { get; init; } = [];
}
