using System.Security.Cryptography;
using System.Text.RegularExpressions;
using FinanceControl.Application.Common;
using FinanceControl.Application.Ports;
using FinanceControl.Application.Security;
using FinanceControl.Domain.Entities;

namespace FinanceControl.Application.UseCases;

public sealed partial class AccountService(IAccountStore store) : IAccountUseCases
{
    private const int MinPasswordLength = 8;
    private const int MaxPasswordLength = 128;

    /// <summary>Hash verificado quando o usuário não existe: o login leva o mesmo tempo e não revela nomes cadastrados.</summary>
    private static readonly Lazy<string> DummyHash = new(() => PasswordHasher.Hash(Convert.ToHexString(RandomNumberGenerator.GetBytes(16))));

    [GeneratedRegex("^[a-z0-9._-]{3,32}$", RegexOptions.CultureInvariant)]
    private static partial Regex UsernamePattern();

    public OperationResult<UserAccount> Register(string? username, string? password)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var normalized = Normalize(username);
        if (normalized.Length == 0) errors["username"] = [Messages.Required];
        else if (!UsernamePattern().IsMatch(normalized)) errors["username"] = [Messages.Username];
        if (string.IsNullOrEmpty(password)) errors["password"] = [Messages.Required];
        else if (password.Length is < MinPasswordLength or > MaxPasswordLength) errors["password"] = [Messages.PasswordLength];
        if (errors.Count > 0) return OperationResult<UserAccount>.Invalid(errors);

        var hash = PasswordHasher.Hash(password!);
        var stamp = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
        var id = store.CreateUser(normalized, hash, stamp);
        return id is null
            ? OperationResult<UserAccount>.Invalid("username", Messages.UsernameTaken)
            : OperationResult<UserAccount>.Success(new UserAccount(id.Value, normalized, hash, stamp));
    }

    public UserAccount? Authenticate(string? username, string? password)
    {
        if (string.IsNullOrEmpty(password) || password.Length > MaxPasswordLength) return null;
        var normalized = Normalize(username);
        var account = normalized.Length == 0 ? null : store.FindByUsername(normalized);
        var verified = PasswordHasher.Verify(password, account?.PasswordHash ?? DummyHash.Value);
        return account is not null && verified ? account : null;
    }

    public bool IsSessionValid(long userId, string? securityStamp) =>
        securityStamp is not null && store.FindById(userId) is { } account
        && CryptographicOperations.FixedTimeEquals(System.Text.Encoding.UTF8.GetBytes(account.SecurityStamp), System.Text.Encoding.UTF8.GetBytes(securityStamp));

    public IReadOnlyList<long> ListUserIds() => store.ListUserIds();

    private static string Normalize(string? username) => (username ?? "").Trim().ToLowerInvariant();
}
