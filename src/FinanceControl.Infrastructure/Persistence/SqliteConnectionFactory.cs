using Dapper;
using Microsoft.Data.Sqlite;

namespace FinanceControl.Infrastructure.Persistence;

/// <summary>Abre conexões SQLite com WAL, chaves estrangeiras e busy timeout. O caminho vem somente de <see cref="DatabaseOptions"/>.</summary>
public sealed class SqliteConnectionFactory
{
    static SqliteConnectionFactory() => DefaultTypeMap.MatchNamesWithUnderscores = true;

    private readonly string _connectionString;

    public SqliteConnectionFactory(DatabaseOptions options)
    {
        DatabasePath = Path.IsPathRooted(options.Path)
            ? Path.GetFullPath(options.Path)
            : Path.GetFullPath(options.Path, Directory.GetCurrentDirectory());
        Directory.CreateDirectory(Path.GetDirectoryName(DatabasePath)!);
        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = DatabasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            ForeignKeys = true,
            Pooling = true
        }.ToString();
    }

    /// <summary>Caminho absoluto do arquivo de banco.</summary>
    public string DatabasePath { get; }

    /// <summary>Fecha as conexões ociosas do pool deste banco; a última a fechar consolida o WAL no arquivo .db.</summary>
    public void ClearPool()
    {
        using var connection = new SqliteConnection(_connectionString);
        SqliteConnection.ClearPool(connection);
    }

    /// <summary>
    /// Encerramento: consolida todo o WAL no arquivo .db e trunca o -wal (<c>PRAGMA wal_checkpoint(TRUNCATE)</c>),
    /// depois fecha as conexões ociosas do pool. Falhas no checkpoint não impedem a limpeza do pool (retorno false).
    /// </summary>
    public bool CheckpointAndClearPool()
    {
        try
        {
            using var connection = CreateOpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA wal_checkpoint(TRUNCATE);";
            command.ExecuteNonQuery();
            return true;
        }
        catch (SqliteException)
        {
            return false;
        }
        finally
        {
            ClearPool();
        }
    }

    public SqliteConnection CreateOpenConnection()
    {
        var connection = new SqliteConnection(_connectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;";
        command.ExecuteNonQuery();
        return connection;
    }
}
