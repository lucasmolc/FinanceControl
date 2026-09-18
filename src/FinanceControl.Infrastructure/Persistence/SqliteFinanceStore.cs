using System.Globalization;
using Dapper;
using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Application.Ports;
using FinanceControl.Application.Validation;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;
using Microsoft.Data.Sqlite;

namespace FinanceControl.Infrastructure.Persistence;

/// <summary>Adaptador SQLite: mapeamento de tabelas, verificação de chaves estrangeiras e persistência atômica.</summary>
public sealed partial class SqliteFinanceStore(SqliteConnectionFactory factory) : IFinanceStore
{
    public FinanceState GetState()
    {
        using var connection = factory.CreateOpenConnection();
        return new FinanceState(
            ReadSettings(connection, null),
            connection.Query<Category>("SELECT * FROM categories WHERE active=1 ORDER BY kind,name").AsList(),
            connection.Query<Bill>(RecordModuleCatalog.BillSelect).AsList(),
            connection.Query<Goal>("SELECT * FROM goals WHERE active=1 ORDER BY id DESC").AsList(),
            connection.Query<Investment>("SELECT * FROM investments WHERE active=1 ORDER BY id DESC").AsList(),
            connection.Query<Card>("SELECT * FROM cards WHERE active=1 ORDER BY id").AsList(),
            connection.Query<BankAccount>(RecordModuleCatalog.BankAccountSelect).AsList(),
            connection.Query<Subscription>(RecordModuleCatalog.All["subscriptions"].SelectSql).AsList(),
            connection.Query<Transaction>($"{RecordModuleCatalog.TransactionSelect} ORDER BY t.date DESC,t.id DESC LIMIT 250").AsList());
    }

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> ListRecords(string module)
    {
        var definition = RecordModuleCatalog.Get(module);
        using var connection = factory.CreateOpenConnection();
        return ReadRows(connection, definition.SelectSql);
    }

    public IReadOnlyList<Transaction> ListTransactions(string? month)
    {
        using var connection = factory.CreateOpenConnection();
        if (month is null) return connection.Query<Transaction>($"{RecordModuleCatalog.TransactionSelect} ORDER BY t.date DESC,t.id DESC LIMIT 250").AsList();
        var (start, end) = MonthRange(month);
        return connection.Query<Transaction>($"{RecordModuleCatalog.TransactionSelect} AND t.date>=@start AND t.date<@end ORDER BY t.date DESC,t.id DESC", new { start, end }).AsList();
    }

    public Transaction? FindTransaction(long id, bool removed)
    {
        using var connection = factory.CreateOpenConnection();
        var filter = removed ? "t.deleted_at IS NOT NULL" : "t.deleted_at IS NULL";
        return connection.QuerySingleOrDefault<Transaction>($"{RecordModuleCatalog.TransactionColumns} WHERE t.id=@id AND {filter}", new { id });
    }

    public IReadOnlyList<string> FindMissingReferences(IReadOnlyList<ReferenceCheck> references)
    {
        using var connection = factory.CreateOpenConnection();
        var missing = new List<string>();
        foreach (var reference in references)
        {
            var sql = reference.Target switch
            {
                ReferenceTarget.Category => "SELECT EXISTS(SELECT 1 FROM categories WHERE id=@Id)",
                ReferenceTarget.Card => "SELECT EXISTS(SELECT 1 FROM cards WHERE id=@Id)",
                ReferenceTarget.ActiveCard => "SELECT EXISTS(SELECT 1 FROM cards WHERE id=@Id AND active=1)",
                _ => "SELECT EXISTS(SELECT 1 FROM bank_accounts WHERE id=@Id AND active=1)"
            };
            if (!connection.ExecuteScalar<bool>(sql, new { reference.Id })) missing.Add(reference.Field);
        }
        return missing;
    }

    public OperationResult<long> CreateRecord(string module, IReadOnlyDictionary<string, object?> values)
    {
        var definition = RecordModuleCatalog.Get(module);
        var columns = Writable(definition, values);
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var id = InsertRow(connection, transaction, definition.Table, columns);
        if (definition.IsTransaction)
        {
            var row = connection.QuerySingle<TransactionEffectRow>("SELECT kind,amount_cents,account_id FROM transactions WHERE id=@id", new { id }, transaction);
            ApplyTransactionEffect(connection, transaction, row, 1);
        }
        transaction.Commit();
        return OperationResult<long>.Success(id);
    }

    public OperationResult<bool> UpdateRecord(string module, long id, IReadOnlyDictionary<string, object?> values)
    {
        var definition = RecordModuleCatalog.Get(module);
        var columns = Writable(definition, values);
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var liveFilter = definition.IsTransaction ? "deleted_at IS NULL" : "active=1";
        TransactionEffectRow? before = null;
        if (definition.IsTransaction)
        {
            before = connection.QuerySingleOrDefault<TransactionEffectRow>($"SELECT kind,amount_cents,account_id FROM transactions WHERE id=@id AND {liveFilter}", new { id }, transaction);
            if (before is null) return OperationResult<bool>.NotFound();
        }

        var parameters = new DynamicParameters();
        parameters.Add("id", id);
        foreach (var (column, value) in columns) parameters.Add(column, value);
        var assignments = string.Join(',', columns.Select(item => $"{item.Key}=@{item.Key}"));
        if (connection.Execute($"UPDATE {definition.Table} SET {assignments} WHERE id=@id AND {liveFilter}", parameters, transaction) == 0)
            return OperationResult<bool>.NotFound();

        if (before is not null)
        {
            var after = connection.QuerySingle<TransactionEffectRow>("SELECT kind,amount_cents,account_id FROM transactions WHERE id=@id", new { id }, transaction);
            ApplyTransactionEffect(connection, transaction, before, -1);
            ApplyTransactionEffect(connection, transaction, after, 1);
        }
        transaction.Commit();
        return OperationResult<bool>.Success(true);
    }

    public OperationResult<bool> RemoveRecord(string module, long id)
    {
        var definition = RecordModuleCatalog.Get(module);
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var removed = definition.IsTransaction
            ? SoftDeleteTransaction(connection, transaction, id)
            : connection.Execute($"UPDATE {definition.Table} SET active=0 WHERE id=@id AND active=1", new { id }, transaction) > 0;
        if (!removed) return OperationResult<bool>.NotFound();
        transaction.Commit();
        return OperationResult<bool>.Success(true);
    }

    public OperationResult<bool> RestoreRecord(string module, long id)
    {
        var definition = RecordModuleCatalog.Get(module);
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        if (definition.IsTransaction)
        {
            var row = connection.QuerySingleOrDefault<TransactionEffectRow>("SELECT kind,amount_cents,account_id FROM transactions WHERE id=@id AND deleted_at IS NOT NULL", new { id }, transaction);
            if (row is null) return OperationResult<bool>.NotFound();
            connection.Execute("UPDATE transactions SET deleted_at=NULL WHERE id=@id", new { id }, transaction);
            ApplyTransactionEffect(connection, transaction, row, 1);
        }
        else if (connection.Execute($"UPDATE {definition.Table} SET active=1 WHERE id=@id AND active=0", new { id }, transaction) == 0)
        {
            return OperationResult<bool>.NotFound();
        }
        else if (definition.Table == "goals")
        {
            ResyncRestoredGoal(connection, transaction, id);
        }
        transaction.Commit();
        return OperationResult<bool>.Success(true);
    }

    public void UpdateSettings(SettingsCommand command)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var uiPreferences = command.UiPreferences is null ? null : UiPreferencesJson.Serialize(command.UiPreferences);
        connection.Execute("UPDATE settings SET setup_completed=COALESCE(@SetupCompleted,setup_completed),display_name=COALESCE(@DisplayName,display_name),currency=COALESCE(@Currency,currency),monthly_net_income_cents=COALESCE(@MonthlyNetIncomeCents,monthly_net_income_cents),monthly_spending_limit_cents=COALESCE(@MonthlySpendingLimitCents,monthly_spending_limit_cents),emergency_months_target=COALESCE(@EmergencyMonthsTarget,emergency_months_target),tour_completed=COALESCE(@TourCompleted,tour_completed),market_auto_refresh=COALESCE(@MarketAutoRefresh,market_auto_refresh),emergency_goal_auto=COALESCE(@EmergencyGoalAuto,emergency_goal_auto),ui_preferences=COALESCE(@uiPreferences,ui_preferences),freedom_multiplier=COALESCE(@FreedomMultiplier,freedom_multiplier),freedom_goal_auto=COALESCE(@FreedomGoalAuto,freedom_goal_auto),updated_at=CURRENT_TIMESTAMP WHERE id=1",
            new { command.SetupCompleted, command.DisplayName, command.Currency, command.MonthlyNetIncomeCents, command.MonthlySpendingLimitCents, command.EmergencyMonthsTarget, command.TourCompleted, command.MarketAutoRefresh, command.EmergencyGoalAuto, uiPreferences, command.FreedomMultiplier, command.FreedomGoalAuto }, transaction);
        SyncEmergencyGoal(connection, transaction, force: false);
        SyncFreedomGoal(connection, transaction, force: false);
        transaction.Commit();
    }

    public bool CompleteSetup(SetupCommand command)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var alreadyCompleted = connection.QuerySingle<bool>("SELECT setup_completed FROM settings WHERE id=1", transaction: transaction);
        connection.Execute("UPDATE settings SET setup_completed=1,display_name=@DisplayName,monthly_net_income_cents=@MonthlyNetIncomeCents,monthly_spending_limit_cents=@MonthlySpendingLimitCents,emergency_months_target=@EmergencyMonthsTarget,updated_at=CURRENT_TIMESTAMP WHERE id=1", command, transaction);
        if (!alreadyCompleted)
        {
            foreach (var bill in command.Bills ?? [])
                connection.Execute("INSERT INTO bills(name,amount_cents,due_day,recurring) VALUES (@Name,@AmountCents,@DueDay,1)", bill, transaction);
            foreach (var goal in command.Goals ?? [])
                connection.Execute("INSERT INTO goals(name,type,target_cents,current_cents,target_date,currency,notes) VALUES (@Name,@Type,@TargetCents,@CurrentCents,@TargetDate,@Currency,@Notes)", goal, transaction);
            if (command.Card is not null)
                connection.Execute("INSERT INTO cards(name,closing_day,due_day,real_limit_cents,personal_limit_cents) VALUES (@Name,@ClosingDay,@DueDay,@RealLimitCents,@PersonalLimitCents)", command.Card, transaction);
        }
        SyncEmergencyGoal(connection, transaction, force: false);
        SyncFreedomGoal(connection, transaction, force: false);
        transaction.Commit();
        return !alreadyCompleted;
    }

    public void SkipSetup()
    {
        using var connection = factory.CreateOpenConnection();
        connection.Execute("UPDATE settings SET setup_completed=1,updated_at=CURRENT_TIMESTAMP WHERE id=1");
    }

    private static KeyValuePair<string, object?>[] Writable(RecordModuleDefinition definition, IReadOnlyDictionary<string, object?> values)
    {
        var unknown = values.Keys.FirstOrDefault(key => !definition.Columns.Contains(key));
        if (unknown is not null) throw new ArgumentException($"Campo não mapeado para {definition.Table}: {unknown}", nameof(values));
        return values.ToArray();
    }

    private static long InsertRow(SqliteConnection connection, SqliteTransaction transaction, string table, IReadOnlyCollection<KeyValuePair<string, object?>> columns)
    {
        var parameters = new DynamicParameters();
        foreach (var (column, value) in columns) parameters.Add(column, value);
        var sql = columns.Count == 0
            ? $"INSERT INTO {table} DEFAULT VALUES"
            : $"INSERT INTO {table} ({string.Join(',', columns.Select(item => item.Key))}) VALUES ({string.Join(',', columns.Select(item => $"@{item.Key}"))})";
        connection.Execute(sql, parameters, transaction);
        return connection.QuerySingle<long>("SELECT last_insert_rowid()", transaction: transaction);
    }

    private static long InsertTransaction(SqliteConnection connection, SqliteTransaction transaction, TransactionDraft draft)
    {
        var id = connection.QuerySingle<long>(
            "INSERT INTO transactions(date,description,category_id,kind,amount_cents,payment_method,account_id,notes,card_id,currency,base_amount_cents,exchange_rate,brand) VALUES (@Date,@Description,@CategoryId,@Kind,@AmountCents,@PaymentMethod,@AccountId,@Notes,@CardId,@Currency,COALESCE(@BaseAmountCents,@AmountCents),@ExchangeRate,@Brand) RETURNING id",
            draft, transaction);
        ApplyTransactionEffect(connection, transaction, new TransactionEffectRow { Kind = draft.Kind, AmountCents = draft.AmountCents, AccountId = draft.AccountId }, 1);
        return id;
    }

    private static bool SoftDeleteTransaction(SqliteConnection connection, SqliteTransaction transaction, long id)
    {
        var row = connection.QuerySingleOrDefault<TransactionEffectRow>("SELECT kind,amount_cents,account_id FROM transactions WHERE id=@id AND deleted_at IS NULL", new { id }, transaction);
        if (row is null) return false;
        connection.Execute("UPDATE transactions SET deleted_at=CURRENT_TIMESTAMP WHERE id=@id", new { id }, transaction);
        ApplyTransactionEffect(connection, transaction, row, -1);
        return true;
    }

    private static void ApplyTransactionEffect(SqliteConnection connection, SqliteTransaction transaction, TransactionEffectRow row, int direction)
    {
        if (row.AccountId is not long accountId) return;
        var delta = TransactionRules.BalanceDelta(row.Kind, row.AmountCents) * direction;
        AdjustAccountBalance(connection, transaction, accountId, delta);
    }

    private static void AdjustAccountBalance(SqliteConnection connection, SqliteTransaction transaction, long accountId, long delta) =>
        connection.Execute("UPDATE bank_accounts SET current_balance_cents=current_balance_cents+@delta WHERE id=@accountId", new { delta, accountId }, transaction);

    private static (string Start, string End) MonthRange(string month)
    {
        var first = DateOnly.ParseExact($"{month}-01", "yyyy-MM-dd", CultureInfo.InvariantCulture);
        return (first.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), first.AddMonths(1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
    }

    private static IReadOnlyList<IReadOnlyDictionary<string, object?>> ReadRows(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        using var reader = command.ExecuteReader();
        var rows = new List<IReadOnlyDictionary<string, object?>>();
        while (reader.Read())
        {
            var row = new Dictionary<string, object?>(StringComparer.Ordinal);
            for (var index = 0; index < reader.FieldCount; index++) row[reader.GetName(index)] = reader.IsDBNull(index) ? null : reader.GetValue(index);
            rows.Add(row);
        }
        return rows;
    }
}

internal sealed class TransactionEffectRow
{
    public string Kind { get; init; } = "";
    public long AmountCents { get; init; }
    public long? AccountId { get; init; }
}
