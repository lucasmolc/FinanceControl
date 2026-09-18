using Dapper;
using FinanceControl.Application.Contracts;
using FinanceControl.Domain.Rules;
using Microsoft.Data.Sqlite;

namespace FinanceControl.Infrastructure.Persistence;

/// <summary>v1.3: plano 70-20-10 (MEL-45), meta "Número da liberdade" vinculada e categorias-balde.</summary>
public sealed partial class SqliteFinanceStore
{
    public PlanResult ApplyPlan(PlanCommand command)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        connection.Execute("""
            UPDATE settings SET plan_fixed_pct=@FixedPct, plan_fun_pct=@FunPct, plan_invest_pct=@InvestPct,
                emergency_months_target=@EmergencyMonths, freedom_multiplier=@FreedomMultiplier,
                monthly_net_income_cents=COALESCE(@MonthlyNetIncomeCents, monthly_net_income_cents),
                monthly_spending_limit_cents=@SpendingLimitCents, updated_at=CURRENT_TIMESTAMP
            WHERE id=1
            """, command, transaction);
        var emergencyGoalId = SyncEmergencyGoal(connection, transaction, force: false);
        var freedomGoalId = SyncFreedomGoal(connection, transaction, force: false);
        var (created, marked) = command.CreateBuckets ? EnsureBucketCategories(connection, transaction) : ([], []);
        transaction.Commit();
        return new PlanResult(emergencyGoalId, freedomGoalId, created, marked);
    }

    public void ClearPlan()
    {
        using var connection = factory.CreateOpenConnection();
        connection.Execute("UPDATE settings SET plan_fixed_pct=NULL, plan_fun_pct=NULL, plan_invest_pct=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=1");
    }

    public void SetFreedomGoalAuto(bool automatic)
    {
        using var connection = factory.CreateOpenConnection();
        connection.Execute("UPDATE settings SET freedom_goal_auto=@automatic, updated_at=CURRENT_TIMESTAMP WHERE id=1", new { automatic });
    }

    public long EnsureFreedomGoal()
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        connection.Execute("UPDATE settings SET freedom_goal_auto=1, updated_at=CURRENT_TIMESTAMP WHERE id=1", transaction: transaction);
        var id = SyncFreedomGoal(connection, transaction, force: true)
            ?? throw new InvalidOperationException("O número da liberdade exige plano e salário informados.");
        transaction.Commit();
        return id;
    }

    /// <summary>
    /// Número da liberdade, com plano aplicado, salário &gt; 0 e cálculo automático ligado (mesmas regras da reserva): meta vinculada
    /// ativa → atualiza só o alvo (salário × multiplicador); vinculada removida → nada (salvo <paramref name="force"/>); sem meta
    /// vinculada → religa a meta ativa do tipo aposentadoria chamada "Número da liberdade" ou "Independência financeira" (a de maior
    /// valor guardado) ou cria "Número da liberdade". Sem plano nada é sincronizado. Devolve a meta vinculada.
    /// </summary>
    private static long? SyncFreedomGoal(SqliteConnection connection, SqliteTransaction transaction, bool force)
    {
        var settings = ReadSettings(connection, transaction);
        var target = settings.FreedomTargetCents;
        if (!settings.HasPlan || target <= 0 || !settings.FreedomGoalAuto) return settings.FreedomGoalId;

        if (settings.FreedomGoalStatus == ReserveRules.Linked)
        {
            connection.Execute("UPDATE goals SET target_cents=@target WHERE id=@FreedomGoalId", new { target, settings.FreedomGoalId }, transaction);
            return settings.FreedomGoalId;
        }
        if (settings.FreedomGoalStatus == ReserveRules.Removed && !force) return settings.FreedomGoalId;

        var goalId = connection.Query<GoalCandidateRow>(
                "SELECT id, name FROM goals WHERE active=1 AND type=@type ORDER BY current_cents DESC, id", new { type = PlanRules.FreedomGoalType }, transaction)
            .FirstOrDefault(goal => goal.Id != settings.EmergencyGoalId && PlanRules.IsFreedomGoalName(goal.Name))?.Id;
        if (goalId is long existing)
            connection.Execute("UPDATE goals SET target_cents=@target WHERE id=@existing", new { target, existing }, transaction);
        else
            goalId = connection.QuerySingle<long>(
                "INSERT INTO goals(name,type,target_cents,current_cents,currency) VALUES (@name,@type,@target,0,'BRL') RETURNING id",
                new { name = PlanRules.FreedomGoalName, type = PlanRules.FreedomGoalType, target }, transaction);
        connection.Execute("UPDATE settings SET freedom_goal_id=@goalId WHERE id=1", new { goalId }, transaction);
        return goalId;
    }

    /// <summary>
    /// Categorias-balde "Gastos fixos" (fixo), "Lazer" (lazer) e "Investimentos" (investimento): nunca duplica pelo nome (sem caixa e
    /// sem acentos, entre as categorias ativas). Existente sem balde → recebe o balde; existente com balde → fica como está.
    /// </summary>
    private static (List<string> Created, List<string> Marked) EnsureBucketCategories(SqliteConnection connection, SqliteTransaction transaction)
    {
        var existing = connection.Query<CategoryBucketRow>("SELECT id, name, kind, bucket FROM categories WHERE active=1 ORDER BY id", transaction: transaction).AsList();
        var created = new List<string>();
        var marked = new List<string>();
        foreach (var (name, kind, bucket) in PlanRules.BucketCategories)
        {
            var normalized = PlanRules.NormalizeName(name);
            var match = existing.Where(category => PlanRules.NormalizeName(category.Name) == normalized)
                .OrderBy(category => category.Kind == kind ? 0 : 1).ThenBy(category => category.Id).FirstOrDefault();
            if (match is null)
            {
                connection.Execute("INSERT INTO categories(name,kind,bucket) VALUES (@name,@kind,@bucket)", new { name, kind, bucket }, transaction);
                created.Add(name);
            }
            else if (match.Bucket is null)
            {
                connection.Execute("UPDATE categories SET bucket=@bucket WHERE id=@Id", new { bucket, match.Id }, transaction);
                marked.Add(match.Name);
            }
        }
        return (created, marked);
    }
}

internal sealed class GoalCandidateRow
{
    public long Id { get; init; }
    public string Name { get; init; } = "";
}

internal sealed class CategoryBucketRow
{
    public long Id { get; init; }
    public string Name { get; init; } = "";
    public string Kind { get; init; } = "";
    public string? Bucket { get; init; }
}
