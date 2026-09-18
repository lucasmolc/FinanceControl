using Dapper;
using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Application.UseCases;
using FinanceControl.Domain.Entities;
using Microsoft.Data.Sqlite;

namespace FinanceControl.Infrastructure.Persistence;

public sealed partial class SqliteFinanceStore
{
    private const int BackupVersion = 3;

    /// <summary>Tabelas mantidas como estão quando o backup não as traz; as demais ausentes são esvaziadas.</summary>
    private static readonly HashSet<string> KeptWhenAbsent = new(["settings", "exchange_rates", "market_indicators"], StringComparer.Ordinal);

    public BackupDocument CreateBackup()
    {
        using var connection = factory.CreateOpenConnection();
        var data = BackupRestoreValidator.Tables.Append("schema_migrations")
            .ToDictionary<string, string, IReadOnlyList<IReadOnlyDictionary<string, object?>>>(table => table, table => ReadRows(connection, $"SELECT * FROM {table}"));
        return new BackupDocument(BackupVersion, DateTimeOffset.UtcNow.ToString("O"), data);
    }

    public byte[] CreateDatabaseSnapshot()
    {
        var path = Path.Combine(Path.GetTempPath(), $"lmm-finance-snapshot-{Guid.NewGuid():N}.db");
        try
        {
            using (var connection = factory.CreateOpenConnection()) connection.Execute("VACUUM INTO @path", new { path });
            return File.ReadAllBytes(path);
        }
        finally
        {
            if (File.Exists(path)) File.Delete(path);
        }
    }

    public AboutInfo GetAbout()
    {
        using var connection = factory.CreateOpenConnection();
        var version = connection.ExecuteScalar<string?>("SELECT MAX(id) FROM schema_migrations") ?? "";
        return new AboutInfo(factory.DatabasePath, version);
    }

    public OperationResult<RestoreResult> RestoreBackup(RestorePlan plan)
    {
        using var connection = factory.CreateOpenConnection();

        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        foreach (var (table, rows) in plan.Tables)
        {
            var columns = connection.Query<string>("SELECT name FROM pragma_table_info(@table)", new { table }).ToHashSet(StringComparer.Ordinal);
            foreach (var column in rows.SelectMany(row => row.Keys).Distinct(StringComparer.Ordinal))
                if (!columns.Contains(column)) errors[$"{table}.{column}"] = [Messages.BackupUnknownColumn];
        }
        if (errors.Count > 0) return OperationResult<RestoreResult>.Invalid(errors);

        var safetyCopy = CreateSafetyCopy(connection, plan.SafetyCopyFileName);
        var restored = new Dictionary<string, long>(StringComparer.Ordinal);
        connection.Execute("PRAGMA foreign_keys = OFF");
        try
        {
            using var transaction = connection.BeginTransaction();
            foreach (var table in BackupRestoreValidator.Tables)
            {
                if (!plan.Tables.TryGetValue(table, out var rows))
                {
                    // Ausentes no documento: configurações, cotações e indicadores atuais são mantidos (backups anteriores à v1.2, MEL-46).
                    if (KeptWhenAbsent.Contains(table)) continue;
                    connection.Execute($"DELETE FROM {table}", transaction: transaction);
                    restored[table] = 0;
                    continue;
                }

                try
                {
                    connection.Execute($"DELETE FROM {table}", transaction: transaction);
                    foreach (var row in rows) InsertRestoredRow(connection, transaction, table, row);
                }
                catch (SqliteException)
                {
                    transaction.Rollback();
                    return OperationResult<RestoreResult>.Invalid($"data.{table}", Messages.BackupInvalidRows);
                }
                restored[table] = rows.Count;
            }

            if (connection.Query("PRAGMA foreign_key_check", transaction: transaction).Any())
            {
                transaction.Rollback();
                return OperationResult<RestoreResult>.Invalid("data", Messages.BackupForeignKeys);
            }
            ResetSequences(connection, transaction);
            transaction.Commit();
        }
        finally
        {
            connection.Execute("PRAGMA foreign_keys = ON");
        }

        return OperationResult<RestoreResult>.Success(new RestoreResult(true, safetyCopy, restored));
    }

    /// <summary>Alinha o AUTOINCREMENT ao conteúdo restaurado: próximo id = MAX(id) + 1; tabelas vazias voltam a começar do 1.</summary>
    private static void ResetSequences(SqliteConnection connection, SqliteTransaction transaction)
    {
        var autoincrement = connection.Query<string>("SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%AUTOINCREMENT%'", transaction: transaction)
            .ToHashSet(StringComparer.Ordinal);
        foreach (var table in BackupRestoreValidator.Tables.Where(autoincrement.Contains))
        {
            connection.Execute("DELETE FROM sqlite_sequence WHERE name=@table", new { table }, transaction);
            connection.Execute($"INSERT INTO sqlite_sequence(name, seq) SELECT @table, m FROM (SELECT MAX(id) m FROM {table}) WHERE m IS NOT NULL", new { table }, transaction);
        }
    }

    private string CreateSafetyCopy(SqliteConnection connection, string fileName)
    {
        var directory = Path.Combine(Path.GetDirectoryName(factory.DatabasePath)!, "backups");
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, fileName);
        for (var attempt = 2; File.Exists(path); attempt++)
            path = Path.Combine(directory, $"{Path.GetFileNameWithoutExtension(fileName)}-{attempt}{Path.GetExtension(fileName)}");
        connection.Execute("VACUUM INTO @path", new { path });
        return path;
    }

    private static void InsertRestoredRow(SqliteConnection connection, SqliteTransaction transaction, string table, IReadOnlyDictionary<string, object?> row)
    {
        if (row.Count == 0)
        {
            connection.Execute($"INSERT INTO {table} DEFAULT VALUES", transaction: transaction);
            return;
        }
        var columns = row.Keys.ToArray();
        var parameters = new DynamicParameters();
        for (var index = 0; index < columns.Length; index++) parameters.Add($"p{index}", row[columns[index]]);
        var sql = $"INSERT INTO {table} ({string.Join(',', columns.Select(column => $"\"{column}\""))}) VALUES ({string.Join(',', columns.Select((_, index) => $"@p{index}"))})";
        connection.Execute(sql, parameters, transaction);
    }
}
