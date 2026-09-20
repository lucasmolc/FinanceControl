using FinanceControl.Application.Common;
using FinanceControl.Application.Validation;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.UseCases;

/// <summary>
/// Compra parcelada (v1.4): uma compra informada como "6/10" vira dez lançamentos, um por mês, para trás e para frente.
/// Vale para qualquer forma de pagamento — no cartão cada parcela cai na fatura do seu mês; em conta, as parcelas
/// futuras só entram no saldo quando a data chega. Para gasto mensal sem prazo o caminho é a assinatura, que já
/// repete indefinidamente, tem o valor editável valendo do próximo mês em diante e pode ser desativada.
/// </summary>
public sealed partial class FinanceService
{
    /// <summary>Parcelamento pedido na criação; null quando o lançamento é simples.</summary>
    private sealed record InstallmentPlan(int Count, int Number, long TotalCents);

    /// <summary>Lê e valida os campos de parcelamento. Sem <c>installment_count</c> não há série.</summary>
    private static OperationResult<InstallmentPlan?> ReadInstallmentPlan(ValidatedInput input, IReadOnlyDictionary<string, object?> values)
    {
        var hasCount = input.Number("installment_count") is not null;
        var number = (int?)input.Number("installment_number");
        var total = input.Number(ModuleSchemas.InstallmentTotalField);
        if (!hasCount)
            return number is not null || total is not null
                ? OperationResult<InstallmentPlan?>.Invalid("installment_count", Messages.InstallmentCountRequired)
                : OperationResult<InstallmentPlan?>.Success(null);

        var count = (int)input.Number("installment_count")!.Value;
        var current = number ?? 1;
        if (!InstallmentRules.IsValidNumber(current, count))
            return OperationResult<InstallmentPlan?>.Invalid("installment_number", Messages.InstallmentNumberAboveCount);

        // Sem o total da compra, ele é o valor informado multiplicado pelas parcelas.
        var perInstallment = values.TryGetValue("amount_cents", out var amount) && amount is long cents ? cents : 0;
        var totalCents = total ?? InstallmentRules.TotalOf(perInstallment, count);
        if (!InstallmentRules.FitsTotal(totalCents, count))
            return OperationResult<InstallmentPlan?>.Invalid(ModuleSchemas.InstallmentTotalField, Messages.InstallmentTotalTooSmall);

        return OperationResult<InstallmentPlan?>.Success(new InstallmentPlan(count, current, totalCents));
    }

    /// <summary>
    /// Linhas das parcelas a partir dos valores já preparados da parcela informada: mesma descrição com o sufixo
    /// "k/N", data deslocada mês a mês e o valor em reais recalculado pela mesma cotação.
    /// </summary>
    private OperationResult<IReadOnlyList<IReadOnlyDictionary<string, object?>>> BuildInstallments(
        IReadOnlyDictionary<string, object?> values, InstallmentPlan plan)
    {
        var anchor = ParseDate((string)values["date"]!);
        var series = InstallmentRules.Series(anchor, plan.Number, plan.Count, plan.TotalCents);

        var closed = series.Select(item => Iso(item.Date)[..7]).Distinct(StringComparer.Ordinal)
            .Where(store.IsMonthClosed).Order(StringComparer.Ordinal).ToList();
        if (closed.Count > 0)
            return OperationResult<IReadOnlyList<IReadOnlyDictionary<string, object?>>>.Invalid("date", Messages.MonthsClosed(closed));

        var currency = values.TryGetValue("currency", out var code) && code is string text ? text : Currencies.Base;
        var rate = CurrencyRules.ParseRate(values.TryGetValue("exchange_rate", out var stored) ? stored as string : null) ?? 1m;
        var description = BaseDescription((string)values["description"]!, plan.Count);
        var group = Guid.NewGuid().ToString("N");

        var rows = series.Select(item =>
        {
            var row = new Dictionary<string, object?>(values, StringComparer.Ordinal)
            {
                ["date"] = Iso(item.Date),
                ["description"] = $"{description} ({InstallmentRules.Label(item.Number, plan.Count)})",
                ["amount_cents"] = item.AmountCents,
                ["base_amount_cents"] = CurrencyRules.ToBaseCents(item.AmountCents, currency, rate),
                ["installment_group"] = group,
                ["installment_number"] = (long)item.Number,
                ["installment_count"] = (long)plan.Count,
            };
            row.Remove(ModuleSchemas.InstallmentTotalField);
            return (IReadOnlyDictionary<string, object?>)row;
        }).ToList();
        return OperationResult<IReadOnlyList<IReadOnlyDictionary<string, object?>>>.Success(rows);
    }

    /// <summary>Descrição sem o sufixo de parcela, encurtada para caber com ele dentro do limite do campo.</summary>
    private static string BaseDescription(string description, int count)
    {
        var suffix = $" ({InstallmentRules.Label(count, count)})".Length;
        var limit = StatementRules.MaxDescription - suffix;
        return description.Length <= limit ? description : description[..limit].TrimEnd();
    }
}
