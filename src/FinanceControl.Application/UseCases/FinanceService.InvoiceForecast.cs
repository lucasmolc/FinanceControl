using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.UseCases;

/// <summary>
/// Cobranças previstas nas faturas que ainda não fecharam (v1.4). Uma assinatura é um gasto mensal sem prazo — a
/// academia do exemplo: ela cai em todas as faturas seguintes até ser desativada, o valor pode ser alterado a
/// qualquer momento valendo só do próximo ciclo em diante, e as cobranças já lançadas não mudam.
/// As previsões não são lançamentos: ficam em um total à parte, para que resumos, relatórios e orçamentos continuem
/// contando apenas o que já aconteceu.
/// </summary>
public sealed partial class FinanceService
{
    /// <summary>Dados reaproveitados entre os ciclos de um cartão: assinaturas ativas nele e cobranças já lançadas.</summary>
    private sealed record InvoiceForecast(
        IReadOnlyList<Subscription> Subscriptions,
        IReadOnlyDictionary<long, IReadOnlySet<string>> Charged,
        IReadOnlyDictionary<string, decimal> Rates)
    {
        public static readonly InvoiceForecast Empty = new([], new Dictionary<long, IReadOnlySet<string>>(), new Dictionary<string, decimal>());
    }

    private InvoiceForecast ForecastFor(long cardId)
    {
        var subscriptions = store.ListActiveSubscriptions().Where(item => item.CardId == cardId).ToList();
        if (subscriptions.Count == 0) return InvoiceForecast.Empty;
        return new InvoiceForecast(
            subscriptions,
            subscriptions.ToDictionary(item => item.Id, item => store.ListSubscriptionChargeDates(item.Id)),
            LatestRates());
    }

    /// <summary>Cobranças de assinatura esperadas no ciclo e ainda não lançadas; fatura já fechada não recebe mais nada.</summary>
    private IReadOnlyList<ProjectedInvoiceItem> Project(InvoiceCycle cycle, InvoiceForecast forecast)
    {
        if (forecast.Subscriptions.Count == 0 || cycle.ClosingDate < Today) return [];
        var items = new List<ProjectedInvoiceItem>();
        foreach (var subscription in forecast.Subscriptions)
        {
            var next = subscription.NextBillingDate is string date ? ParseDate(date) : (DateOnly?)null;
            foreach (var day in AutoDebitRules.SubscriptionChargeDates(subscription.Frequency, subscription.BillingDay, next, cycle.PeriodStart, cycle.ClosingDate))
            {
                var iso = Iso(day);
                if (forecast.Charged[subscription.Id].Contains(iso)) continue;
                items.Add(new ProjectedInvoiceItem(
                    subscription.Id, subscription.Name, iso, subscription.AmountCents, subscription.Currency,
                    CurrencyRules.ToBaseCents(subscription.AmountCents, subscription.Currency, forecast.Rates) ?? 0,
                    subscription.Brand, subscription.CategoryId, subscription.CategoryName));
            }
        }
        return items.OrderBy(item => item.Date, StringComparer.Ordinal).ThenBy(item => item.Name, StringComparer.CurrentCulture).ToList();
    }
}
