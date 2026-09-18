namespace FinanceControl.Domain.Rules;

/// <summary>Efeito de um lançamento no saldo da conta bancária vinculada.</summary>
public static class TransactionRules
{
    public static long BalanceDelta(string kind, long amountCents) => kind switch
    {
        "income" => amountCents,
        "expense" or "investment" => -amountCents,
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Tipo de lançamento inválido.")
    };
}

public readonly record struct InvestmentDelta(long InvestedCents, long CurrentCents);

public readonly record struct InvestmentPosition(long InvestedCents, long CurrentCents)
{
    public bool IsValid => InvestedCents >= 0 && CurrentCents >= 0;
    public InvestmentPosition Apply(InvestmentDelta delta) => new(InvestedCents + delta.InvestedCents, CurrentCents + delta.CurrentCents);
    public InvestmentPosition Revert(InvestmentDelta delta) => new(InvestedCents - delta.InvestedCents, CurrentCents - delta.CurrentCents);
}

/// <summary>Movimentações de investimentos: aporte, resgate, rendimento e ajuste de saldo.</summary>
public static class InvestmentRules
{
    public static InvestmentDelta Movement(string kind, long amountCents, InvestmentPosition position) => kind switch
    {
        "deposit" => new(amountCents, amountCents),
        "withdrawal" => new(-AverageCostReduction(amountCents, position), -amountCents),
        "yield" => new(0, amountCents),
        "adjustment" => new(0, amountCents - position.CurrentCents),
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Tipo de movimentação inválido.")
    };

    /// <summary>Resgate pelo custo médio: o valor aplicado cai na proporção do resgate sobre o saldo atual
    /// (arredondamento para o centavo mais próximo, meio centavo para cima), nunca abaixo de zero.</summary>
    public static long AverageCostReduction(long amountCents, InvestmentPosition position)
    {
        if (position.CurrentCents <= 0) return Math.Min(position.InvestedCents, amountCents);
        // Int128 evita estouro em invested × amount; (2·n + d) / (2·d) arredonda o meio para cima (valores não negativos).
        var numerator = (Int128)position.InvestedCents * amountCents;
        var proportional = (2 * numerator + position.CurrentCents) / (2 * (Int128)position.CurrentCents);
        return proportional >= position.InvestedCents ? position.InvestedCents : (long)proportional;
    }

    /// <summary>Delta registrado de uma movimentação; para linhas anteriores ao histórico detalhado deriva do tipo quando possível (null = não estornável).</summary>
    public static InvestmentDelta? RecordedDelta(string kind, long amountCents, long? investedDeltaCents, long? currentDeltaCents)
    {
        if (investedDeltaCents is long invested && currentDeltaCents is long current) return new InvestmentDelta(invested, current);
        return kind switch
        {
            "deposit" => new InvestmentDelta(amountCents, amountCents),
            "withdrawal" => new InvestmentDelta(-amountCents, -amountCents),
            "yield" => new InvestmentDelta(0, amountCents),
            _ => null
        };
    }
}

/// <summary>Movimentações de contas bancárias. Saldos podem ficar negativos (cheque especial).</summary>
public static class BankRules
{
    public static long Movement(string kind, long amountCents, long balanceCents) => kind switch
    {
        "deposit" or "transfer_in" => amountCents,
        "withdrawal" or "transfer_out" => -amountCents,
        "adjustment" => amountCents - balanceCents,
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Tipo de movimentação inválido.")
    };

    /// <summary>Delta usado no estorno: o armazenado ou, para linhas antigas, apenas entradas e saídas simples (null = não estornável).</summary>
    public static long? ReversibleDelta(string kind, long amountCents, long? storedDeltaCents) => storedDeltaCents ?? kind switch
    {
        "deposit" => amountCents,
        "withdrawal" => -amountCents,
        _ => null
    };

    /// <summary>Delta exibido no extrato: o armazenado ou o derivado do tipo; ajustes antigos não têm delta conhecido.</summary>
    public static long? DisplayDelta(string kind, long amountCents, long? storedDeltaCents) => storedDeltaCents ?? kind switch
    {
        "deposit" or "transfer_in" => amountCents,
        "withdrawal" or "transfer_out" => -amountCents,
        _ => null
    };
}

/// <summary>Aportes em metas somam ao valor acumulado e resgates subtraem; o estorno aplica o efeito inverso.</summary>
public static class GoalRules
{
    public const string Contribution = "contribution";
    public const string Withdrawal = "withdrawal";

    public static long Delta(string kind, long amountCents) => kind switch
    {
        Contribution => amountCents,
        Withdrawal => -amountCents,
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Tipo de movimentação inválido.")
    };

    public static long Apply(long currentCents, string kind, long amountCents) => currentCents + Delta(kind, amountCents);
    public static long Revert(long currentCents, string kind, long amountCents) => currentCents - Delta(kind, amountCents);
}
