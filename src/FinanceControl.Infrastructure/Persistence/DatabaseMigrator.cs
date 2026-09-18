using System.Text.RegularExpressions;
using Dapper;

namespace FinanceControl.Infrastructure.Persistence;

/// <summary>
/// Aplica, em ordem e uma única vez, as migrações SQL embutidas de uma pasta: <see cref="FinanceFolder"/> (banco
/// financeiro de cada usuário) ou <see cref="AccountFolder"/> (banco de contas).
/// </summary>
public sealed class DatabaseMigrator(SqliteConnectionFactory connectionFactory, string migrationFolder = DatabaseMigrator.FinanceFolder)
{
    public const string FinanceFolder = "Migrations";
    public const string AccountFolder = "AccountMigrations";

    private readonly Regex _migrationName = new($@"\.{Regex.Escape(migrationFolder)}\.(?<id>\d{{3}}_[^.]+)\.sql$", RegexOptions.CultureInvariant);

    public async Task MigrateAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = connectionFactory.CreateOpenConnection();
        await connection.ExecuteAsync("PRAGMA journal_mode = WAL;");
        await connection.ExecuteAsync("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
        var applied = (await connection.QueryAsync<string>("SELECT id FROM schema_migrations")).ToHashSet(StringComparer.Ordinal);
        var assembly = typeof(DatabaseMigrator).Assembly;
        var migrations = assembly.GetManifestResourceNames()
            .Select(name => (Name: name, Match: _migrationName.Match(name)))
            .Where(item => item.Match.Success)
            .Select(item => (item.Name, Id: item.Match.Groups["id"].Value))
            .OrderBy(item => item.Id, StringComparer.Ordinal);

        foreach (var migration in migrations)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (applied.Contains(migration.Id)) continue;
            await using var stream = assembly.GetManifestResourceStream(migration.Name) ?? throw new InvalidOperationException($"Migração não encontrada: {migration.Name}");
            using var reader = new StreamReader(stream);
            var sql = await reader.ReadToEndAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
            await connection.ExecuteAsync(sql, transaction: transaction);
            await connection.ExecuteAsync("INSERT INTO schema_migrations(id) VALUES (@Id)", new { migration.Id }, transaction);
            await transaction.CommitAsync(cancellationToken);
        }
    }
}
