using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Application.Validation;
using FinanceControl.Domain.Entities;

namespace FinanceControl.Application.Ports;

/// <summary>Porta de persistência. Recebe dados já validados e normalizados pela aplicação.</summary>
public interface IFinanceStore
{
    FinanceState GetState();
    IReadOnlyList<IReadOnlyDictionary<string, object?>> ListRecords(string module);
    IReadOnlyList<Transaction> ListTransactions(string? month);
    /// <summary>Lançamento ativo (<paramref name="removed"/> = false) ou removido (true), com nomes vinculados; null quando não existe nesse estado.</summary>
    Transaction? FindTransaction(long id, bool removed);

    /// <summary>Campos cujas referências não existem (ou, para contas bancárias, estão inativas).</summary>
    IReadOnlyList<string> FindMissingReferences(IReadOnlyList<ReferenceCheck> references);

    OperationResult<long> CreateRecord(string module, IReadOnlyDictionary<string, object?> values);
    OperationResult<bool> UpdateRecord(string module, long id, IReadOnlyDictionary<string, object?> values);
    OperationResult<bool> RemoveRecord(string module, long id);
    OperationResult<bool> RestoreRecord(string module, long id);

    MonthlySummary GetMonthlySummary(string month);
    IReadOnlyList<BillChecklistItem> GetChecklist(string month);
    Bill? FindActiveBill(long billId);
    OperationResult<long?> PayBill(BillPaymentCommand command);
    OperationResult<bool> UnpayBill(long billId, string month);

    /// <summary>Grava as configurações e, na mesma transação, sincroniza a meta da reserva de emergência (MEL-43).</summary>
    void UpdateSettings(SettingsCommand command);
    /// <summary>Conclui o assistente e sincroniza a meta da reserva na mesma transação.</summary>
    bool CompleteSetup(SetupCommand command);
    void SkipSetup();

    OperationResult<long> AddGoalEntry(GoalEntryCommand command);
    OperationResult<long> AddInvestmentEntry(InvestmentEntryCommand command);
    OperationResult<long> AddBankEntry(BankEntryCommand command);
    /// <summary>Página de movimentações (null quando o registro pai não existe). <paramref name="limit"/> null = sem limite.</summary>
    EntryPage<GoalEntry>? ListGoalEntries(long goalId, int? limit, int offset);
    EntryPage<InvestmentEntry>? ListInvestmentEntries(long investmentId, int? limit, int offset);
    EntryPage<BankStatementItem>? ListBankStatement(long accountId, int limit, int offset);
    OperationResult<bool> ReverseGoalEntry(long goalId, long entryId);
    OperationResult<bool> ReverseInvestmentEntry(long investmentId, long entryId);
    OperationResult<bool> ReverseBankEntry(long accountId, long entryId);
    /// <summary>Desfaz um estorno: limpa deleted_at e reaplica o delta gravado (nos dois lados de uma transferência).</summary>
    OperationResult<bool> RestoreGoalEntry(long goalId, long entryId);
    OperationResult<bool> RestoreInvestmentEntry(long investmentId, long entryId);
    OperationResult<bool> RestoreBankEntry(long accountId, long entryId);
    /// <summary>Data da movimentação ativa ou estornada do registro pai; null quando não existe nesse estado.</summary>
    string? FindMovementDate(MovementLedger ledger, long parentId, long entryId, bool removed);

    bool IsMonthClosed(string month);
    MonthlyClosing? FindClosing(string month);
    /// <summary>Meses fechados, do mais recente para o mais antigo.</summary>
    IReadOnlyList<MonthlyClosing> ListClosings();
    /// <summary>Fecha o mês guardando o resumo; false quando já estava fechado.</summary>
    bool CloseMonth(MonthCloseCommand command);
    /// <summary>Reabre o mês; false quando ele não estava fechado.</summary>
    bool ReopenMonth(string month);

    /// <summary>Lançamentos não removidos do cartão com data no intervalo (limites inclusivos; início null = desde sempre), data asc, id asc.</summary>
    IReadOnlyList<Transaction> ListCardTransactions(long cardId, string? fromDate, string toDate);
    IReadOnlyList<CardInvoicePayment> ListInvoicePayments(long cardId);
    OperationResult<long> PayCardInvoice(CardInvoicePaymentCommand command);
    OperationResult<bool> UnpayCardInvoice(long cardId, string month);

    ReassignCounts CountCategoryLinks(long categoryId);
    CardLinks CountCardLinks(long cardId);

    /// <summary>Assinatura ativa (com nomes de categoria/cartão e última cobrança) ou null.</summary>
    Subscription? FindActiveSubscription(long subscriptionId);
    OperationResult<long> ChargeSubscription(SubscriptionChargeCommand command);
    OperationResult<bool> UndoSubscriptionCharge(long subscriptionId, string chargeDate);

    /// <summary>Categoria ou cartão em qualquer situação (ativo ou removido); null quando não existe.</summary>
    Category? FindCategory(long categoryId);
    Card? FindCard(long cardId);
    IReadOnlyList<Card> ListActiveCards();
    /// <summary>Move lançamentos não removidos, contas e assinaturas ativas da categoria de origem para o destino (null = sem categoria), atomicamente.</summary>
    ReassignCounts ReassignCategory(long sourceId, long? targetId);
    /// <summary>Move as assinaturas ativas e os lançamentos não removidos do cartão de origem para o destino (null = sem cartão), atomicamente.</summary>
    CardReassignCounts ReassignCard(long sourceId, long? targetId);

    // ---------- v1.2 ----------

    Settings GetSettings();
    BankAccount? FindBankAccount(long accountId);
    Goal? FindGoal(long goalId);
    /// <summary>Movimentações não estornadas e lançamentos não removidos vinculados à conta.</summary>
    long CountAccountMovements(long accountId);
    /// <summary>Mês (AAAA-MM) da fatura paga pela saída do extrato; null quando a saída não é pagamento de fatura.</summary>
    string? FindInvoiceMonthOfEntry(long entryId);
    void SetEmergencyGoalAuto(bool automatic);
    /// <summary>Cria ou revincula agora a meta da reserva (reativa o cálculo automático); devolve o id da meta.</summary>
    long EnsureEmergencyGoal();

    IReadOnlyList<ExchangeRate> ListExchangeRates();
    IReadOnlyList<MarketIndicator> ListMarketIndicators();
    MarketStatus GetMarketStatus();
    /// <summary>Grava cotações (sem sobrescrever as manuais) e indicadores; devolve quantos foram gravados.</summary>
    MarketRefreshCounts SaveMarketData(IReadOnlyList<ExchangeRate> rates, IReadOnlyList<MarketIndicator> indicators);
    /// <summary>Registra o resultado da última atualização: <paramref name="refreshedAt"/> null mantém a data anterior.</summary>
    void SetMarketRefreshResult(string? refreshedAt, string? error);
    void SetManualRate(string currency, string rateBrl, string at);
    bool ClearManualRate(string currency);

    IReadOnlyList<Subscription> ListActiveSubscriptions();
    IReadOnlySet<string> ListSubscriptionChargeDates(long subscriptionId);

    /// <summary>Lançamentos não removidos com data em [<paramref name="fromDate"/>, <paramref name="toDateExclusive"/>), data asc, id asc.</summary>
    IReadOnlyList<ReportTransaction> ListReportTransactions(string fromDate, string toDateExclusive);
    /// <summary>Saldos das contas e valores atuais dos investimentos ativos, na moeda nativa.</summary>
    IReadOnlyList<Holding> ListHoldings();
    void UpsertNetWorthSnapshot(NetWorthSnapshot snapshot, string updatedAt);
    IReadOnlyList<NetWorthSnapshot> ListNetWorthSnapshots(string fromMonth, string toMonth);

    // ---------- v1.3 ----------

    /// <summary>Grava o plano 70-20-10 (percentuais, meses, multiplicador, teto e salário opcional) e, na mesma transação, sincroniza
    /// a reserva de emergência e o número da liberdade e cria/marca as categorias-balde quando pedido.</summary>
    PlanResult ApplyPlan(PlanCommand command);
    /// <summary>Remove o plano (percentuais nulos); metas e teto de gastos ficam como estão.</summary>
    void ClearPlan();
    void SetFreedomGoalAuto(bool automatic);
    /// <summary>Cria ou revincula agora a meta do número da liberdade (reativa o cálculo automático); devolve o id da meta.</summary>
    long EnsureFreedomGoal();

    BackupDocument CreateBackup();
    byte[] CreateDatabaseSnapshot();
    OperationResult<RestoreResult> RestoreBackup(RestorePlan plan);
    AboutInfo GetAbout();
}
