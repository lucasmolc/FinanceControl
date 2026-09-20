namespace FinanceControl.Application.Contracts;

/// <summary>Alteração de configurações: null mantém o valor atual. <see cref="UiPreferences"/> chega já mesclado e validado.</summary>
public sealed record SettingsCommand(bool? SetupCompleted, string? DisplayName, string? Currency, long? MonthlyNetIncomeCents, long? MonthlySpendingLimitCents, int? EmergencyMonthsTarget, bool? TourCompleted,
    bool? MarketAutoRefresh = null, bool? EmergencyGoalAuto = null, Domain.Rules.UiPreferences? UiPreferences = null,
    int? FreedomMultiplier = null, bool? FreedomGoalAuto = null);

/// <summary>
/// Plano 70-20-10 validado: percentuais, meses da reserva, multiplicador da liberdade, teto de gastos já calculado
/// (salário × (fixos + lazer) / 100) e, opcionalmente, o salário a gravar junto.
/// </summary>
public sealed record PlanCommand(int FixedPct, int FunPct, int InvestPct, int EmergencyMonths, int FreedomMultiplier, bool CreateBuckets,
    long? MonthlyNetIncomeCents, long SpendingLimitCents);

/// <summary>Resultado de aplicar o plano: metas vinculadas e categorias-balde criadas ou marcadas.</summary>
public sealed record PlanResult(long? EmergencyGoalId, long? FreedomGoalId, IReadOnlyList<string> CreatedCategories, IReadOnlyList<string> MarkedCategories);
public sealed record SetupCommand(string? DisplayName, long MonthlyNetIncomeCents, long MonthlySpendingLimitCents, int EmergencyMonthsTarget, IReadOnlyList<SetupBill>? Bills, IReadOnlyList<SetupGoal>? Goals, SetupCard? Card);
public sealed record SetupBill(string? Name, long AmountCents, int DueDay);
public sealed record SetupGoal(string? Name, string? Type, long TargetCents, long CurrentCents, string? TargetDate, string? Currency, string? Notes);
public sealed record SetupCard(string? Name, int ClosingDay, int DueDay, long RealLimitCents, long PersonalLimitCents);

/// <summary>Lançamento a criar junto com o pagamento de uma conta do checklist.</summary>
/// <summary>Lançamento criado por um fluxo (checklist, cobrança, débito automático). Sem valor em BRL informado, vale o próprio valor (BRL).</summary>
public sealed record TransactionDraft(string Date, string Description, long? CategoryId, string Kind, long AmountCents, string PaymentMethod, long? AccountId, string? Notes, long? CardId = null,
    string Currency = "BRL", long? BaseAmountCents = null, string ExchangeRate = "1", string? Brand = null);
public sealed record BillPaymentCommand(long BillId, string Month, string PaidAt, TransactionDraft? Transaction);

public sealed record GoalEntryCommand(long GoalId, string Date, string Kind, long AmountCents, string? Notes);
/// <summary>Cobrança de assinatura. <paramref name="Automatic"/>: débito automático, que nunca substitui uma cobrança já registrada na data.</summary>
public sealed record SubscriptionChargeCommand(long SubscriptionId, string ChargeDate, TransactionDraft Transaction, bool Automatic = false);
/// <summary>Resultado da cobrança de uma assinatura: lançamento criado e data da cobrança.</summary>
public sealed record SubscriptionChargeResult(long TransactionId, string ChargeDate);
public sealed record InvestmentEntryCommand(long InvestmentId, string Date, string Kind, long AmountCents, string? Notes);
/// <summary>Movimentação de conta. Na transferência, <paramref name="CounterpartAmountCents"/> é o valor creditado no destino (moedas diferentes); null = o mesmo valor.</summary>
public sealed record BankEntryCommand(long AccountId, string Date, string Description, string Kind, long AmountCents, long? RelatedAccountId, string? Notes, string CounterpartDescription, long? CounterpartAmountCents = null);

/// <summary>Pagamento de fatura: saída na conta (descrição pronta) e registro em card_invoice_payments, atomicamente.</summary>
public sealed record CardInvoicePaymentCommand(long CardId, string Month, long AmountCents, string Date, long AccountId, string Description, string PaidAt);

/// <summary>Fechamento de mês com o resumo já marcado como fechado.</summary>
public sealed record MonthCloseCommand(string Month, string ClosedAt, string? Notes, Domain.Entities.MonthlySummary Summary);

/// <summary>Livros de movimentações com histórico estornável.</summary>
public enum MovementLedger { Goal, Investment, Bank }

/// <summary>Valores brutos recebidos do adaptador de entrada: string, long, double, bool, null, listas ou objetos aninhados.</summary>
public sealed record RecordData(IReadOnlyDictionary<string, object?> Values);

public sealed record BackupDocument(int Version, string ExportedAt, IReadOnlyDictionary<string, IReadOnlyList<IReadOnlyDictionary<string, object?>>> Data);

/// <summary>Conteúdo validado de um backup a restaurar: tabela → linhas (coluna → valor escalar).</summary>
public sealed record RestorePlan(IReadOnlyDictionary<string, IReadOnlyList<IReadOnlyDictionary<string, object?>>> Tables, string SafetyCopyFileName);

/// <summary>Zerar a conta: apaga todos os dados financeiros e volta ao primeiro acesso. O texto de confirmação é
/// obrigatório porque a operação não tem volta pela interface (resta a cópia automática gravada antes).</summary>
public sealed record ResetCommand(string? Confirmation);

/// <summary>Resultado do reset: onde ficou a cópia automática feita antes de apagar.</summary>
public sealed record ResetResult(bool Ok, string SafetyCopy);

/// <summary>Cotações e indicadores obtidos das APIs públicas (valores já convertidos para o formato interno).</summary>
public sealed record FetchedRate(string Currency, decimal RateBrl, double? ChangePct, string Source);
public sealed record FetchedIndicator(string Code, double Value, string? ReferenceDate, string Source);
public sealed record MarketFetchResult(IReadOnlyList<FetchedRate> Rates, IReadOnlyList<FetchedIndicator> Indicators, IReadOnlyList<string> Errors);

/// <summary>Arquivo CSV gerado (texto sem BOM; o adaptador HTTP acrescenta o BOM UTF-8).</summary>
public sealed record CsvExport(string FileName, string Content);
