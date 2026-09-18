using FinanceControl.Application.Common;
using FinanceControl.Domain.Entities;

namespace FinanceControl.Application.Ports;

public interface IAccountUseCases
{
    /// <summary>Cadastro livre: valida nome e senha e cria o usuário.</summary>
    OperationResult<UserAccount> Register(string? username, string? password);
    /// <summary>Usuário cujas credenciais conferem; null para nome inexistente ou senha errada (sem distinguir os casos).</summary>
    UserAccount? Authenticate(string? username, string? password);
    /// <summary>Sessão ainda válida: o usuário existe e o carimbo de segurança é o mesmo da emissão.</summary>
    bool IsSessionValid(long userId, string? securityStamp);
    IReadOnlyList<long> ListUserIds();
}
