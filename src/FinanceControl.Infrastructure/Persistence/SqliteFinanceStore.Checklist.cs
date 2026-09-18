using Dapper;
using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;
using Microsoft.Data.Sqlite;

namespace FinanceControl.Infrastructure.Persistence;

public sealed partial class SqliteFinanceStore
{
    public MonthlySummary GetMonthlySummary(string month)
    {
        var (start, end) = MonthRange(month);
        using var connection = factory.CreateOpenConnection();
        var totals = connection.QuerySingle<MonthTotals>("""
            SELECT COALESCE(SUM(CASE WHEN t.kind='income' THEN COALESCE(t.base_amount_cents,t.amount_cents) END),0) income_cents,
                   COALESCE(SUM(CASE WHEN t.kind='expense' THEN COALESCE(t.base_amount_cents,t.amount_cents) END),0) expense_cents,
                   COALESCE(SUM(CASE WHEN t.kind='investment' THEN COALESCE(t.base_amount_cents,t.amount_cents) END),0) investment_cents,
                   COUNT(*) transactions_count,
                   COALESCE(SUM(CASE WHEN t.kind='expense' AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id=t.category_id AND c.kind='expense') THEN COALESCE(t.base_amount_cents,t.amount_cents) END),0) uncategorized_expense_cents,
                   COALESCE(SUM(CASE WHEN t.kind='income' AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id=t.category_id AND c.kind='income') THEN COALESCE(t.base_amount_cents,t.amount_cents) END),0) uncategorized_income_cents,
                   COALESCE(SUM(CASE WHEN t.kind='investment' AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id=t.category_id AND c.kind='investment') THEN COALESCE(t.base_amount_cents,t.amount_cents) END),0) uncategorized_investment_cents
            FROM transactions t
            WHERE t.deleted_at IS NULL AND t.date>=@start AND t.date<@end
            """, new { start, end });
        // Contas em outra moeda entram convertidas pela última cotação (sem cotação, não somam valor).
        var rates = connection.Query<ExchangeRate>("SELECT currency, rate_brl FROM exchange_rates").AsList()
            .Where(rate => CurrencyRules.ParseRate(rate.RateBrl) is not null)
            .ToDictionary(rate => rate.Currency, rate => CurrencyRules.ParseRate(rate.RateBrl)!.Value, StringComparer.Ordinal);
        var billRows = connection.Query<BillSummaryRow>("""
            SELECT b.amount_cents, b.currency, COALESCE(bp.paid,0) paid
            FROM bills b LEFT JOIN bill_payments bp ON bp.bill_id=b.id AND bp.month=@month
            WHERE b.active=1 AND (b.active_since IS NULL OR substr(b.active_since,1,7)<=@month)
            """, new { month }).AsList();
        var bills = new BillsSummary
        {
            TotalCount = billRows.Count,
            PaidCount = billRows.Count(row => row.Paid),
            TotalCents = billRows.Sum(row => CurrencyRules.ToBaseCents(row.AmountCents, row.Currency, rates) ?? 0),
            PaidCents = billRows.Where(row => row.Paid).Sum(row => CurrencyRules.ToBaseCents(row.AmountCents, row.Currency, rates) ?? 0)
        };
        return new MonthlySummary(
            month, totals.IncomeCents, totals.ExpenseCents, totals.InvestmentCents, totals.TransactionsCount, totals.UncategorizedExpenseCents,
            CategoryTotals(connection, "expense", start, end), bills,
            CategoryTotals(connection, "income", start, end), CategoryTotals(connection, "investment", start, end),
            totals.UncategorizedIncomeCents, totals.UncategorizedInvestmentCents);
    }

    /// <summary>Realizado no mês por categoria do tipo: todas as ativas e as removidas com valor (valor desc, nome).</summary>
    private static List<CategorySpend> CategoryTotals(SqliteConnection connection, string kind, string start, string end) =>
        connection.Query<CategorySpend>("""
            SELECT c.id category_id, c.name, c.monthly_budget_cents, COALESCE(s.spent,0) spent_cents, c.active, c.bucket
            FROM categories c
            LEFT JOIN (SELECT category_id, SUM(COALESCE(base_amount_cents,amount_cents)) spent FROM transactions
                       WHERE deleted_at IS NULL AND kind=@kind AND date>=@start AND date<@end GROUP BY category_id) s ON s.category_id=c.id
            WHERE c.kind=@kind AND (c.active=1 OR COALESCE(s.spent,0)>0)
            ORDER BY spent_cents DESC, c.name
            """, new { kind, start, end }).AsList();

    public IReadOnlyList<BillChecklistItem> GetChecklist(string month)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Query<BillChecklistItem>("""
            SELECT b.*, c.name category_name, a.name account_name, COALESCE(bp.paid,0) paid, bp.paid_at,
                   CASE WHEN t.deleted_at IS NULL THEN t.id END transaction_id, COALESCE(bp.auto_debit_skipped,0) auto_debit_skipped
            FROM bills b
            LEFT JOIN categories c ON c.id=b.category_id
            LEFT JOIN bank_accounts a ON a.id=b.account_id
            LEFT JOIN bill_payments bp ON bp.bill_id=b.id AND bp.month=@month
            LEFT JOIN transactions t ON t.id=bp.transaction_id
            WHERE b.active=1 AND (b.active_since IS NULL OR substr(b.active_since,1,7)<=@month)
            ORDER BY b.due_day, b.name
            """, new { month }).AsList();
    }

    public Bill? FindActiveBill(long billId)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.QuerySingleOrDefault<Bill>("SELECT b.*, a.name account_name FROM bills b LEFT JOIN bank_accounts a ON a.id=b.account_id WHERE b.id=@billId AND b.active=1", new { billId });
    }

    public OperationResult<long?> PayBill(BillPaymentCommand command)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        if (!connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM bills WHERE id=@BillId AND active=1)", command, transaction)) return OperationResult<long?>.NotFound();
        var payment = connection.QuerySingleOrDefault<PaymentRow>("SELECT paid, transaction_id FROM bill_payments WHERE bill_id=@BillId AND month=@Month", command, transaction);
        if (payment?.Paid == true)
        {
            var existing = payment.TransactionId is long linked && connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM transactions WHERE id=@linked AND deleted_at IS NULL)", new { linked }, transaction)
                ? payment.TransactionId
                : null;
            return OperationResult<long?>.Success(existing);
        }

        long? transactionId = command.Transaction is null ? null : InsertTransaction(connection, transaction, command.Transaction);
        connection.Execute("""
            INSERT INTO bill_payments(bill_id,month,paid,paid_at,transaction_id) VALUES (@BillId,@Month,1,@PaidAt,@transactionId)
            ON CONFLICT(bill_id,month) DO UPDATE SET paid=1, paid_at=excluded.paid_at, transaction_id=excluded.transaction_id
            """, new { command.BillId, command.Month, command.PaidAt, transactionId }, transaction);
        transaction.Commit();
        return OperationResult<long?>.Success(transactionId);
    }

    public OperationResult<bool> UnpayBill(long billId, string month)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        if (!connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM bills WHERE id=@billId AND active=1)", new { billId }, transaction)) return OperationResult<bool>.NotFound();
        var payment = connection.QuerySingleOrDefault<PaymentRow>("SELECT paid, transaction_id FROM bill_payments WHERE bill_id=@billId AND month=@month", new { billId, month }, transaction);
        if (payment?.TransactionId is long linked) SoftDeleteTransaction(connection, transaction, linked);
        // Desmarcar impede que o débito automático pague a conta de novo no mesmo mês.
        connection.Execute("""
            INSERT INTO bill_payments(bill_id,month,paid,paid_at,transaction_id,auto_debit_skipped) VALUES (@billId,@month,0,NULL,NULL,1)
            ON CONFLICT(bill_id,month) DO UPDATE SET paid=0, paid_at=NULL, transaction_id=NULL, auto_debit_skipped=1
            """, new { billId, month }, transaction);
        transaction.Commit();
        return OperationResult<bool>.Success(true);
    }
}

internal sealed class BillSummaryRow
{
    public long AmountCents { get; init; }
    public string Currency { get; init; } = "BRL";
    public bool Paid { get; init; }
}

internal sealed class PaymentRow
{
    public bool Paid { get; init; }
    public long? TransactionId { get; init; }
}
