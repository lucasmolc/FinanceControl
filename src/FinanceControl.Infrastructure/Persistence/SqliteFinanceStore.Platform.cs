using System.Text.Json;
using Dapper;
using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Infrastructure.Persistence;

/// <summary>Fechamento mensal, faturas de cartão e contagem de vínculos.</summary>
public sealed partial class SqliteFinanceStore
{
    /// <summary>Mesmo formato de <c>GET /api/summary</c> (snake_case), para o resumo congelado no fechamento.</summary>
    private static readonly JsonSerializerOptions SummaryJson = new(JsonSerializerDefaults.Web) { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    public bool IsMonthClosed(string month)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM monthly_closings WHERE month=@month AND closed=1)", new { month });
    }

    public MonthlyClosing? FindClosing(string month)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.QuerySingleOrDefault<MonthlyClosing>("SELECT month, closed_at, notes, summary_json FROM monthly_closings WHERE month=@month AND closed=1", new { month });
    }

    public IReadOnlyList<MonthlyClosing> ListClosings()
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Query<MonthlyClosing>("SELECT month, closed_at, notes, summary_json FROM monthly_closings WHERE closed=1 ORDER BY month DESC").AsList();
    }

    public bool CloseMonth(MonthCloseCommand command)
    {
        var summaryJson = JsonSerializer.Serialize(command.Summary, SummaryJson);
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var changed = connection.Execute("""
            INSERT INTO monthly_closings(month, closed, closed_at, notes, summary_json) VALUES (@Month, 1, @ClosedAt, @Notes, @summaryJson)
            ON CONFLICT(month) DO UPDATE SET closed=1, closed_at=excluded.closed_at, notes=excluded.notes, summary_json=excluded.summary_json
            WHERE monthly_closings.closed=0
            """, new { command.Month, command.ClosedAt, command.Notes, summaryJson }, transaction);
        transaction.Commit();
        return changed > 0;
    }

    public bool ReopenMonth(string month)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Execute("UPDATE monthly_closings SET closed=0, closed_at=NULL, summary_json=NULL WHERE month=@month AND closed=1", new { month }) > 0;
    }

    public IReadOnlyList<Transaction> ListCardTransactions(long cardId, string? fromDate, string toDate)
    {
        using var connection = factory.CreateOpenConnection();
        var from = fromDate ?? "";
        return connection.Query<Transaction>($"{RecordModuleCatalog.TransactionSelect} AND t.card_id=@cardId AND t.date>=@from AND t.date<=@toDate ORDER BY t.date, t.id",
            new { cardId, from, toDate }).AsList();
    }

    public IReadOnlyList<Card> ListActiveCards()
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Query<Card>("SELECT * FROM cards WHERE active=1 ORDER BY name, id").AsList();
    }

    public IReadOnlyList<CardInvoicePayment> ListInvoicePayments(long cardId)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Query<CardInvoicePayment>("""
            SELECT p.card_id, p.month, p.amount_cents, p.date, p.account_id, a.name account_name, p.bank_entry_id
            FROM card_invoice_payments p LEFT JOIN bank_accounts a ON a.id=p.account_id
            WHERE p.card_id=@cardId ORDER BY p.month
            """, new { cardId }).AsList();
    }

    public OperationResult<long> PayCardInvoice(CardInvoicePaymentCommand command)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        if (!connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM cards WHERE id=@CardId)", command, transaction)) return OperationResult<long>.NotFound();
        if (connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM card_invoice_payments WHERE card_id=@CardId AND month=@Month)", command, transaction))
            return OperationResult<long>.Invalid("month", Messages.InvoiceAlreadyPaid);
        if (!connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM bank_accounts WHERE id=@AccountId AND active=1)", command, transaction))
            return OperationResult<long>.Invalid("account_id", Messages.AccountNotFound);

        var delta = BankRules.Movement("withdrawal", command.AmountCents, 0);
        var entryId = InsertBankEntry(connection, transaction, command.AccountId, command.Date, command.Description, "withdrawal", command.AmountCents, null, null, delta);
        connection.Execute("UPDATE bank_entries SET invoice_card_id=@CardId, invoice_month=@Month WHERE id=@entryId", new { command.CardId, command.Month, entryId }, transaction);
        AdjustAccountBalance(connection, transaction, command.AccountId, delta);
        connection.Execute("""
            INSERT INTO card_invoice_payments(card_id, month, amount_cents, paid_at, date, account_id, bank_entry_id)
            VALUES (@CardId, @Month, @AmountCents, @PaidAt, @Date, @AccountId, @entryId)
            """, new { command.CardId, command.Month, command.AmountCents, command.PaidAt, command.Date, command.AccountId, entryId }, transaction);
        transaction.Commit();
        return OperationResult<long>.Success(entryId);
    }

    public OperationResult<bool> UnpayCardInvoice(long cardId, string month)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var payment = connection.QuerySingleOrDefault<InvoicePaymentRow>("SELECT id, bank_entry_id FROM card_invoice_payments WHERE card_id=@cardId AND month=@month", new { cardId, month }, transaction);
        if (payment is null) return OperationResult<bool>.NotFound();
        // A saída pode já ter sido estornada no extrato; nesse caso o saldo já voltou.
        var entry = payment.BankEntryId is long entryId
            ? connection.QuerySingleOrDefault<BankEntryRow>("SELECT id, account_id, kind, amount_cents, delta_cents, transfer_entry_id FROM bank_entries WHERE id=@entryId AND deleted_at IS NULL", new { entryId }, transaction)
            : null;
        if (entry is not null) SoftDeleteBankEntry(connection, transaction, entry, BankRules.ReversibleDelta(entry.Kind, entry.AmountCents, entry.DeltaCents) ?? -entry.AmountCents);
        connection.Execute("DELETE FROM card_invoice_payments WHERE id=@Id", new { payment.Id }, transaction);
        transaction.Commit();
        return OperationResult<bool>.Success(true);
    }

    public ReassignCounts CountCategoryLinks(long categoryId)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.QuerySingle<ReassignCounts>("""
            SELECT (SELECT COUNT(*) FROM transactions WHERE category_id=@categoryId AND deleted_at IS NULL) transactions,
                   (SELECT COUNT(*) FROM bills WHERE category_id=@categoryId AND active=1) bills,
                   (SELECT COUNT(*) FROM subscriptions WHERE category_id=@categoryId AND active=1) subscriptions
            """, new { categoryId });
    }

    public CardLinks CountCardLinks(long cardId)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.QuerySingle<CardLinks>("""
            SELECT (SELECT COUNT(*) FROM transactions WHERE card_id=@cardId AND deleted_at IS NULL) transactions,
                   (SELECT COUNT(*) FROM subscriptions WHERE card_id=@cardId AND active=1) subscriptions
            """, new { cardId });
    }
}

internal sealed class InvoicePaymentRow
{
    public long Id { get; init; }
    public long? BankEntryId { get; init; }
}
