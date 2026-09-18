using Dapper;
using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Domain.Entities;

namespace FinanceControl.Infrastructure.Persistence;

/// <summary>Cobranças de assinaturas e transferência de vínculos de categorias e cartões.</summary>
public sealed partial class SqliteFinanceStore
{
    public Subscription? FindActiveSubscription(long subscriptionId)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.QuerySingleOrDefault<Subscription>($"{RecordModuleCatalog.SubscriptionSelect} AND s.id=@subscriptionId", new { subscriptionId });
    }

    public OperationResult<long> ChargeSubscription(SubscriptionChargeCommand command)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        if (!connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM subscriptions WHERE id=@SubscriptionId AND active=1)", command, transaction))
            return OperationResult<long>.NotFound();

        if (connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM subscription_charges sc JOIN transactions t ON t.id=sc.transaction_id WHERE sc.subscription_id=@SubscriptionId AND sc.charge_date=@ChargeDate AND t.deleted_at IS NULL)", command, transaction))
            return OperationResult<long>.Invalid("date", Messages.ChargeAlreadyRegistered);
        // Débito automático nunca recria uma cobrança já registrada, mesmo com o lançamento removido.
        if (command.Automatic && connection.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM subscription_charges WHERE subscription_id=@SubscriptionId AND charge_date=@ChargeDate)", command, transaction))
            return OperationResult<long>.Invalid("date", Messages.ChargeAlreadyRegistered);

        // Cobrança cujo lançamento foi removido na tela de lançamentos: o registro antigo é substituído.
        connection.Execute("DELETE FROM subscription_charges WHERE subscription_id=@SubscriptionId AND charge_date=@ChargeDate", command, transaction);
        var transactionId = InsertTransaction(connection, transaction, command.Transaction);
        connection.Execute("INSERT INTO subscription_charges(subscription_id,charge_date,transaction_id) VALUES (@SubscriptionId,@ChargeDate,@transactionId)",
            new { command.SubscriptionId, command.ChargeDate, transactionId }, transaction);
        transaction.Commit();
        return OperationResult<long>.Success(transactionId);
    }

    public OperationResult<bool> UndoSubscriptionCharge(long subscriptionId, string chargeDate)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var charge = connection.QuerySingleOrDefault<ChargeLinkRow>(
            "SELECT id, transaction_id FROM subscription_charges WHERE subscription_id=@subscriptionId AND charge_date=@chargeDate", new { subscriptionId, chargeDate }, transaction);
        if (charge is null) return OperationResult<bool>.NotFound();
        if (charge.TransactionId is long transactionId) SoftDeleteTransaction(connection, transaction, transactionId);
        connection.Execute("DELETE FROM subscription_charges WHERE id=@Id", new { charge.Id }, transaction);
        transaction.Commit();
        return OperationResult<bool>.Success(true);
    }

    public Category? FindCategory(long categoryId)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.QuerySingleOrDefault<Category>("SELECT * FROM categories WHERE id=@categoryId", new { categoryId });
    }

    public Card? FindCard(long cardId)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.QuerySingleOrDefault<Card>("SELECT * FROM cards WHERE id=@cardId", new { cardId });
    }

    public ReassignCounts ReassignCategory(long sourceId, long? targetId)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var parameters = new { sourceId, targetId };
        var counts = new ReassignCounts(
            connection.Execute("UPDATE transactions SET category_id=@targetId WHERE category_id=@sourceId AND deleted_at IS NULL", parameters, transaction),
            connection.Execute("UPDATE bills SET category_id=@targetId WHERE category_id=@sourceId AND active=1", parameters, transaction),
            connection.Execute("UPDATE subscriptions SET category_id=@targetId WHERE category_id=@sourceId AND active=1", parameters, transaction));
        transaction.Commit();
        return counts;
    }

    public CardReassignCounts ReassignCard(long sourceId, long? targetId)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var parameters = new { sourceId, targetId };
        var counts = new CardReassignCounts(
            connection.Execute("UPDATE subscriptions SET card_id=@targetId WHERE card_id=@sourceId AND active=1", parameters, transaction),
            connection.Execute("UPDATE transactions SET card_id=@targetId WHERE card_id=@sourceId AND deleted_at IS NULL", parameters, transaction));
        transaction.Commit();
        return counts;
    }
}

internal sealed class ChargeLinkRow
{
    public long Id { get; init; }
    public long? TransactionId { get; init; }
}
