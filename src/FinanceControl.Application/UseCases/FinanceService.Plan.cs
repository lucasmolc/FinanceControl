using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Application.Validation;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.UseCases;

/// <summary>Plano 70-20-10 (MEL-45): aplicar/remover o plano, número da liberdade e o realizado do mês por balde.</summary>
public sealed partial class FinanceService
{
    private const int DefaultEmergencyMonths = 6;

    public OperationResult<PlanResult> ApplyPlan(RecordData data)
    {
        var validated = InputValidator.Validate(ModuleSchemas.Plan, data.Values, ValidationMode.Create);
        if (!validated.IsSuccess) return validated.Failure<PlanResult>();
        var input = validated.Value!;
        var fixedPct = input.Number("fixed_pct")!.Value;
        var funPct = input.Number("fun_pct")!.Value;
        var investPct = input.Number("invest_pct")!.Value;
        if (!PlanRules.IsValidSplit(fixedPct, funPct, investPct)) return OperationResult<PlanResult>.Invalid("fixed_pct", Messages.PlanSum);

        var settings = store.GetSettings();
        var income = input.Number("monthly_net_income_cents") ?? settings.MonthlyNetIncomeCents;
        if (income <= 0) return OperationResult<PlanResult>.Invalid("monthly_net_income_cents", Messages.PlanIncomeRequired);
        var months = input.Number("emergency_months") is long sentMonths ? (int)sentMonths
            : settings.EmergencyMonthsTarget is >= 1 and <= 120 ? settings.EmergencyMonthsTarget : DefaultEmergencyMonths;
        var multiplier = input.Number("freedom_multiplier") is long sentMultiplier ? (int)sentMultiplier : settings.FreedomMultiplier;

        var command = new PlanCommand((int)fixedPct, (int)funPct, (int)investPct, months, multiplier, input.Flag("create_buckets") ?? false,
            input.Number("monthly_net_income_cents"), PlanRules.Share(income, (int)(fixedPct + funPct)));
        return OperationResult<PlanResult>.Success(store.ApplyPlan(command));
    }

    public OperationResult<bool> ClearPlan()
    {
        store.ClearPlan();
        return OperationResult<bool>.Success(true);
    }

    public OperationResult<long> EnsureFreedomGoal()
    {
        var settings = store.GetSettings();
        if (settings.MonthlyNetIncomeCents <= 0) return OperationResult<long>.Invalid("monthly_net_income_cents", Messages.PlanIncomeRequired);
        if (!settings.HasPlan) return OperationResult<long>.Invalid("plan", Messages.PlanRequired);
        return OperationResult<long>.Success(store.EnsureFreedomGoal());
    }

    /// <summary>Plano do mês com os limites pelo salário atual e o realizado por balde; null sem plano.</summary>
    private static PlanSummary? BuildPlanSummary(Settings settings, IReadOnlyList<ReportTransaction> monthTransactions)
    {
        if (!settings.HasPlan) return null;
        var spent = SpendByBucket(monthTransactions);
        var income = settings.MonthlyNetIncomeCents;
        return new PlanSummary(
            settings.PlanFixedPct!.Value, settings.PlanFunPct!.Value, settings.PlanInvestPct!.Value,
            PlanRules.Share(income, settings.PlanFixedPct.Value), PlanRules.Share(income, settings.PlanFunPct.Value), PlanRules.Share(income, settings.PlanInvestPct.Value),
            spent.Fixed, spent.Fun, spent.Invested, spent.Unbucketed, spent.Outside);
    }

    /// <summary>
    /// Realizado por balde (BRL): despesas pelo balde da categoria (sem categoria ou sem balde = fora de balde; "fora" = fora do plano);
    /// investido = lançamentos do tipo investimento + despesas em categorias do balde "investimento".
    /// </summary>
    private static (long Fixed, long Fun, long Invested, long Unbucketed, long Outside) SpendByBucket(IEnumerable<ReportTransaction> transactions)
    {
        long fixedSpent = 0, fun = 0, invested = 0, unbucketed = 0, outside = 0;
        foreach (var item in transactions)
        {
            if (item.Kind == "investment") { invested += item.BaseAmountCents; continue; }
            if (item.Kind != "expense") continue;
            switch (item.CategoryBucket)
            {
                case PlanRules.Fixed: fixedSpent += item.BaseAmountCents; break;
                case PlanRules.Fun: fun += item.BaseAmountCents; break;
                case PlanRules.Invest: invested += item.BaseAmountCents; break;
                case PlanRules.Outside: outside += item.BaseAmountCents; break;
                default: unbucketed += item.BaseAmountCents; break;
            }
        }
        return (fixedSpent, fun, invested, unbucketed, outside);
    }

    /// <summary>Despesas do período por forma de pagamento (BRL), valor desc e forma asc.</summary>
    private static List<ReportPaymentMethod> PaymentMethodTotals(IEnumerable<ReportTransaction> transactions) =>
        transactions.Where(item => item.Kind == "expense")
            .GroupBy(item => item.PaymentMethod, StringComparer.Ordinal)
            .Select(group => new ReportPaymentMethod(group.Key, group.Sum(item => item.BaseAmountCents), group.LongCount()))
            .OrderByDescending(item => item.TotalCents).ThenBy(item => item.Method, StringComparer.Ordinal)
            .ToList();

    /// <summary>Moedas estrangeiras sem cotação salva entre as informadas, na ordem do catálogo (MEL-46).</summary>
    private static List<string> MissingRates(IEnumerable<string> currencies, IReadOnlyDictionary<string, decimal> rates)
    {
        var used = currencies.Where(code => code != Currencies.Base && !rates.ContainsKey(code)).ToHashSet(StringComparer.Ordinal);
        return Currencies.All.Select(item => item.Code).Where(used.Contains)
            .Concat(used.Where(code => !Currencies.IsSupported(code)).Order(StringComparer.Ordinal))
            .ToList();
    }

    /// <summary>Moedas de registros ativos (contas, investimentos, metas, contas a pagar e assinaturas) sem cotação salva.</summary>
    private static List<string> MissingRates(FinanceState state, IReadOnlyDictionary<string, decimal> rates) =>
        MissingRates(state.BankAccounts.Select(item => item.Currency)
            .Concat(state.Investments.Select(item => item.Currency))
            .Concat(state.Goals.Select(item => item.Currency))
            .Concat(state.Bills.Select(item => item.Currency))
            .Concat(state.Subscriptions.Select(item => item.Currency)), rates);
}
