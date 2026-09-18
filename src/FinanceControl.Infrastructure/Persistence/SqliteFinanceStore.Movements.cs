using Dapper;
using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;
using Microsoft.Data.Sqlite;

namespace FinanceControl.Infrastructure.Persistence;

public sealed partial class SqliteFinanceStore
{
    public OperationResult<long> AddGoalEntry(GoalEntryCommand command)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var current = connection.QuerySingleOrDefault<long?>("SELECT current_cents FROM goals WHERE id=@GoalId AND active=1", command, transaction);
        if (current is null) return OperationResult<long>.NotFound();
        var next = GoalRules.Apply(current.Value, command.Kind, command.AmountCents);
        if (next < 0) return OperationResult<long>.Invalid("amount_cents", Messages.GoalWithdrawalTooLarge);
        var id = connection.QuerySingle<long>("INSERT INTO goal_entries(goal_id,date,kind,amount_cents,notes) VALUES (@GoalId,@Date,@Kind,@AmountCents,@Notes) RETURNING id", command, transaction);
        connection.Execute("UPDATE goals SET current_cents=@next WHERE id=@GoalId", new { next, command.GoalId }, transaction);
        transaction.Commit();
        return OperationResult<long>.Success(id);
    }

    public OperationResult<long> AddInvestmentEntry(InvestmentEntryCommand command)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var investment = connection.QuerySingleOrDefault<Investment>("SELECT * FROM investments WHERE id=@InvestmentId AND active=1", command, transaction);
        if (investment is null) return OperationResult<long>.NotFound();
        if (command.Kind == "withdrawal" && command.AmountCents > investment.CurrentCents)
            return OperationResult<long>.Invalid("amount_cents", Messages.InvestmentWithdrawalTooLarge);
        var position = new InvestmentPosition(investment.InvestedCents, investment.CurrentCents);
        var delta = InvestmentRules.Movement(command.Kind, command.AmountCents, position);
        var next = position.Apply(delta);
        if (!next.IsValid) return OperationResult<long>.Invalid("amount_cents", Messages.NegativeInvestment);
        var id = connection.QuerySingle<long>(
            "INSERT INTO investment_entries(investment_id,date,kind,amount_cents,notes,invested_delta_cents,current_delta_cents) VALUES (@InvestmentId,@Date,@Kind,@AmountCents,@Notes,@investedDelta,@currentDelta) RETURNING id",
            new { command.InvestmentId, command.Date, command.Kind, command.AmountCents, command.Notes, investedDelta = delta.InvestedCents, currentDelta = delta.CurrentCents }, transaction);
        UpdateInvestment(connection, transaction, command.InvestmentId, next);
        transaction.Commit();
        return OperationResult<long>.Success(id);
    }

    public OperationResult<long> AddBankEntry(BankEntryCommand command)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var balance = connection.QuerySingleOrDefault<long?>("SELECT current_balance_cents FROM bank_accounts WHERE id=@AccountId AND active=1", command, transaction);
        if (balance is null) return OperationResult<long>.NotFound();
        var isTransfer = command.Kind == "transfer_out" && command.RelatedAccountId is not null;
        if (isTransfer && !connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM bank_accounts WHERE id=@RelatedAccountId AND active=1)", command, transaction))
            return OperationResult<long>.Invalid("related_account_id", Messages.AccountNotFound);

        var delta = BankRules.Movement(command.Kind, command.AmountCents, balance.Value);
        var id = InsertBankEntry(connection, transaction, command.AccountId, command.Date, command.Description, command.Kind, command.AmountCents, command.RelatedAccountId, command.Notes, delta);
        AdjustAccountBalance(connection, transaction, command.AccountId, delta);

        if (isTransfer)
        {
            var targetId = command.RelatedAccountId!.Value;
            var received = command.CounterpartAmountCents ?? command.AmountCents;
            var targetDelta = BankRules.Movement("transfer_in", received, 0);
            var counterpartId = InsertBankEntry(connection, transaction, targetId, command.Date, command.CounterpartDescription, "transfer_in", received, command.AccountId, command.Notes, targetDelta);
            connection.Execute("UPDATE bank_entries SET transfer_entry_id=@counterpartId WHERE id=@id", new { counterpartId, id }, transaction);
            connection.Execute("UPDATE bank_entries SET transfer_entry_id=@id WHERE id=@counterpartId", new { counterpartId, id }, transaction);
            AdjustAccountBalance(connection, transaction, targetId, targetDelta);
        }
        transaction.Commit();
        return OperationResult<long>.Success(id);
    }

    public EntryPage<GoalEntry>? ListGoalEntries(long goalId, int? limit, int offset)
    {
        using var connection = factory.CreateOpenConnection();
        if (!connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM goals WHERE id=@goalId)", new { goalId })) return null;
        var parameters = new { goalId, limit = limit ?? -1, offset };
        return new EntryPage<GoalEntry>(
            connection.Query<GoalEntry>("SELECT id,goal_id,date,kind,amount_cents,notes FROM goal_entries WHERE goal_id=@goalId AND deleted_at IS NULL ORDER BY date DESC,id DESC LIMIT @limit OFFSET @offset", parameters).AsList(),
            connection.ExecuteScalar<long>("SELECT COUNT(*) FROM goal_entries WHERE goal_id=@goalId AND deleted_at IS NULL", parameters));
    }

    public EntryPage<InvestmentEntry>? ListInvestmentEntries(long investmentId, int? limit, int offset)
    {
        using var connection = factory.CreateOpenConnection();
        if (!connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM investments WHERE id=@investmentId)", new { investmentId })) return null;
        var parameters = new { investmentId, limit = limit ?? -1, offset };
        return new EntryPage<InvestmentEntry>(
            connection.Query<InvestmentEntry>("SELECT id,investment_id,date,kind,amount_cents,notes FROM investment_entries WHERE investment_id=@investmentId AND deleted_at IS NULL ORDER BY date DESC,id DESC LIMIT @limit OFFSET @offset", parameters).AsList(),
            connection.ExecuteScalar<long>("SELECT COUNT(*) FROM investment_entries WHERE investment_id=@investmentId AND deleted_at IS NULL", parameters));
    }

    public EntryPage<BankStatementItem>? ListBankStatement(long accountId, int limit, int offset)
    {
        using var connection = factory.CreateOpenConnection();
        if (!connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM bank_accounts WHERE id=@accountId)", new { accountId })) return null;
        var parameters = new { accountId, limit, offset };
        var rows = connection.Query<StatementRow>("""
            SELECT id, source, date, description, kind, amount_cents, stored_delta, related_account_id, related_account_name, notes FROM (
              SELECT e.id, 'entry' source, e.date, e.description, e.kind, e.amount_cents, e.delta_cents stored_delta,
                     e.related_account_id, r.name related_account_name, e.notes, 1 source_order
              FROM bank_entries e LEFT JOIN bank_accounts r ON r.id=e.related_account_id
              WHERE e.account_id=@accountId AND e.deleted_at IS NULL
              UNION ALL
              SELECT t.id, 'transaction', t.date, t.description, t.kind, t.amount_cents, NULL, NULL, NULL, t.notes, 0
              FROM transactions t WHERE t.account_id=@accountId AND t.deleted_at IS NULL
            ) ORDER BY date DESC, id DESC, source_order DESC LIMIT @limit OFFSET @offset
            """, parameters);
        var total = connection.ExecuteScalar<long>(
            "SELECT (SELECT COUNT(*) FROM bank_entries WHERE account_id=@accountId AND deleted_at IS NULL) + (SELECT COUNT(*) FROM transactions WHERE account_id=@accountId AND deleted_at IS NULL)", parameters);
        return new EntryPage<BankStatementItem>(rows.Select(row => new BankStatementItem(
            row.Id, row.Source, row.Date, row.Description, row.Kind, row.AmountCents,
            row.Source == "transaction" ? TransactionRules.BalanceDelta(row.Kind, row.AmountCents) : BankRules.DisplayDelta(row.Kind, row.AmountCents, row.StoredDelta),
            row.RelatedAccountId, row.RelatedAccountName, row.Notes)).ToList(), total);
    }

    public string? FindMovementDate(MovementLedger ledger, long parentId, long entryId, bool removed)
    {
        var (table, parent) = ledger switch
        {
            MovementLedger.Goal => ("goal_entries", "goal_id"),
            MovementLedger.Investment => ("investment_entries", "investment_id"),
            _ => ("bank_entries", "account_id")
        };
        var filter = removed ? "deleted_at IS NOT NULL" : "deleted_at IS NULL";
        using var connection = factory.CreateOpenConnection();
        return connection.QuerySingleOrDefault<string?>($"SELECT date FROM {table} WHERE id=@entryId AND {parent}=@parentId AND {filter}", new { entryId, parentId });
    }

    public OperationResult<bool> RestoreGoalEntry(long goalId, long entryId)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var entry = connection.QuerySingleOrDefault<GoalEntryRow>("SELECT kind, amount_cents FROM goal_entries WHERE id=@entryId AND goal_id=@goalId AND deleted_at IS NOT NULL", new { entryId, goalId }, transaction);
        if (entry is null) return OperationResult<bool>.NotFound();
        var current = connection.QuerySingle<long>("SELECT current_cents FROM goals WHERE id=@goalId", new { goalId }, transaction);
        var next = GoalRules.Apply(current, entry.Kind, entry.AmountCents);
        if (next < 0) return OperationResult<bool>.Invalid("amount_cents", Messages.GoalWithdrawalTooLarge);
        connection.Execute("UPDATE goal_entries SET deleted_at=NULL WHERE id=@entryId", new { entryId }, transaction);
        connection.Execute("UPDATE goals SET current_cents=@next WHERE id=@goalId", new { next, goalId }, transaction);
        transaction.Commit();
        return OperationResult<bool>.Success(true);
    }

    public OperationResult<bool> RestoreInvestmentEntry(long investmentId, long entryId)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var entry = connection.QuerySingleOrDefault<InvestmentEntryRow>("SELECT kind, amount_cents, invested_delta_cents, current_delta_cents FROM investment_entries WHERE id=@entryId AND investment_id=@investmentId AND deleted_at IS NOT NULL", new { entryId, investmentId }, transaction);
        if (entry is null) return OperationResult<bool>.NotFound();
        var delta = InvestmentRules.RecordedDelta(entry.Kind, entry.AmountCents, entry.InvestedDeltaCents, entry.CurrentDeltaCents);
        if (delta is null) return OperationResult<bool>.Invalid("entry", Messages.LegacyEntry);
        var investment = connection.QuerySingle<Investment>("SELECT * FROM investments WHERE id=@investmentId", new { investmentId }, transaction);
        var next = new InvestmentPosition(investment.InvestedCents, investment.CurrentCents).Apply(delta.Value);
        if (!next.IsValid) return OperationResult<bool>.Invalid("amount_cents", Messages.NegativeInvestment);
        connection.Execute("UPDATE investment_entries SET deleted_at=NULL WHERE id=@entryId", new { entryId }, transaction);
        UpdateInvestment(connection, transaction, investmentId, next);
        transaction.Commit();
        return OperationResult<bool>.Success(true);
    }

    public OperationResult<bool> RestoreBankEntry(long accountId, long entryId)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var entry = connection.QuerySingleOrDefault<BankEntryRow>("SELECT id, account_id, kind, amount_cents, delta_cents, transfer_entry_id FROM bank_entries WHERE id=@entryId AND account_id=@accountId AND deleted_at IS NOT NULL", new { entryId, accountId }, transaction);
        if (entry is null) return OperationResult<bool>.NotFound();
        var delta = BankRules.ReversibleDelta(entry.Kind, entry.AmountCents, entry.DeltaCents);
        if (delta is null) return OperationResult<bool>.Invalid("entry", Messages.LegacyEntry);

        // O outro lado de uma transferência foi estornado junto; desfazer restaura os dois.
        var counterpart = entry.TransferEntryId is long linkedId
            ? connection.QuerySingleOrDefault<BankEntryRow>("SELECT id, account_id, kind, amount_cents, delta_cents, transfer_entry_id FROM bank_entries WHERE id=@linkedId AND deleted_at IS NOT NULL", new { linkedId }, transaction)
            : null;
        var counterpartDelta = counterpart is null ? null : BankRules.ReversibleDelta(counterpart.Kind, counterpart.AmountCents, counterpart.DeltaCents);
        if (counterpart is not null && counterpartDelta is null) return OperationResult<bool>.Invalid("entry", Messages.LegacyEntry);

        // Saída de pagamento de fatura: desfazer o estorno refaz o pagamento (a fatura não pode ter sido paga de novo).
        var invoice = connection.QuerySingleOrDefault<InvoiceLinkRow>("SELECT invoice_card_id, invoice_month, account_id, amount_cents, date FROM bank_entries WHERE id=@entryId AND invoice_card_id IS NOT NULL", new { entryId }, transaction);
        if (invoice is not null && connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM card_invoice_payments WHERE card_id=@InvoiceCardId AND month=@InvoiceMonth)", invoice, transaction))
            return OperationResult<bool>.Invalid("entry", Messages.InvoiceAlreadyPaid);

        RestoreBankEntryRow(connection, transaction, entry, delta.Value);
        if (counterpart is not null) RestoreBankEntryRow(connection, transaction, counterpart, counterpartDelta!.Value);
        if (invoice is not null)
            connection.Execute("""
                INSERT INTO card_invoice_payments(card_id, month, amount_cents, paid_at, date, account_id, bank_entry_id)
                VALUES (@InvoiceCardId, @InvoiceMonth, @AmountCents, strftime('%Y-%m-%dT%H:%M:%fZ','now'), @Date, @AccountId, @entryId)
                """, new { invoice.InvoiceCardId, invoice.InvoiceMonth, invoice.AmountCents, invoice.Date, invoice.AccountId, entryId }, transaction);
        transaction.Commit();
        return OperationResult<bool>.Success(true);
    }

    public OperationResult<bool> ReverseGoalEntry(long goalId, long entryId)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var entry = connection.QuerySingleOrDefault<GoalEntryRow>("SELECT kind, amount_cents FROM goal_entries WHERE id=@entryId AND goal_id=@goalId AND deleted_at IS NULL", new { entryId, goalId }, transaction);
        if (entry is null) return OperationResult<bool>.NotFound();
        var current = connection.QuerySingle<long>("SELECT current_cents FROM goals WHERE id=@goalId", new { goalId }, transaction);
        var next = GoalRules.Revert(current, entry.Kind, entry.AmountCents);
        if (next < 0) return OperationResult<bool>.Invalid("amount_cents", Messages.NegativeGoal);
        connection.Execute("UPDATE goal_entries SET deleted_at=CURRENT_TIMESTAMP WHERE id=@entryId", new { entryId }, transaction);
        connection.Execute("UPDATE goals SET current_cents=@next WHERE id=@goalId", new { next, goalId }, transaction);
        transaction.Commit();
        return OperationResult<bool>.Success(true);
    }

    public OperationResult<bool> ReverseInvestmentEntry(long investmentId, long entryId)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var entry = connection.QuerySingleOrDefault<InvestmentEntryRow>("SELECT kind, amount_cents, invested_delta_cents, current_delta_cents FROM investment_entries WHERE id=@entryId AND investment_id=@investmentId AND deleted_at IS NULL", new { entryId, investmentId }, transaction);
        if (entry is null) return OperationResult<bool>.NotFound();
        var delta = InvestmentRules.RecordedDelta(entry.Kind, entry.AmountCents, entry.InvestedDeltaCents, entry.CurrentDeltaCents);
        if (delta is null) return OperationResult<bool>.Invalid("entry", Messages.LegacyEntry);
        var investment = connection.QuerySingle<Investment>("SELECT * FROM investments WHERE id=@investmentId", new { investmentId }, transaction);
        var next = new InvestmentPosition(investment.InvestedCents, investment.CurrentCents).Revert(delta.Value);
        if (!next.IsValid) return OperationResult<bool>.Invalid("amount_cents", Messages.NegativeInvestment);
        connection.Execute("UPDATE investment_entries SET deleted_at=CURRENT_TIMESTAMP WHERE id=@entryId", new { entryId }, transaction);
        UpdateInvestment(connection, transaction, investmentId, next);
        transaction.Commit();
        return OperationResult<bool>.Success(true);
    }

    public OperationResult<bool> ReverseBankEntry(long accountId, long entryId)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var entry = connection.QuerySingleOrDefault<BankEntryRow>("SELECT id, account_id, kind, amount_cents, delta_cents, transfer_entry_id FROM bank_entries WHERE id=@entryId AND account_id=@accountId AND deleted_at IS NULL", new { entryId, accountId }, transaction);
        if (entry is null) return OperationResult<bool>.NotFound();
        var delta = BankRules.ReversibleDelta(entry.Kind, entry.AmountCents, entry.DeltaCents);
        if (delta is null) return OperationResult<bool>.Invalid("entry", Messages.LegacyEntry);

        var counterpart = entry.TransferEntryId is long linkedId
            ? connection.QuerySingleOrDefault<BankEntryRow>("SELECT id, account_id, kind, amount_cents, delta_cents, transfer_entry_id FROM bank_entries WHERE id=@linkedId AND deleted_at IS NULL", new { linkedId }, transaction)
            : null;
        var counterpartDelta = counterpart is null ? null : BankRules.ReversibleDelta(counterpart.Kind, counterpart.AmountCents, counterpart.DeltaCents);
        if (counterpart is not null && counterpartDelta is null) return OperationResult<bool>.Invalid("entry", Messages.LegacyEntry);

        SoftDeleteBankEntry(connection, transaction, entry, delta.Value);
        if (counterpart is not null) SoftDeleteBankEntry(connection, transaction, counterpart, counterpartDelta!.Value);
        // Estornar a saída de um pagamento de fatura desfaz o pagamento (MEL-44).
        connection.Execute("DELETE FROM card_invoice_payments WHERE bank_entry_id=@entryId", new { entryId }, transaction);
        transaction.Commit();
        return OperationResult<bool>.Success(true);
    }

    private static long InsertBankEntry(SqliteConnection connection, SqliteTransaction transaction, long accountId, string date, string description, string kind, long amountCents, long? relatedAccountId, string? notes, long delta) =>
        connection.QuerySingle<long>(
            "INSERT INTO bank_entries(account_id,date,description,kind,amount_cents,related_account_id,notes,delta_cents) VALUES (@accountId,@date,@description,@kind,@amountCents,@relatedAccountId,@notes,@delta) RETURNING id",
            new { accountId, date, description, kind, amountCents, relatedAccountId, notes, delta }, transaction);

    private static void SoftDeleteBankEntry(SqliteConnection connection, SqliteTransaction transaction, BankEntryRow entry, long delta)
    {
        connection.Execute("UPDATE bank_entries SET deleted_at=CURRENT_TIMESTAMP WHERE id=@Id", new { entry.Id }, transaction);
        AdjustAccountBalance(connection, transaction, entry.AccountId, -delta);
    }

    private static void RestoreBankEntryRow(SqliteConnection connection, SqliteTransaction transaction, BankEntryRow entry, long delta)
    {
        connection.Execute("UPDATE bank_entries SET deleted_at=NULL WHERE id=@Id", new { entry.Id }, transaction);
        AdjustAccountBalance(connection, transaction, entry.AccountId, delta);
    }

    private static void UpdateInvestment(SqliteConnection connection, SqliteTransaction transaction, long investmentId, InvestmentPosition position) =>
        connection.Execute("UPDATE investments SET invested_cents=@InvestedCents,current_cents=@CurrentCents WHERE id=@investmentId", new { position.InvestedCents, position.CurrentCents, investmentId }, transaction);
}

internal sealed class StatementRow
{
    public long Id { get; init; }
    public string Source { get; init; } = "";
    public string Date { get; init; } = "";
    public string Description { get; init; } = "";
    public string Kind { get; init; } = "";
    public long AmountCents { get; init; }
    public long? StoredDelta { get; init; }
    public long? RelatedAccountId { get; init; }
    public string? RelatedAccountName { get; init; }
    public string? Notes { get; init; }
}

internal sealed class GoalEntryRow
{
    public string Kind { get; init; } = "";
    public long AmountCents { get; init; }
}

internal sealed class InvestmentEntryRow
{
    public string Kind { get; init; } = "";
    public long AmountCents { get; init; }
    public long? InvestedDeltaCents { get; init; }
    public long? CurrentDeltaCents { get; init; }
}

internal sealed class InvoiceLinkRow
{
    public long InvoiceCardId { get; init; }
    public string InvoiceMonth { get; init; } = "";
    public long AccountId { get; init; }
    public long AmountCents { get; init; }
    public string Date { get; init; } = "";
}

internal sealed class BankEntryRow
{
    public long Id { get; init; }
    public long AccountId { get; init; }
    public string Kind { get; init; } = "";
    public long AmountCents { get; init; }
    public long? DeltaCents { get; init; }
    public long? TransferEntryId { get; init; }
}
