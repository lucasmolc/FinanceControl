using Dapper;
using FinanceControl.Application.Ports;
using FinanceControl.Domain.Entities;

namespace FinanceControl.Infrastructure.Persistence;

/// <summary>Contas de usuário no banco <c>accounts.db</c>.</summary>
public sealed class SqliteAccountStore(UserDatabases databases) : IAccountStore
{
    private const string Columns = "id AS Id, username AS Username, password_hash AS PasswordHash, security_stamp AS SecurityStamp";

    public long? CreateUser(string username, string passwordHash, string securityStamp)
    {
        using var connection = databases.Accounts.CreateOpenConnection();
        return connection.ExecuteScalar<long?>(
            "INSERT INTO users(username, password_hash, security_stamp) VALUES (@username, @passwordHash, @securityStamp) ON CONFLICT(username) DO NOTHING RETURNING id",
            new { username, passwordHash, securityStamp });
    }

    public UserAccount? FindByUsername(string username)
    {
        using var connection = databases.Accounts.CreateOpenConnection();
        return connection.QuerySingleOrDefault<UserAccount>($"SELECT {Columns} FROM users WHERE username = @username", new { username });
    }

    public UserAccount? FindById(long id)
    {
        using var connection = databases.Accounts.CreateOpenConnection();
        return connection.QuerySingleOrDefault<UserAccount>($"SELECT {Columns} FROM users WHERE id = @id", new { id });
    }

    public IReadOnlyList<long> ListUserIds()
    {
        using var connection = databases.Accounts.CreateOpenConnection();
        return connection.Query<long>("SELECT id FROM users ORDER BY id").AsList();
    }
}
