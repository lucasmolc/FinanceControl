using FinanceControl.Application.Validation;

namespace FinanceControl.Infrastructure.Persistence;

/// <summary>Mapeamento módulo → tabela e consulta de listagem. Os campos graváveis vêm do esquema da aplicação,
/// mais as colunas preenchidas pela própria aplicação (<paramref name="InternalColumns"/>); campos de controle do esquema
/// que não são colunas (<see cref="ModuleSchemas.ControlFields"/>) nunca chegam ao banco.</summary>
internal sealed record RecordModuleDefinition(string Name, string Table, string SelectSql, bool IsTransaction = false, params string[] InternalColumns)
{
    public IReadOnlySet<string> Columns { get; } = ModuleSchemas.Records[Name].FieldNames
        .Where(field => !ModuleSchemas.ControlFields.Contains(field))
        .Concat(InternalColumns)
        .ToHashSet(StringComparer.Ordinal);
}

internal static class RecordModuleCatalog
{
    /// <summary>Colunas do formato de lançamento da API, sem filtro (use <see cref="TransactionSelect"/> para os não removidos).</summary>
    internal const string TransactionColumns = "SELECT t.id,t.date,t.description,t.category_id,t.kind,t.amount_cents,t.payment_method,t.notes,c.name category_name,t.account_id,a.name account_name,t.card_id,k.name card_name,t.currency,COALESCE(t.base_amount_cents,t.amount_cents) base_amount_cents,COALESCE(t.exchange_rate,'1') exchange_rate,t.brand,t.installment_number,t.installment_count,t.installment_group,(t.import_fingerprint IS NOT NULL) imported FROM transactions t LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN bank_accounts a ON a.id=t.account_id LEFT JOIN cards k ON k.id=t.card_id";
    internal const string TransactionSelect = TransactionColumns + " WHERE t.deleted_at IS NULL";
    /// <summary>Contas ativas com a data da última movimentação não estornada (entradas do extrato ou lançamentos vinculados não removidos).</summary>
    internal const string BankAccountSelect = "SELECT b.*,(SELECT MAX(d) FROM (SELECT MAX(e.date) d FROM bank_entries e WHERE e.account_id=b.id AND e.deleted_at IS NULL UNION ALL SELECT MAX(t.date) FROM transactions t WHERE t.account_id=b.id AND t.deleted_at IS NULL)) last_movement_date FROM bank_accounts b WHERE b.active=1 ORDER BY b.institution,b.name";
    /// <summary>Assinaturas com nomes vinculados e a última cobrança cujo lançamento não foi removido.</summary>
    internal const string SubscriptionSelect = "SELECT s.*,c.name category_name,ca.name card_name,ac.name account_name,(SELECT MAX(sc.charge_date) FROM subscription_charges sc JOIN transactions ct ON ct.id=sc.transaction_id WHERE sc.subscription_id=s.id AND ct.deleted_at IS NULL) last_charge_date FROM subscriptions s LEFT JOIN categories c ON c.id=s.category_id LEFT JOIN cards ca ON ca.id=s.card_id LEFT JOIN bank_accounts ac ON ac.id=s.account_id WHERE s.active=1";
    internal const string BillSelect = "SELECT b.*,c.name category_name,a.name account_name FROM bills b LEFT JOIN categories c ON c.id=b.category_id LEFT JOIN bank_accounts a ON a.id=b.account_id WHERE b.active=1 ORDER BY b.due_day,b.name";

    internal static readonly IReadOnlyDictionary<string, RecordModuleDefinition> All = new[]
    {
        new RecordModuleDefinition("bills", "bills", BillSelect, false, "auto_debit_since"),
        new RecordModuleDefinition("goals", "goals", "SELECT * FROM goals WHERE active=1 ORDER BY id DESC"),
        new RecordModuleDefinition("investments", "investments", "SELECT * FROM investments WHERE active=1 ORDER BY id DESC"),
        new RecordModuleDefinition("cards", "cards", "SELECT * FROM cards WHERE active=1 ORDER BY id"),
        new RecordModuleDefinition("categories", "categories", "SELECT * FROM categories WHERE active=1 ORDER BY kind,name"),
        new RecordModuleDefinition("transactions", "transactions", $"{TransactionSelect} ORDER BY t.date DESC,t.id DESC LIMIT 250", true, "base_amount_cents", "installment_group", "import_fingerprint"),
        new RecordModuleDefinition("bank-accounts", "bank_accounts", BankAccountSelect),
        new RecordModuleDefinition("subscriptions", "subscriptions", $"{SubscriptionSelect} ORDER BY s.billing_day,s.name", false, "auto_debit_since")
    }.ToDictionary(item => item.Name, StringComparer.Ordinal);

    internal static RecordModuleDefinition Get(string module) =>
        All.TryGetValue(module, out var definition) ? definition : throw new ArgumentOutOfRangeException(nameof(module), module, "Módulo inválido.");
}
