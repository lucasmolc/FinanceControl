namespace FinanceControl.Domain.Entities;

/// <summary>Usuário da aplicação. <see cref="SecurityStamp"/> muda quando as sessões existentes devem deixar de valer.</summary>
public sealed record UserAccount(long Id, string Username, string PasswordHash, string SecurityStamp);
