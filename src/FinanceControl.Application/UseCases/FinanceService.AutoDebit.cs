using FinanceControl.Application.Contracts;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.UseCases;

/// <summary>Débito automático (MEL-29): paga contas no vencimento e lança cobranças de assinaturas, sem duplicar.</summary>
public sealed partial class FinanceService
{
    /// <summary>Evita execuções simultâneas (serviço em segundo plano + POST /api/auto-debits/run) no mesmo processo.</summary>
    private static readonly SemaphoreSlim AutoDebitGate = new(1, 1);

    public AutoDebitRun RunAutoDebits()
    {
        AutoDebitGate.Wait();
        try
        {
            var created = new List<AutoDebitItem>();
            // Lançamentos futuros (parcelas à frente) entram no saldo da conta no dia em que vencem.
            store.ApplyDueTransactionBalances();
            var rates = LatestRates();
            created.AddRange(RunBillAutoDebits(rates));
            created.AddRange(RunSubscriptionAutoDebits(rates));
            return new AutoDebitRun(created);
        }
        finally
        {
            AutoDebitGate.Release();
        }
    }

    /// <summary>
    /// Mês atual: conta com débito automático cujo vencimento (limitado ao mês) já chegou e não é anterior à ativação,
    /// não paga e não desmarcada no mês → pagamento igual ao do checklist (forma "auto_debit", data = vencimento).
    /// </summary>
    private List<AutoDebitItem> RunBillAutoDebits(IReadOnlyDictionary<string, decimal> rates)
    {
        var created = new List<AutoDebitItem>();
        var month = CurrentMonth;
        if (store.IsMonthClosed(month)) return created;
        foreach (var bill in store.GetChecklist(month).Where(item => item.AutoDebit && !item.Paid && !item.AutoDebitSkipped && item.AccountId is not null))
        {
            var due = AutoDebitRules.BillDueDate(bill.DueDay, Today.Year, Today.Month);
            if (due > Today || bill.AutoDebitSince is null || string.CompareOrdinal(Iso(due), bill.AutoDebitSince) < 0) continue;
            if (!IsActiveAccount(bill.AccountId!.Value) || store.FindBankAccount(bill.AccountId.Value)?.Currency != bill.Currency) continue;
            if (CurrencyRules.ToBaseCents(bill.AmountCents, bill.Currency, rates) is not long baseCents) continue;

            var draft = new TransactionDraft(Iso(due), bill.Name, bill.CategoryId, "expense", bill.AmountCents, "auto_debit", bill.AccountId,
                $"Pagamento da conta {bill.Name} ({month})", null, bill.Currency, baseCents, RateText(bill.Currency, rates), bill.Brand);
            var paid = store.PayBill(new BillPaymentCommand(bill.Id, month, timeProvider.GetUtcNow().ToString("O", Invariant), draft));
            if (paid.IsSuccess && paid.Value is long transactionId && !bill.Paid)
                created.Add(new AutoDebitItem("bill", bill.Id, bill.Name, draft.Date, bill.AmountCents, bill.Currency, transactionId));
        }
        return created;
    }

    /// <summary>
    /// Cobranças devidas em [max(ativação, hoje − 62 dias), hoje] ainda sem registro em subscription_charges (mesmo que o
    /// lançamento tenha sido removido depois) → despesa no cartão da assinatura ou na conta de débito.
    /// </summary>
    private List<AutoDebitItem> RunSubscriptionAutoDebits(IReadOnlyDictionary<string, decimal> rates)
    {
        var created = new List<AutoDebitItem>();
        foreach (var subscription in store.ListActiveSubscriptions().Where(item => item.AutoDebit && item.AutoDebitSince is not null))
        {
            var since = ParseDate(subscription.AutoDebitSince!);
            var lookback = Today.AddDays(-AutoDebitRules.SubscriptionLookbackDays);
            var from = since > lookback ? since : lookback;
            var next = subscription.NextBillingDate is string nextDate ? ParseDate(nextDate) : (DateOnly?)null;
            var dates = AutoDebitRules.SubscriptionChargeDates(subscription.Frequency, subscription.BillingDay, next, from, Today);
            if (dates.Count == 0) continue;

            var cardId = subscription.CardId is long card && store.FindCard(card) is { Active: true } ? subscription.CardId : null;
            var accountId = cardId is null ? subscription.AccountId : null;
            if (cardId is null && (accountId is null || !IsActiveAccount(accountId.Value) || store.FindBankAccount(accountId.Value)?.Currency != subscription.Currency)) continue;
            if (CurrencyRules.ToBaseCents(subscription.AmountCents, subscription.Currency, rates) is not long baseCents) continue;

            var charged = store.ListSubscriptionChargeDates(subscription.Id);
            foreach (var date in dates.Select(Iso).Where(date => !charged.Contains(date)))
            {
                if (store.IsMonthClosed(date[..7])) continue;
                var draft = new TransactionDraft(date, subscription.Name, subscription.CategoryId, "expense", subscription.AmountCents,
                    cardId is null ? "auto_debit" : "card", accountId, $"Cobrança automática de {subscription.Name}", cardId,
                    subscription.Currency, baseCents, RateText(subscription.Currency, rates), subscription.Brand);
                var charge = store.ChargeSubscription(new SubscriptionChargeCommand(subscription.Id, date, draft, Automatic: true));
                if (charge.IsSuccess)
                    created.Add(new AutoDebitItem("subscription", subscription.Id, subscription.Name, date, subscription.AmountCents, subscription.Currency, charge.Value));
            }
        }
        return created;
    }

    private static string RateText(string currency, IReadOnlyDictionary<string, decimal> rates) =>
        currency == Currencies.Base ? "1" : CurrencyRules.FormatRate(rates[currency]);
}
