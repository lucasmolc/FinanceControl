using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Domain.Entities;

namespace FinanceControl.Application.Ports;

public interface IFinanceUseCases
{
    FinanceState GetState();
    IReadOnlyList<IReadOnlyDictionary<string, object?>> ListRecords(string module);
    OperationResult<IReadOnlyList<Transaction>> ListTransactions(string? month);
    OperationResult<long> CreateRecord(string module, RecordData data);
    OperationResult<bool> UpdateRecord(string module, long id, RecordData data);
    OperationResult<bool> RemoveRecord(string module, long id);
    OperationResult<bool> RestoreRecord(string module, long id);
    OperationResult<MonthlySummary> GetSummary(string? month);
    OperationResult<IReadOnlyList<BillChecklistItem>> GetChecklist(string? month);
    OperationResult<long?> SetChecklist(RecordData data);
    OperationResult<bool> UpdateSettings(RecordData data);
    OperationResult<bool> CompleteSetup(SetupCommand command);
    OperationResult<bool> SkipSetup();
    OperationResult<long> AddGoalEntry(long goalId, RecordData data);
    OperationResult<long> AddInvestmentEntry(long investmentId, RecordData data);
    OperationResult<long> AddBankEntry(long accountId, RecordData data);
    OperationResult<EntryPage<GoalEntry>> ListGoalEntries(long goalId, string? limit = null, string? offset = null);
    OperationResult<EntryPage<InvestmentEntry>> ListInvestmentEntries(long investmentId, string? limit = null, string? offset = null);
    OperationResult<EntryPage<BankStatementItem>> ListBankStatement(long accountId, string? limit = null, string? offset = null);
    OperationResult<bool> ReverseGoalEntry(long goalId, long entryId);
    OperationResult<bool> ReverseInvestmentEntry(long investmentId, long entryId);
    OperationResult<bool> ReverseBankEntry(long accountId, long entryId);
    OperationResult<bool> RestoreGoalEntry(long goalId, long entryId);
    OperationResult<bool> RestoreInvestmentEntry(long investmentId, long entryId);
    OperationResult<bool> RestoreBankEntry(long accountId, long entryId);
    IReadOnlyList<MonthlyClosing> ListClosings();
    OperationResult<MonthlyClosing> CloseMonth(string month, RecordData data);
    OperationResult<bool> ReopenMonth(string month);
    OperationResult<IReadOnlyList<CardInvoice>> ListCardInvoices(long cardId, string? from, string? to);
    OperationResult<CardInvoiceDetail> GetCardInvoice(long cardId, string month);
    OperationResult<IReadOnlyList<CardInvoiceRow>> ListInvoicesToPay(string? month);
    OperationResult<long> PayCardInvoice(long cardId, string month, RecordData data);
    OperationResult<bool> UnpayCardInvoice(long cardId, string month);
    OperationResult<ReassignCounts> GetCategoryLinks(long categoryId);
    OperationResult<CardLinks> GetCardLinks(long cardId);
    OperationResult<SubscriptionChargeResult> ChargeSubscription(long subscriptionId, RecordData data);
    OperationResult<bool> UndoSubscriptionCharge(long subscriptionId, string? date);
    OperationResult<ReassignCounts> ReassignCategory(long categoryId, RecordData data);
    OperationResult<CardReassignCounts> ReassignCard(long cardId, RecordData data);
    // ---------- v1.2 ----------
    IReadOnlyList<Domain.Rules.CurrencyInfo> ListCurrencies();
    MarketSnapshot GetMarket();
    /// <summary>Busca cotações e indicadores agora (manuais preservados); falha total mantém o cache e registra o erro.</summary>
    Task<MarketSnapshot> RefreshMarketAsync(CancellationToken cancellationToken = default);
    /// <summary>Atualização do serviço em segundo plano: só busca quando <c>market_auto_refresh</c> está ligado.</summary>
    Task<bool> RefreshMarketIfEnabledAsync(CancellationToken cancellationToken = default);
    OperationResult<MarketSnapshot> SetManualRate(string currency, RecordData data);
    OperationResult<bool> ClearManualRate(string currency);
    AutoDebitRun RunAutoDebits();
    OperationResult<FinanceReport> GetReport(string? from, string? to);
    OperationResult<CsvExport> ExportTransactionsCsv(string? from, string? to);
    ProjectionBase GetProjectionBase();
    OperationResult<long> EnsureEmergencyGoal();
    // ---------- v1.3 ----------
    OperationResult<PlanResult> ApplyPlan(RecordData data);
    OperationResult<bool> ClearPlan();
    OperationResult<long> EnsureFreedomGoal();

    BackupDocument CreateBackup();
    byte[] CreateDatabaseSnapshot();
    OperationResult<RestoreResult> RestoreBackup(object? document);
    AboutInfo GetAbout();
}
