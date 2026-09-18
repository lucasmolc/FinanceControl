using FinanceControl.Application.Common;

namespace FinanceControl.Application.UseCases;

/// <summary>Valida a estrutura de um documento de backup (versões 2 e 3) antes de qualquer alteração no banco.</summary>
public static class BackupRestoreValidator
{
    public static readonly IReadOnlyList<string> Tables =
    [
        "settings", "categories", "transactions", "bills", "bill_payments", "goals", "goal_entries",
        "investments", "investment_entries", "cards", "bank_accounts", "bank_entries", "subscriptions", "subscription_charges", "monthly_closings",
        "card_invoice_payments", "exchange_rates", "market_indicators", "net_worth_snapshots"
    ];

    public static OperationResult<IReadOnlyDictionary<string, IReadOnlyList<IReadOnlyDictionary<string, object?>>>> Validate(object? document)
    {
        if (document is not IReadOnlyDictionary<string, object?> root) return Invalid("body", Messages.BodyObject);
        if (!root.TryGetValue("version", out var version) || version is not (2L or 3L)) return Invalid("version", Messages.BackupVersion);
        if (!root.TryGetValue("data", out var rawData) || rawData is not IReadOnlyDictionary<string, object?> data) return Invalid("data", Messages.BackupData);

        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var tables = new Dictionary<string, IReadOnlyList<IReadOnlyDictionary<string, object?>>>(StringComparer.Ordinal);
        foreach (var (table, rawRows) in data)
        {
            if (table == "schema_migrations") continue;
            if (!Tables.Contains(table, StringComparer.Ordinal)) { errors[$"data.{table}"] = [Messages.BackupUnknownTable]; continue; }
            if (rawRows is not IReadOnlyList<object?> list) { errors[$"data.{table}"] = [Messages.BackupRows]; continue; }

            var rows = new List<IReadOnlyDictionary<string, object?>>(list.Count);
            foreach (var item in list)
            {
                if (item is not IReadOnlyDictionary<string, object?> row) { errors[$"data.{table}"] = [Messages.BackupRows]; break; }
                var normalized = new Dictionary<string, object?>(StringComparer.Ordinal);
                foreach (var (column, value) in row)
                {
                    switch (value)
                    {
                        case null or string or long or double: normalized[column] = value; break;
                        case bool flag: normalized[column] = flag ? 1L : 0L; break;
                        default: errors[$"{table}.{column}"] = [Messages.InvalidValue]; break;
                    }
                }
                rows.Add(normalized);
            }
            tables[table] = rows;
        }

        if (tables.TryGetValue("settings", out var settings) && (settings.Count != 1 || !settings[0].TryGetValue("id", out var id) || id is not 1L))
            errors["data.settings"] = [Messages.BackupSettings];

        return errors.Count > 0
            ? OperationResult<IReadOnlyDictionary<string, IReadOnlyList<IReadOnlyDictionary<string, object?>>>>.Invalid(errors)
            : OperationResult<IReadOnlyDictionary<string, IReadOnlyList<IReadOnlyDictionary<string, object?>>>>.Success(tables);
    }

    private static OperationResult<IReadOnlyDictionary<string, IReadOnlyList<IReadOnlyDictionary<string, object?>>>> Invalid(string field, string message) =>
        OperationResult<IReadOnlyDictionary<string, IReadOnlyList<IReadOnlyDictionary<string, object?>>>>.Invalid(field, message);
}
