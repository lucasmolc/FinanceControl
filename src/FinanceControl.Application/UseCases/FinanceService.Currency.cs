using FinanceControl.Application.Common;
using FinanceControl.Application.Validation;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.UseCases;

/// <summary>v1.2: moedas por registro, débito automático em contas a pagar/assinaturas e meta vinculada à reserva.</summary>
public sealed partial class FinanceService
{
    public IReadOnlyList<CurrencyInfo> ListCurrencies() => Currencies.All;

    /// <summary>Cotações salvas (BRL por unidade) em decimal; cotações ilegíveis são ignoradas.</summary>
    private Dictionary<string, decimal> LatestRates()
    {
        var rates = new Dictionary<string, decimal>(StringComparer.Ordinal);
        foreach (var rate in store.ListExchangeRates())
            if (CurrencyRules.ParseRate(rate.RateBrl) is decimal value) rates[rate.Currency] = value;
        return rates;
    }

    /// <summary>Valor em BRL de um lançamento gerado por um fluxo: cotação enviada, senão a última conhecida; sem cotação → 400 <c>exchange_rate</c>.</summary>
    private OperationResult<(long BaseCents, string Rate)> ConvertDraftAmount(long amount, string currency, string? sentRate)
    {
        if (currency == Currencies.Base) return OperationResult<(long, string)>.Success((amount, "1"));
        var rate = CurrencyRules.ParseRate(sentRate) ?? (LatestRates().TryGetValue(currency, out var latest) ? latest : null);
        return rate is decimal value
            ? OperationResult<(long, string)>.Success((CurrencyRules.ToBaseCents(amount, currency, value), CurrencyRules.FormatRate(value)))
            : OperationResult<(long, string)>.Invalid("exchange_rate", Messages.ExchangeRateRequired);
    }

    /// <summary>
    /// Moeda, cotação e valor em BRL do lançamento resultante. Com conta vinculada a moeda é a da conta (herdada quando
    /// não enviada; diferente → 400). Cotação: a enviada; na edição sem troca de moeda, a gravada; senão a última conhecida.
    /// </summary>
    private OperationResult<IReadOnlyDictionary<string, object?>> PrepareTransactionCurrency(ValidatedInput input, IReadOnlyDictionary<string, object?> values, Transaction? current)
    {
        var result = new Dictionary<string, object?>(values, StringComparer.Ordinal);
        var accountId = input.Has("account_id") ? input.Number("account_id") : current?.AccountId;
        var accountCurrency = accountId is long id ? store.FindBankAccount(id)?.Currency : null;
        var sentCurrency = input.Text("currency");
        string currency;
        if (sentCurrency is not null)
        {
            if (accountCurrency is not null && sentCurrency != accountCurrency) return InvalidValues("currency", Messages.CurrencyMismatchAccount);
            currency = sentCurrency;
        }
        else if (accountCurrency is not null && (current is null || input.Has("account_id")))
        {
            currency = accountCurrency;
        }
        else
        {
            currency = current?.Currency ?? Currencies.Base;
        }

        var sentRate = input.Text("exchange_rate");
        var amount = input.Number("amount_cents") ?? current!.AmountCents;
        if (current is not null && !input.Has("amount_cents") && sentRate is null && currency == current.Currency)
        {
            result.Remove("currency");
            return OperationResult<IReadOnlyDictionary<string, object?>>.Success(result);
        }

        decimal rate;
        if (currency == Currencies.Base) rate = 1m;
        else if (CurrencyRules.ParseRate(sentRate) is decimal sent) rate = sent;
        else if (current is not null && currency == current.Currency && CurrencyRules.ParseRate(current.ExchangeRate) is decimal recorded) rate = recorded;
        else if (LatestRates().TryGetValue(currency, out var latest)) rate = latest;
        else return InvalidValues("exchange_rate", Messages.ExchangeRateRequired);

        result["currency"] = currency;
        result["exchange_rate"] = CurrencyRules.FormatRate(rate);
        result["base_amount_cents"] = CurrencyRules.ToBaseCents(amount, currency, rate);
        return OperationResult<IReadOnlyDictionary<string, object?>>.Success(result);
    }

    /// <summary>Regras v1.2 dos demais módulos na criação (<paramref name="id"/> null) e na edição.</summary>
    private OperationResult<IReadOnlyDictionary<string, object?>> PrepareRecord(string module, ValidatedInput input, long? id)
    {
        var values = new Dictionary<string, object?>(input.Values, StringComparer.Ordinal);
        switch (module)
        {
            case "bills":
            {
                var current = id is long billId ? store.FindActiveBill(billId) : null;
                if (id is not null && current is null) return NotFoundValues();
                var error = PrepareAutoDebit(values, input, current?.AutoDebit, current?.AccountId, null, current?.Currency, requireAccount: true);
                if (error is not null) return error;
                // R1-BILLS-1: a conta existe a partir de hoje, salvo data enviada (null = sem restrição).
                if (id is null && !input.Has("active_since")) values["active_since"] = Today.ToString("yyyy-MM-dd", Invariant);
                break;
            }
            case "subscriptions":
            {
                var current = id is long subscriptionId ? store.FindActiveSubscription(subscriptionId) : null;
                if (id is not null && current is null) return NotFoundValues();
                var cardId = input.Has("card_id") ? input.Number("card_id") : current?.CardId;
                var error = PrepareAutoDebit(values, input, current?.AutoDebit, current?.AccountId, cardId, current?.Currency, requireAccount: false);
                if (error is not null) return error;
                break;
            }
            case "bank-accounts" when id is long accountId && input.Text("currency") is string currency:
            {
                var current = store.FindBankAccount(accountId);
                if (current is not null && current.Currency != currency && store.CountAccountMovements(accountId) > 0)
                    return InvalidValues("currency", Messages.AccountCurrencyLocked);
                break;
            }
            case "goals":
                values.Remove(ModuleSchemas.DetachAutoField);
                break;
        }
        return OperationResult<IReadOnlyDictionary<string, object?>>.Success(values);
    }

    private OperationResult<bool> UpdatePreparedRecord(string module, long id, ValidatedInput input)
    {
        var prepared = PrepareRecord(module, input, id);
        if (!prepared.IsSuccess) return prepared.Failure<bool>();
        var values = prepared.Value!;

        // Meta vinculada à reserva (ou ao número da liberdade, com plano) com cálculo automático: mudar o alvo exige confirmar
        // o desligamento (detach_auto).
        bool detachEmergency = false, detachFreedom = false;
        if (module == "goals" && input.Number("target_cents") is long target)
        {
            var settings = store.GetSettings();
            var emergencyLinked = settings.EmergencyGoalId == id && settings.EmergencyGoalAuto;
            var freedomLinked = settings.FreedomGoalId == id && settings.FreedomGoalAuto && settings.HasPlan;
            if ((emergencyLinked || freedomLinked) && store.FindGoal(id) is { Active: true } goal && goal.TargetCents != target)
            {
                if (input.Flag(ModuleSchemas.DetachAutoField) != true) return OperationResult<bool>.Invalid("target_cents", Messages.ReserveTargetLinked);
                detachEmergency = emergencyLinked;
                detachFreedom = freedomLinked;
            }
        }
        if (values.Count == 0) return OperationResult<bool>.Invalid("body", Messages.EmptyUpdate);

        var updated = store.UpdateRecord(module, id, values);
        if (updated.IsSuccess && detachEmergency) store.SetEmergencyGoalAuto(false);
        if (updated.IsSuccess && detachFreedom) store.SetFreedomGoalAuto(false);
        return updated;
    }

    /// <summary>
    /// Débito automático do registro resultante: exige conta (ou, em assinaturas, conta ou cartão); a conta deve usar a moeda do
    /// registro (herdada da conta quando não enviada na criação). Ligar grava <c>auto_debit_since</c> = hoje; desligar limpa.
    /// </summary>
    private OperationResult<IReadOnlyDictionary<string, object?>>? PrepareAutoDebit(Dictionary<string, object?> values, ValidatedInput input,
        bool? currentAuto, long? currentAccount, long? cardId, string? currentCurrency, bool requireAccount)
    {
        var autoDebit = input.Flag("auto_debit") ?? currentAuto ?? false;
        var accountId = input.Has("account_id") ? input.Number("account_id") : currentAccount;
        if (autoDebit && accountId is null && (requireAccount || cardId is null))
            return InvalidValues("account_id", requireAccount ? Messages.AutoDebitAccountRequired : Messages.AutoDebitSourceRequired);

        var accountCurrency = accountId is long id ? store.FindBankAccount(id)?.Currency : null;
        var currency = input.Text("currency") ?? currentCurrency;
        if (currency is null && accountCurrency is not null)
        {
            currency = accountCurrency;
            values["currency"] = currency;
        }
        currency ??= Currencies.Base;
        if (accountCurrency is not null && accountCurrency != currency) return InvalidValues("account_id", Messages.AccountCurrencyMismatch);

        if (input.Flag("auto_debit") is bool sent)
        {
            if (!sent) values["auto_debit_since"] = null;
            else if (currentAuto != true) values["auto_debit_since"] = Today.ToString("yyyy-MM-dd", Invariant);
        }
        return null;
    }

    private static OperationResult<IReadOnlyDictionary<string, object?>> InvalidValues(string field, string message) =>
        OperationResult<IReadOnlyDictionary<string, object?>>.Invalid(field, message);

    private static OperationResult<IReadOnlyDictionary<string, object?>> NotFoundValues() =>
        OperationResult<IReadOnlyDictionary<string, object?>>.NotFound();
}
