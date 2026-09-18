using System.Collections.Concurrent;
using System.Globalization;

namespace FinanceControl.Infrastructure.Persistence;

/// <summary>Pasta de dados: <c>accounts.db</c> (usuários) e <c>users/&lt;id&gt;/finance.db</c> (dados de cada usuário).</summary>
public sealed class DataOptions
{
    public const string SectionName = "Database";
    /// <summary>Relativa ao diretório atual do processo quando não for absoluta.</summary>
    public string Directory { get; init; } = "data";
}

/// <summary>
/// Um banco SQLite por usuário: o isolamento entre usuários é físico (arquivos separados), não um filtro em cada consulta.
/// Cada banco é migrado uma única vez por processo, na primeira abertura.
/// </summary>
public sealed class UserDatabases
{
    private readonly ConcurrentDictionary<long, Lazy<Task<SqliteConnectionFactory>>> _users = new();

    public UserDatabases(DataOptions options)
    {
        DataDirectory = Path.GetFullPath(options.Directory, System.IO.Directory.GetCurrentDirectory());
        Accounts = new SqliteConnectionFactory(new DatabaseOptions { Path = Path.Combine(DataDirectory, "accounts.db") });
    }

    /// <summary>Caminho absoluto da pasta de dados.</summary>
    public string DataDirectory { get; }
    public SqliteConnectionFactory Accounts { get; }

    public Task MigrateAccountsAsync(CancellationToken cancellationToken = default) =>
        new DatabaseMigrator(Accounts, DatabaseMigrator.AccountFolder).MigrateAsync(cancellationToken);

    public string UserDatabasePath(long userId) =>
        Path.Combine(DataDirectory, "users", userId.ToString(CultureInfo.InvariantCulture), "finance.db");

    /// <summary>Banco financeiro do usuário, criado e migrado na primeira chamada. Uma falha não fica em cache.</summary>
    public async Task<SqliteConnectionFactory> OpenAsync(long userId)
    {
        var entry = _users.GetOrAdd(userId, id => new Lazy<Task<SqliteConnectionFactory>>(() => CreateAsync(id)));
        try
        {
            return await entry.Value;
        }
        catch
        {
            _users.TryRemove(new KeyValuePair<long, Lazy<Task<SqliteConnectionFactory>>>(userId, entry));
            throw;
        }
    }

    private async Task<SqliteConnectionFactory> CreateAsync(long userId)
    {
        var factory = new SqliteConnectionFactory(new DatabaseOptions { Path = UserDatabasePath(userId) });
        await new DatabaseMigrator(factory).MigrateAsync();
        return factory;
    }

    /// <summary>Encerramento: consolida o WAL de todos os bancos abertos; false se algum checkpoint falhou.</summary>
    public bool CheckpointAll()
    {
        var ok = true;
        foreach (var entry in _users.Values)
            if (entry.IsValueCreated && entry.Value.IsCompletedSuccessfully)
                ok &= entry.Value.Result.CheckpointAndClearPool();
        return Accounts.CheckpointAndClearPool() && ok;
    }
}

/// <summary>
/// Usuário da requisição (ou do job em segundo plano) e o banco dele. Preenchido pelo pipeline HTTP após a autenticação
/// ou explicitamente pelos jobs; resolver o banco sem usuário é um erro de programação.
/// </summary>
public sealed class UserDatabaseScope(UserDatabases databases)
{
    private SqliteConnectionFactory? _database;

    public long? UserId { get; private set; }

    public SqliteConnectionFactory Database =>
        _database ?? throw new InvalidOperationException("Nenhum usuário definido para acessar os dados financeiros.");

    public async Task EnterAsync(long userId)
    {
        if (UserId is not null && UserId != userId) throw new InvalidOperationException("O escopo já pertence a outro usuário.");
        _database = await databases.OpenAsync(userId);
        UserId = userId;
    }
}
