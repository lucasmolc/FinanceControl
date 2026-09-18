using System.Globalization;
using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Application.Ports;
using FinanceControl.Application.Validation;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.UseCases;

public sealed partial class FinanceService(IFinanceStore store, TimeProvider timeProvider, IMarketDataSource marketData) : IFinanceUseCases
{
    private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;

    private DateTime LocalNow => timeProvider.GetLocalNow().DateTime;
    private DateOnly Today => DateOnly.FromDateTime(LocalNow);
    private string CurrentMonth => Today.ToString("yyyy-MM", Invariant);

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> ListRecords(string module) =>
        module == "goals" ? GoalRowsWithFreedomProgress(store.ListRecords(module)) : store.ListRecords(module);
    public BackupDocument CreateBackup() => store.CreateBackup();
    public byte[] CreateDatabaseSnapshot() => store.CreateDatabaseSnapshot();
    public AboutInfo GetAbout() => store.GetAbout();

    public OperationResult<IReadOnlyList<Transaction>> ListTransactions(string? month)
    {
        if (string.IsNullOrWhiteSpace(month)) return OperationResult<IReadOnlyList<Transaction>>.Success(store.ListTransactions(null));
        return InputValidator.IsMonth(month)
            ? OperationResult<IReadOnlyList<Transaction>>.Success(store.ListTransactions(month))
            : OperationResult<IReadOnlyList<Transaction>>.Invalid("month", Messages.Month);
    }

    public OperationResult<long> CreateRecord(string module, RecordData data)
    {
        if (!ModuleSchemas.Records.TryGetValue(module, out var schema)) return OperationResult<long>.NotFound();
        var validated = ValidateWithReferences(schema, data, ValidationMode.Create);
        if (!validated.IsSuccess) return validated.Failure<long>();
        var input = validated.Value!;
        if (module == "subscriptions" && MissingBillingDate(input.Text("frequency") ?? "monthly", input.Text("next_billing_date")))
            return OperationResult<long>.Invalid("next_billing_date", Messages.NextBillingDateRequired);
        if (module != "transactions")
        {
            var prepared = PrepareRecord(module, input, null);
            return prepared.IsSuccess ? store.CreateRecord(module, prepared.Value!) : prepared.Failure<long>();
        }

        var values = NormalizeCardPurchase(input, null);
        if (!values.IsSuccess) return values.Failure<long>();
        if (CardPurchaseWithoutCard(input, values.Value!, null)) return OperationResult<long>.Invalid("card_id", Messages.CardRequired);
        var closed = ClosedMonthError<long>("date", input.Text("date"));
        if (closed is not null) return closed;
        var withCurrency = PrepareTransactionCurrency(input, values.Value!, null);
        return withCurrency.IsSuccess ? store.CreateRecord(module, withCurrency.Value!) : withCurrency.Failure<long>();
    }

    public OperationResult<bool> UpdateRecord(string module, long id, RecordData data)
    {
        if (id <= 0 || !ModuleSchemas.Records.TryGetValue(module, out var schema)) return OperationResult<bool>.NotFound();
        var validated = ValidateWithReferences(schema, data, ValidationMode.Update);
        if (!validated.IsSuccess) return validated.Failure<bool>();
        var input = validated.Value!;
        if (input.Values.Count == 0) return OperationResult<bool>.Invalid("body", Messages.EmptyUpdate);
        if (module == "subscriptions")
        {
            // A regra vale para o registro resultante: campos não enviados mantêm o valor atual.
            var current = store.FindActiveSubscription(id);
            if (current is null) return OperationResult<bool>.NotFound();
            var frequency = input.Has("frequency") ? input.Text("frequency")! : current.Frequency;
            var nextBillingDate = input.Has("next_billing_date") ? input.Text("next_billing_date") : current.NextBillingDate;
            if (MissingBillingDate(frequency, nextBillingDate)) return OperationResult<bool>.Invalid("next_billing_date", Messages.NextBillingDateRequired);
        }
        if (module != "transactions") return UpdatePreparedRecord(module, id, input);

        var existing = store.FindTransaction(id, removed: false);
        if (existing is null) return OperationResult<bool>.NotFound();
        var closed = ClosedMonthError<bool>("date", existing.Date, input.Text("date"));
        if (closed is not null) return closed;
        var values = NormalizeCardPurchase(input, existing);
        if (!values.IsSuccess) return values.Failure<bool>();
        if (CardPurchaseWithoutCard(input, values.Value!, existing)) return OperationResult<bool>.Invalid("card_id", Messages.CardRequired);
        // Conta atual mantida (não enviada) que foi removida: o lançamento não pode continuar movimentando-a.
        if (!input.Has("account_id") && existing.AccountId is long accountId && !IsActiveAccount(accountId))
            return OperationResult<bool>.Invalid("account_id", Messages.AccountRemoved);
        var withCurrency = PrepareTransactionCurrency(input, values.Value!, existing);
        return withCurrency.IsSuccess ? store.UpdateRecord(module, id, withCurrency.Value!) : withCurrency.Failure<bool>();
    }

    public OperationResult<bool> RemoveRecord(string module, long id)
    {
        if (id <= 0 || !ModuleSchemas.Records.ContainsKey(module)) return OperationResult<bool>.NotFound();
        if (module != "transactions") return store.RemoveRecord(module, id);
        var current = store.FindTransaction(id, removed: false);
        if (current is null) return OperationResult<bool>.NotFound();
        return ClosedMonthError<bool>("date", current.Date) ?? store.RemoveRecord(module, id);
    }

    public OperationResult<bool> RestoreRecord(string module, long id)
    {
        if (id <= 0 || !ModuleSchemas.Records.ContainsKey(module)) return OperationResult<bool>.NotFound();
        if (module != "transactions") return store.RestoreRecord(module, id);
        var removed = store.FindTransaction(id, removed: true);
        if (removed is null) return OperationResult<bool>.NotFound();
        var closed = ClosedMonthError<bool>("date", removed.Date);
        if (closed is not null) return closed;
        if (removed.AccountId is long accountId && !IsActiveAccount(accountId))
            return OperationResult<bool>.Invalid("account_id", Messages.AccountRemoved);
        return store.RestoreRecord(module, id);
    }

    public OperationResult<MonthlySummary> GetSummary(string? month)
    {
        month = string.IsNullOrWhiteSpace(month) ? CurrentMonth : month;
        if (!InputValidator.IsMonth(month)) return OperationResult<MonthlySummary>.Invalid("month", Messages.Month);
        var closing = store.FindClosing(month);
        return OperationResult<MonthlySummary>.Success(WithDailyAndTopExpenses(store.GetMonthlySummary(month), month) with { Closed = closing is not null, ClosedAt = closing?.ClosedAt });
    }

    public OperationResult<IReadOnlyList<BillChecklistItem>> GetChecklist(string? month)
    {
        month = string.IsNullOrWhiteSpace(month) ? CurrentMonth : month;
        return InputValidator.IsMonth(month)
            ? OperationResult<IReadOnlyList<BillChecklistItem>>.Success(store.GetChecklist(month))
            : OperationResult<IReadOnlyList<BillChecklistItem>>.Invalid("month", Messages.Month);
    }

    public OperationResult<long?> SetChecklist(RecordData data)
    {
        var validated = ValidateWithReferences(ModuleSchemas.Checklist, data, ValidationMode.Create);
        if (!validated.IsSuccess) return validated.Failure<long?>();
        var input = validated.Value!;
        var billId = input.Number("bill_id")!.Value;
        var month = input.Text("month")!;
        var closedMonth = ClosedMonthError<long?>("month", month);
        if (closedMonth is not null) return closedMonth;

        if (input.Flag("paid") != true)
        {
            // Desmarcar remove o lançamento do pagamento, que pode estar datado em outro mês (fechado).
            var linked = store.GetChecklist(month).FirstOrDefault(item => item.Id == billId)?.TransactionId is long transactionId
                ? store.FindTransaction(transactionId, removed: false)
                : null;
            var closedPayment = ClosedMonthError<long?>("date", linked?.Date);
            if (closedPayment is not null) return closedPayment;
            var unpaid = store.UnpayBill(billId, month);
            return unpaid.IsSuccess ? OperationResult<long?>.Success(null) : unpaid.Failure<long?>();
        }

        var bill = store.FindActiveBill(billId);
        if (bill is null) return OperationResult<long?>.NotFound();
        if (bill.ActiveSince is { Length: >= 7 } since && string.CompareOrdinal(since[..7], month) > 0)
            return OperationResult<long?>.Invalid("month", Messages.BillNotActiveYet);

        TransactionDraft? draft = null;
        if (input.Flag("register_transaction") ?? true)
        {
            var accountId = input.Number("account_id");
            if (accountId is long payingAccount && store.FindBankAccount(payingAccount)?.Currency is string accountCurrency && accountCurrency != bill.Currency)
                return OperationResult<long?>.Invalid("account_id", Messages.AccountCurrencyMismatch);
            var amount = input.Number("amount_cents") ?? bill.AmountCents;
            var converted = ConvertDraftAmount(amount, bill.Currency, null);
            if (!converted.IsSuccess) return converted.Failure<long?>();
            draft = new TransactionDraft(
                input.Text("date") ?? DefaultPaymentDate(month, bill.DueDay),
                bill.Name,
                bill.CategoryId,
                "expense",
                amount,
                input.Text("payment_method") ?? "other",
                accountId,
                $"Pagamento da conta {bill.Name} ({month})",
                Currency: bill.Currency,
                BaseAmountCents: converted.Value.BaseCents,
                ExchangeRate: converted.Value.Rate,
                Brand: bill.Brand);
            var closedDate = ClosedMonthError<long?>("date", draft.Date);
            if (closedDate is not null) return closedDate;
        }

        return store.PayBill(new BillPaymentCommand(billId, month, timeProvider.GetUtcNow().ToString("O", Invariant), draft));
    }

    public OperationResult<bool> CompleteSetup(SetupCommand command)
    {
        var normalized = SetupNormalizer.Normalize(command);
        if (!normalized.IsSuccess) return normalized.Failure<bool>();
        store.CompleteSetup(normalized.Value!);
        return OperationResult<bool>.Success(true);
    }

    public OperationResult<bool> SkipSetup() { store.SkipSetup(); return OperationResult<bool>.Success(true); }

    public OperationResult<long> AddGoalEntry(long goalId, RecordData data)
    {
        if (goalId <= 0) return OperationResult<long>.NotFound();
        var validated = InputValidator.Validate(ModuleSchemas.GoalEntry, data.Values, ValidationMode.Create);
        if (!validated.IsSuccess) return validated.Failure<long>();
        var input = validated.Value!;
        return ClosedMonthError<long>("date", input.Text("date")) ?? store.AddGoalEntry(new GoalEntryCommand(goalId, input.Text("date")!, input.Text("kind") ?? GoalRules.Contribution, input.Number("amount_cents")!.Value, input.Text("notes")));
    }

    public OperationResult<long> AddInvestmentEntry(long investmentId, RecordData data)
    {
        if (investmentId <= 0) return OperationResult<long>.NotFound();
        var validated = InputValidator.Validate(ModuleSchemas.InvestmentEntry, data.Values, ValidationMode.Create);
        if (!validated.IsSuccess) return validated.Failure<long>();
        var input = validated.Value!;
        var kind = input.Text("kind")!;
        var amount = input.Number("amount_cents")!.Value;
        if (kind == "adjustment" ? amount < 0 : amount <= 0)
            return OperationResult<long>.Invalid("amount_cents", kind == "adjustment" ? Messages.NonNegative : Messages.Positive);
        return ClosedMonthError<long>("date", input.Text("date")) ?? store.AddInvestmentEntry(new InvestmentEntryCommand(investmentId, input.Text("date")!, kind, amount, input.Text("notes")));
    }

    public OperationResult<long> AddBankEntry(long accountId, RecordData data)
    {
        if (accountId <= 0) return OperationResult<long>.NotFound();
        var validated = InputValidator.Validate(ModuleSchemas.BankEntry, data.Values, ValidationMode.Create);
        if (!validated.IsSuccess) return validated.Failure<long>();
        var input = validated.Value!;
        var kind = input.Text("kind")!;
        var amount = input.Number("amount_cents")!.Value;
        var relatedId = input.Number("related_account_id");
        if (kind != "adjustment" && amount <= 0) return OperationResult<long>.Invalid("amount_cents", Messages.Positive);
        if (kind == "transfer_out" && relatedId is null) return OperationResult<long>.Invalid("related_account_id", Messages.TargetAccountRequired);
        if (relatedId == accountId) return OperationResult<long>.Invalid("related_account_id", Messages.SameAccount);
        var missing = MissingReferences(input);
        if (missing is not null) return OperationResult<long>.Invalid(missing);
        var closed = ClosedMonthError<long>("date", input.Text("date"));
        if (closed is not null) return closed;

        long? counterpartAmount = null;
        if (kind == "transfer_out" && relatedId is long targetId)
        {
            var source = store.FindBankAccount(accountId);
            if (source is not { Active: true }) return OperationResult<long>.NotFound();
            var target = store.FindBankAccount(targetId)!;
            var related = input.Number("related_amount_cents");
            if (source.Currency != target.Currency)
            {
                if (related is null) return OperationResult<long>.Invalid("related_amount_cents", Messages.RelatedAmountRequired);
                counterpartAmount = related;
            }
            else if (related is not null && related != amount)
            {
                return OperationResult<long>.Invalid("related_amount_cents", Messages.RelatedAmountSameCurrency);
            }
        }

        var description = input.Text("description");
        return store.AddBankEntry(new BankEntryCommand(
            accountId, input.Text("date")!, description ?? DefaultBankDescription(kind), kind, amount, relatedId, input.Text("notes"),
            description ?? "Transferência recebida", counterpartAmount));
    }

    public OperationResult<bool> ReverseGoalEntry(long goalId, long entryId) =>
        Movement(MovementLedger.Goal, goalId, entryId, removed: false, store.ReverseGoalEntry);

    public OperationResult<bool> ReverseInvestmentEntry(long investmentId, long entryId) =>
        Movement(MovementLedger.Investment, investmentId, entryId, removed: false, store.ReverseInvestmentEntry);

    public OperationResult<bool> ReverseBankEntry(long accountId, long entryId) =>
        Movement(MovementLedger.Bank, accountId, entryId, removed: false, store.ReverseBankEntry);

    public OperationResult<SubscriptionChargeResult> ChargeSubscription(long subscriptionId, RecordData data)
    {
        if (subscriptionId <= 0) return OperationResult<SubscriptionChargeResult>.NotFound();
        var validated = ValidateWithReferences(ModuleSchemas.SubscriptionCharge, data, ValidationMode.Create);
        if (!validated.IsSuccess) return validated.Failure<SubscriptionChargeResult>();
        var subscription = store.FindActiveSubscription(subscriptionId);
        if (subscription is null) return OperationResult<SubscriptionChargeResult>.NotFound();

        var input = validated.Value!;
        var date = input.Text("date") ?? Today.ToString("yyyy-MM-dd", Invariant);
        var closed = ClosedMonthError<SubscriptionChargeResult>("date", date);
        if (closed is not null) return closed;
        var paymentMethod = input.Text("payment_method") ?? (subscription.CardId is null ? "other" : "card");
        var accountId = input.Number("account_id");
        // Cobrança no cartão da assinatura (sem conta e paga no cartão) entra na fatura; cartão removido não recebe compras.
        var cardId = subscription.CardId is long subscriptionCard && accountId is null && paymentMethod == "card" && store.FindCard(subscriptionCard) is { Active: true }
            ? subscription.CardId
            : null;
        if (accountId is long payingAccount && store.FindBankAccount(payingAccount)?.Currency is string accountCurrency && accountCurrency != subscription.Currency)
            return OperationResult<SubscriptionChargeResult>.Invalid("account_id", Messages.AccountCurrencyMismatch);
        var amount = input.Number("amount_cents") ?? subscription.AmountCents;
        var converted = ConvertDraftAmount(amount, subscription.Currency, input.Text("exchange_rate"));
        if (!converted.IsSuccess) return converted.Failure<SubscriptionChargeResult>();
        var draft = new TransactionDraft(
            date,
            subscription.Name,
            subscription.CategoryId,
            "expense",
            amount,
            paymentMethod,
            accountId,
            $"Cobrança da assinatura {subscription.Name}",
            cardId,
            subscription.Currency,
            converted.Value.BaseCents,
            converted.Value.Rate,
            subscription.Brand);
        var created = store.ChargeSubscription(new SubscriptionChargeCommand(subscriptionId, date, draft));
        return created.IsSuccess
            ? OperationResult<SubscriptionChargeResult>.Success(new SubscriptionChargeResult(created.Value, date))
            : created.Failure<SubscriptionChargeResult>();
    }

    public OperationResult<bool> UndoSubscriptionCharge(long subscriptionId, string? date)
    {
        if (subscriptionId <= 0) return OperationResult<bool>.NotFound();
        var chargeDate = date?.Trim();
        if (string.IsNullOrEmpty(chargeDate)) return OperationResult<bool>.Invalid("date", Messages.Required);
        if (!InputValidator.IsIsoDate(chargeDate)) return OperationResult<bool>.Invalid("date", Messages.Date);
        return ClosedMonthError<bool>("date", chargeDate) ?? store.UndoSubscriptionCharge(subscriptionId, chargeDate);
    }

    public OperationResult<ReassignCounts> ReassignCategory(long categoryId, RecordData data)
    {
        var source = categoryId > 0 ? store.FindCategory(categoryId) : null;
        if (source is null) return OperationResult<ReassignCounts>.NotFound();
        var target = ReadTargetId(data);
        if (!target.IsSuccess) return target.Failure<ReassignCounts>();
        if (target.Value is long targetId)
        {
            if (targetId == categoryId) return OperationResult<ReassignCounts>.Invalid("target_id", Messages.ReassignSameCategory);
            var destination = store.FindCategory(targetId);
            if (destination is not { Active: true }) return OperationResult<ReassignCounts>.Invalid("target_id", Messages.ReassignCategoryUnavailable);
            if (destination.Kind != source.Kind) return OperationResult<ReassignCounts>.Invalid("target_id", Messages.ReassignCategoryKind);
        }
        return OperationResult<ReassignCounts>.Success(store.ReassignCategory(categoryId, target.Value));
    }

    public OperationResult<CardReassignCounts> ReassignCard(long cardId, RecordData data)
    {
        if (cardId <= 0 || store.FindCard(cardId) is null) return OperationResult<CardReassignCounts>.NotFound();
        var target = ReadTargetId(data);
        if (!target.IsSuccess) return target.Failure<CardReassignCounts>();
        if (target.Value is long targetId)
        {
            if (targetId == cardId) return OperationResult<CardReassignCounts>.Invalid("target_id", Messages.ReassignSameCard);
            if (store.FindCard(targetId) is not { Active: true }) return OperationResult<CardReassignCounts>.Invalid("target_id", Messages.ReassignCardUnavailable);
        }
        return OperationResult<CardReassignCounts>.Success(store.ReassignCard(cardId, target.Value));
    }

    public OperationResult<RestoreResult> RestoreBackup(object? document)
    {
        var tables = BackupRestoreValidator.Validate(document);
        if (!tables.IsSuccess) return tables.Failure<RestoreResult>();
        var safetyCopy = $"antes-da-restauracao-{LocalNow.ToString("yyyyMMdd-HHmmss", Invariant)}.db";
        return store.RestoreBackup(new RestorePlan(tables.Value!, safetyCopy));
    }

    /// <summary>Assinaturas anuais e semanais precisam de uma data de referência para a próxima cobrança.</summary>
    private static bool MissingBillingDate(string frequency, string? nextBillingDate) =>
        frequency is "yearly" or "weekly" && nextBillingDate is null;

    /// <summary>`target_id` é obrigatório no corpo: um identificador positivo ou null (sem categoria/cartão).</summary>
    private static OperationResult<long?> ReadTargetId(RecordData data)
    {
        if (!data.Values.TryGetValue("target_id", out var raw)) return OperationResult<long?>.Invalid("target_id", Messages.Required);
        return raw switch
        {
            null => OperationResult<long?>.Success(null),
            long id when id > 0 => OperationResult<long?>.Success(id),
            _ => OperationResult<long?>.Invalid("target_id", Messages.InvalidValue)
        };
    }

    internal static bool IsCurrency(string value) => value.Length == 3 && value.All(character => character is >= 'A' and <= 'Z');

    private OperationResult<ValidatedInput> ValidateWithReferences(InputSchema schema, RecordData data, ValidationMode mode)
    {
        var validated = InputValidator.Validate(schema, data.Values, mode);
        if (!validated.IsSuccess) return validated;
        var missing = MissingReferences(validated.Value!);
        return missing is null ? validated : OperationResult<ValidatedInput>.Invalid(missing);
    }

    private Dictionary<string, string[]>? MissingReferences(ValidatedInput input)
    {
        if (input.References.Count == 0) return null;
        var missing = store.FindMissingReferences(input.References);
        if (missing.Count == 0) return null;
        return input.References
            .Where(reference => missing.Contains(reference.Field))
            .ToDictionary(reference => reference.Field, reference => new[] { InputValidator.ReferenceMessage(reference.Target) }, StringComparer.Ordinal);
    }

    private string DefaultPaymentDate(string month, int dueDay)
    {
        if (month == CurrentMonth) return Today.ToString("yyyy-MM-dd", Invariant);
        var first = DateOnly.ParseExact($"{month}-01", "yyyy-MM-dd", Invariant);
        var day = Math.Clamp(dueDay, 1, DateTime.DaysInMonth(first.Year, first.Month));
        return new DateOnly(first.Year, first.Month, day).ToString("yyyy-MM-dd", Invariant);
    }

    private static string DefaultBankDescription(string kind) => kind switch
    {
        "deposit" => "Entrada",
        "withdrawal" => "Saída",
        "transfer_in" => "Transferência recebida",
        "transfer_out" => "Transferência enviada",
        _ => "Ajuste de saldo"
    };


    /// <summary>Normaliza o assistente inicial: descarta itens vazios e aplica padrões (vencimento 10, meta livre, BRL, cartão 25/5).</summary>
    private static class SetupNormalizer
    {
        public static OperationResult<SetupCommand> Normalize(SetupCommand command)
        {
            if (command.MonthlyNetIncomeCents < 0) return OperationResult<SetupCommand>.Invalid("monthly_net_income_cents", Messages.NonNegative);
            if (command.MonthlySpendingLimitCents < 0) return OperationResult<SetupCommand>.Invalid("monthly_spending_limit_cents", Messages.NonNegative);
            if (command.EmergencyMonthsTarget is < 1 or > 120) return OperationResult<SetupCommand>.Invalid("emergency_months_target", Messages.MonthsRange);
            var displayName = command.DisplayName?.Trim() ?? "";
            if (displayName.Length > 120) return OperationResult<SetupCommand>.Invalid("display_name", Messages.MaxLength(120));

            var bills = new List<SetupBill>();
            foreach (var bill in command.Bills ?? [])
            {
                var name = bill.Name?.Trim();
                if (string.IsNullOrEmpty(name) || bill.AmountCents <= 0) continue;
                if (name.Length > 120) return OperationResult<SetupCommand>.Invalid("bills", Messages.MaxLength(120));
                bills.Add(bill with { Name = name, DueDay = bill.DueDay is >= 1 and <= 31 ? bill.DueDay : 10 });
            }

            var goals = new List<SetupGoal>();
            foreach (var goal in command.Goals ?? [])
            {
                var name = goal.Name?.Trim();
                if (string.IsNullOrEmpty(name) || goal.TargetCents <= 0) continue;
                if (name.Length > 120) return OperationResult<SetupCommand>.Invalid("goals", Messages.MaxLength(120));
                var type = string.IsNullOrWhiteSpace(goal.Type) ? "custom" : goal.Type.Trim();
                if (!FinanceEnums.GoalTypes.Contains(type)) return OperationResult<SetupCommand>.Invalid("type", Messages.InvalidOption);
                if (goal.CurrentCents < 0) return OperationResult<SetupCommand>.Invalid("current_cents", Messages.NonNegative);
                var targetDate = string.IsNullOrWhiteSpace(goal.TargetDate) ? null : goal.TargetDate.Trim();
                if (targetDate is not null && !InputValidator.IsIsoDate(targetDate)) return OperationResult<SetupCommand>.Invalid("target_date", Messages.Date);
                var currency = string.IsNullOrWhiteSpace(goal.Currency) ? "BRL" : goal.Currency.Trim();
                if (!Currencies.IsSupported(currency)) return OperationResult<SetupCommand>.Invalid("currency", IsCurrency(currency) ? Messages.CurrencyUnsupported : Messages.Currency);
                var notes = string.IsNullOrWhiteSpace(goal.Notes) ? null : goal.Notes.Trim();
                goals.Add(goal with { Name = name, Type = type, TargetDate = targetDate, Currency = currency, Notes = notes });
            }

            SetupCard? card = null;
            var cardName = command.Card?.Name?.Trim();
            if (command.Card is not null && !string.IsNullOrEmpty(cardName))
            {
                if (command.Card.RealLimitCents < 0 || command.Card.PersonalLimitCents < 0) return OperationResult<SetupCommand>.Invalid("card", Messages.NonNegative);
                card = command.Card with
                {
                    Name = cardName,
                    ClosingDay = command.Card.ClosingDay is >= 1 and <= 31 ? command.Card.ClosingDay : 25,
                    DueDay = command.Card.DueDay is >= 1 and <= 31 ? command.Card.DueDay : 5
                };
            }

            return OperationResult<SetupCommand>.Success(command with { DisplayName = displayName, Bills = bills, Goals = goals, Card = card });
        }
    }
}
