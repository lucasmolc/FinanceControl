using FinanceControl.Domain.Entities;

namespace FinanceControl.Application.Ports;

/// <summary>Porta de persistência das contas de usuário (separada dos dados financeiros de cada usuário).</summary>
public interface IAccountStore
{
    /// <summary>Id do usuário criado; null quando o nome já está em uso (comparação sem diferenciar maiúsculas).</summary>
    long? CreateUser(string username, string passwordHash, string securityStamp);
    UserAccount? FindByUsername(string username);
    UserAccount? FindById(long id);
    IReadOnlyList<long> ListUserIds();
}
