using System.Text.RegularExpressions;
using Dapper;

namespace FinanceControl.Infrastructure.Persistence;

public sealed partial class DatabaseMigrator(SqliteConnectionFactory connectionFactory)
{
    [GeneratedRegex(@"\.Migrations\.(?<id>\d{3}_[^.]+)\.sql$", RegexOptions.CultureInvariant)]
    private static partial Regex MigrationNamePattern();

    public async Task MigrateAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = connectionFactory.CreateOpenConnection();
        await connection.ExecuteAsync("PRAGMA journal_mode = WAL;");
        await connection.ExecuteAsync("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
        var applied = (await connection.QueryAsync<string>("SELECT id FROM schema_migrations")).ToHashSet(StringComparer.Ordinal);
        var assembly = typeof(DatabaseMigrator).Assembly;
        var migrations = assembly.GetManifestResourceNames()
            .Select(name => (Name: name, Match: MigrationNamePattern().Match(name)))
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
