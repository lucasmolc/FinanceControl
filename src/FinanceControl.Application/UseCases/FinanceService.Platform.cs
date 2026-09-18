using System.Globalization;
using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Application.Validation;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.UseCases;

/// <summary>Plataforma: desfazer estornos, paginação, fechamento mensal, faturas de cartão e contagem de vínculos.</summary>
public sealed partial class FinanceService
{
    private const int MaxPageSize = 200;
    private const int DefaultStatementLimit = 500;
    private const int MaxInvoiceRange = 36;

    public FinanceState GetState()
    {
        var state = store.GetState();
        var worth = RecordNetWorthSnapshot();
        var settings = state.Settings.WithFreedomProgress(worth.InvestmentsCents);
        return state with
        {
            Settings = settings,
            Goals = WithFreedomProgress(state.Goals, settings),
            Cards = state.Cards.Select(WithInvoiceTotals).ToList(),
            MissingRateCurrencies = MissingRates(state, LatestRates())
        };
    }

    // ---------- Número da liberdade: progresso = patrimônio investido (decisão 3 do R1) ----------

    /// <summary>Investimentos ativos em BRL pela última cotação; moedas sem cotação ficam fora (como no patrimônio).</summary>
    private long InvestedWealthCents()
    {
        var rates = LatestRates();
        return store.ListHoldings().Where(item => item.Kind == "investment").Sum(item => CurrencyRules.ToBaseCents(item.NativeCents, item.Currency, rates) ?? 0);
    }

    /// <summary>A meta vinculada ao número da liberdade (ativa) mostra como valor guardado o patrimônio investido.</summary>
    private static IReadOnlyList<Goal> WithFreedomProgress(IReadOnlyList<Goal> goals, Settings settings) =>
        goals.Select(goal => IsFreedomGoal(goal.Id, settings) ? CopyGoal(goal, settings.FreedomProgressCents) : goal).ToList();

    private static bool IsFreedomGoal(long goalId, Settings settings) =>
        settings.FreedomGoalStatus == ReserveRules.Linked && settings.FreedomGoalId == goalId;

    private static Goal CopyGoal(Goal goal, long currentCents) => new()
    {
        Id = goal.Id, Name = goal.Name, Type = goal.Type, TargetCents = goal.TargetCents, CurrentCents = currentCents,
        TargetDate = goal.TargetDate, Currency = goal.Currency, Active = goal.Active, Notes = goal.Notes
    };

    /// <summary><c>GET /api/goals</c> com o progresso da meta do número da liberdade.</summary>
    private IReadOnlyList<IReadOnlyDictionary<string, object?>> GoalRowsWithFreedomProgress(IReadOnlyList<IReadOnlyDictionary<string, object?>> rows)
    {
        var settings = store.GetSettings();
        if (settings.FreedomGoalStatus != ReserveRules.Linked) return rows;
        var progress = InvestedWealthCents();
        return rows.Select(row => row.TryGetValue("id", out var id) && Convert.ToInt64(id, Invariant) == settings.FreedomGoalId
            ? new Dictionary<string, object?>(row, StringComparer.Ordinal) { ["current_cents"] = progress }
            : row).ToList();
    }

    // ---------- Movimentações: paginação, estorno e desfazer ----------

    public OperationResult<EntryPage<GoalEntry>> ListGoalEntries(long goalId, string? limit = null, string? offset = null) =>
        Page(limit, offset, null, (size, skip) => store.ListGoalEntries(goalId, size, skip));

    public OperationResult<EntryPage<InvestmentEntry>> ListInvestmentEntries(long investmentId, string? limit = null, string? offset = null) =>
        Page(limit, offset, null, (size, skip) => store.ListInvestmentEntries(investmentId, size, skip));

    public OperationResult<EntryPage<BankStatementItem>> ListBankStatement(long accountId, string? limit = null, string? offset = null) =>
        Page(limit, offset, DefaultStatementLimit, (size, skip) => store.ListBankStatement(accountId, size!.Value, skip));

    public OperationResult<bool> RestoreGoalEntry(long goalId, long entryId) =>
        Movement(MovementLedger.Goal, goalId, entryId, removed: true, store.RestoreGoalEntry);

    public OperationResult<bool> RestoreInvestmentEntry(long investmentId, long entryId) =>
        Movement(MovementLedger.Investment, investmentId, entryId, removed: true, store.RestoreInvestmentEntry);

    public OperationResult<bool> RestoreBankEntry(long accountId, long entryId) =>
        Movement(MovementLedger.Bank, accountId, entryId, removed: true, store.RestoreBankEntry);

    /// <summary>Estorno ou desfazer: 404 sem a movimentação no estado esperado; 400 quando ela é de um mês fechado.</summary>
    private OperationResult<bool> Movement(MovementLedger ledger, long parentId, long entryId, bool removed, Func<long, long, OperationResult<bool>> apply)
    {
        if (parentId <= 0 || entryId <= 0) return OperationResult<bool>.NotFound();
        var date = store.FindMovementDate(ledger, parentId, entryId, removed);
        if (date is null) return OperationResult<bool>.NotFound();
        // Saída de pagamento de fatura: estornar/desfazer também paga ou desfaz a fatura, então o mês dela precisa estar aberto.
        var invoiceMonth = ledger == MovementLedger.Bank ? store.FindInvoiceMonthOfEntry(entryId) : null;
        return ClosedMonthError<bool>("date", date, invoiceMonth) ?? apply(parentId, entryId);
    }

    private static OperationResult<EntryPage<T>> Page<T>(string? limit, string? offset, int? defaultLimit, Func<int?, int, EntryPage<T>?> load)
    {
        int? size = defaultLimit;
        if (!string.IsNullOrWhiteSpace(limit))
        {
            if (!long.TryParse(limit.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)) return OperationResult<EntryPage<T>>.Invalid("limit", Messages.InvalidValue);
            if (parsed is < 1 or > MaxPageSize) return OperationResult<EntryPage<T>>.Invalid("limit", Messages.LimitRange);
            size = (int)parsed;
        }
        var skip = 0;
        if (!string.IsNullOrWhiteSpace(offset))
        {
            if (!long.TryParse(offset.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)) return OperationResult<EntryPage<T>>.Invalid("offset", Messages.InvalidValue);
            if (parsed < 0) return OperationResult<EntryPage<T>>.Invalid("offset", Messages.NonNegative);
            skip = (int)Math.Min(parsed, int.MaxValue);
        }
        var page = load(size, skip);
        return page is null ? OperationResult<EntryPage<T>>.NotFound() : OperationResult<EntryPage<T>>.Success(page);
    }

    // ---------- Fechamento mensal ----------

    public IReadOnlyList<MonthlyClosing> ListClosings() => store.ListClosings();

    public OperationResult<MonthlyClosing> CloseMonth(string month, RecordData data)
    {
        if (!InputValidator.IsMonth(month)) return OperationResult<MonthlyClosing>.Invalid("month", Messages.Month);
        if (string.CompareOrdinal(month, CurrentMonth) > 0) return OperationResult<MonthlyClosing>.Invalid("month", Messages.FutureMonth);
        var validated = InputValidator.Validate(ModuleSchemas.MonthClose, data.Values, ValidationMode.Create);
        if (!validated.IsSuccess) return validated.Failure<MonthlyClosing>();
        if (store.IsMonthClosed(month)) return OperationResult<MonthlyClosing>.Invalid("month", Messages.MonthAlreadyClosed);

        var closedAt = timeProvider.GetUtcNow().ToString("O", Invariant);
        var notes = validated.Value!.Text("notes");
        var summary = WithDailyAndTopExpenses(store.GetMonthlySummary(month), month) with { Closed = true, ClosedAt = closedAt };
        return store.CloseMonth(new MonthCloseCommand(month, closedAt, notes, summary))
            ? OperationResult<MonthlyClosing>.Success(new MonthlyClosing { Month = month, ClosedAt = closedAt, Notes = notes })
            : OperationResult<MonthlyClosing>.Invalid("month", Messages.MonthAlreadyClosed);
    }

    public OperationResult<bool> ReopenMonth(string month)
    {
        if (!InputValidator.IsMonth(month)) return OperationResult<bool>.Invalid("month", Messages.Month);
        return store.ReopenMonth(month) ? OperationResult<bool>.Success(true) : OperationResult<bool>.NotFound();
    }

    /// <summary>Erro 400 no campo quando alguma das datas (AAAA-MM-DD) ou competências (AAAA-MM) cai em mês fechado; null se liberado.</summary>
    private OperationResult<T>? ClosedMonthError<T>(string field, params string?[] dates)
    {
        foreach (var month in dates.Where(date => date is { Length: >= 7 }).Select(date => date![..7]).Distinct(StringComparer.Ordinal))
            if (store.IsMonthClosed(month)) return OperationResult<T>.Invalid(field, Messages.MonthClosed(month));
        return null;
    }

    // ---------- Compras no cartão ----------

    /// <summary>
    /// Com cartão no registro resultante (enviado ou atual): a conta deve ficar vazia e a forma de pagamento é sempre
    /// <c>card</c> (preenchida quando não enviada). Devolve os valores a gravar.
    /// </summary>
    private static OperationResult<IReadOnlyDictionary<string, object?>> NormalizeCardPurchase(ValidatedInput input, Transaction? current)
    {
        var values = new Dictionary<string, object?>(input.Values, StringComparer.Ordinal);
        var cardId = input.Has("card_id") ? input.Number("card_id") : current?.CardId;
        if (cardId is null) return OperationResult<IReadOnlyDictionary<string, object?>>.Success(values);

        var accountId = input.Has("account_id") ? input.Number("account_id") : current?.AccountId;
        if (accountId is not null) return OperationResult<IReadOnlyDictionary<string, object?>>.Invalid("account_id", Messages.CardPurchaseAccount);

        var paymentMethod = input.Text("payment_method") ?? (input.Has("card_id") ? null : current?.PaymentMethod);
        if (paymentMethod is null) values["payment_method"] = "card";
        else if (paymentMethod != "card") return OperationResult<IReadOnlyDictionary<string, object?>>.Invalid("payment_method", Messages.CardPurchasePaymentMethod);
        return OperationResult<IReadOnlyDictionary<string, object?>>.Success(values);
    }

    /// <summary>
    /// CR-06: o registro resultante com forma de pagamento <c>card</c> (enviada, mantida na edição ou a padrão na criação) precisa de
    /// um cartão. Vale para criar e editar; lançamentos antigos sem cartão continuam legíveis, mas editá-los exige escolher o cartão
    /// ou outra forma de pagamento.
    /// </summary>
    private static bool CardPurchaseWithoutCard(ValidatedInput input, IReadOnlyDictionary<string, object?> values, Transaction? current)
    {
        var paymentMethod = values.TryGetValue("payment_method", out var sent) && sent is string method ? method : current?.PaymentMethod ?? "card";
        var cardId = input.Has("card_id") ? input.Number("card_id") : current?.CardId;
        return paymentMethod == "card" && cardId is null;
    }

    private bool IsActiveAccount(long accountId) =>
        store.FindMissingReferences([new ReferenceCheck("account_id", ReferenceTarget.ActiveBankAccount, accountId)]).Count == 0;

    // ---------- Faturas de cartão ----------

    public OperationResult<IReadOnlyList<CardInvoice>> ListCardInvoices(long cardId, string? from, string? to)
    {
        var card = cardId > 0 ? store.FindCard(cardId) : null;
        if (card is null) return OperationResult<IReadOnlyList<CardInvoice>>.NotFound();

        from = string.IsNullOrWhiteSpace(from) ? null : from.Trim();
        to = string.IsNullOrWhiteSpace(to) ? null : to.Trim();
        if (from is not null && !IsInvoiceMonth(from)) return OperationResult<IReadOnlyList<CardInvoice>>.Invalid("from", Messages.Month);
        if (to is not null && !IsInvoiceMonth(to)) return OperationResult<IReadOnlyList<CardInvoice>>.Invalid("to", Messages.Month);

        List<InvoiceCycle> cycles;
        if (from is null && to is null)
        {
            // Padrão: faturas anteriores não pagas com valor (R1-CARD-1), a anterior, a aberta hoje (que contém a data de hoje) e a seguinte.
            var open = CardInvoiceRules.CycleFor(card.ClosingDay, card.DueDay, Today);
            var first = FirstDay(open.Month).AddMonths(-1);
            var window = Enumerable.Range(0, 3).Select(index => CycleOf(card, first.AddMonths(index))).ToList();
            var paid = PaymentsByMonth(cardId);
            cycles = UnpaidTotals(card, window[0].PeriodStart.AddDays(-1), paid)
                .Select(item => CardInvoiceRules.Cycle(card.ClosingDay, card.DueDay, item.Key))
                .Concat(window).ToList();
        }
        else
        {
            var start = FirstDay(from ?? to!);
            var end = FirstDay(to ?? from!);
            if (end < start) return OperationResult<IReadOnlyList<CardInvoice>>.Invalid("to", Messages.MonthRangeOrder);
            var count = (end.Year - start.Year) * 12 + end.Month - start.Month + 1;
            if (count > MaxInvoiceRange) return OperationResult<IReadOnlyList<CardInvoice>>.Invalid("to", Messages.MonthRangeSize);
            cycles = Enumerable.Range(0, count).Select(index => CycleOf(card, start.AddMonths(index))).ToList();
        }

        var transactions = store.ListCardTransactions(cardId, Iso(cycles[0].PeriodStart), Iso(cycles[^1].ClosingDate));
        var payments = PaymentsByMonth(cardId);
        return OperationResult<IReadOnlyList<CardInvoice>>.Success(
            cycles.Select(cycle => BuildInvoice(cycle, transactions.Where(item => cycle.Contains(ParseDate(item.Date))).ToList(), payments)).ToList());
    }

    public OperationResult<CardInvoiceDetail> GetCardInvoice(long cardId, string month)
    {
        var card = cardId > 0 ? store.FindCard(cardId) : null;
        if (card is null) return OperationResult<CardInvoiceDetail>.NotFound();
        if (!IsInvoiceMonth(month)) return OperationResult<CardInvoiceDetail>.Invalid("month", Messages.Month);
        var (cycle, items) = LoadInvoice(card, month);
        var detail = BuildInvoice(cycle, items, PaymentsByMonth(cardId));
        return OperationResult<CardInvoiceDetail>.Success(new CardInvoiceDetail
        {
            Month = detail.Month, PeriodStart = detail.PeriodStart, PeriodEnd = detail.PeriodEnd, ClosingDate = detail.ClosingDate, DueDate = detail.DueDate,
            TotalCents = detail.TotalCents, ItemsCount = detail.ItemsCount, Status = detail.Status, Paid = detail.Paid, Items = items
        });
    }

    /// <summary>
    /// Faturas de todos os cartões ativos para a lista de contas a pagar (R1-BILLS-2): as que vencem no mês com valor (ou já pagas) e,
    /// no mês atual ou posteriores, também as anteriores fechadas sem pagamento com valor. Ordem: vencimento, cartão.
    /// </summary>
    public OperationResult<IReadOnlyList<CardInvoiceRow>> ListInvoicesToPay(string? month)
    {
        month = string.IsNullOrWhiteSpace(month) ? CurrentMonth : month.Trim();
        if (!IsInvoiceMonth(month)) return OperationResult<IReadOnlyList<CardInvoiceRow>>.Invalid("month", Messages.Month);
        var carryOver = string.CompareOrdinal(month, CurrentMonth) >= 0;
        var rows = new List<CardInvoiceRow>();
        foreach (var card in store.ListActiveCards())
        {
            var payments = PaymentsByMonth(card.Id);
            var target = CardInvoiceRules.Cycle(card.ClosingDay, card.DueDay, month);
            var transactions = store.ListCardTransactions(card.Id, null, Iso(target.ClosingDate));
            var months = transactions.Select(item => CardInvoiceRules.CycleFor(card.ClosingDay, card.DueDay, ParseDate(item.Date)).Month)
                .Append(month).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal);
            foreach (var invoiceMonth in months)
            {
                var cycle = CardInvoiceRules.Cycle(card.ClosingDay, card.DueDay, invoiceMonth);
                var invoice = BuildInvoice(cycle, transactions.Where(item => cycle.Contains(ParseDate(item.Date))).ToList(), payments);
                var include = invoiceMonth == month
                    ? invoice.TotalCents > 0 || invoice.Paid is not null
                    : carryOver && string.CompareOrdinal(invoiceMonth, month) < 0 && invoice.Paid is null && invoice.TotalCents > 0
                      && invoice.Status is CardInvoiceRules.Closed or CardInvoiceRules.Overdue;
                if (include) rows.Add(WithCard(invoice, card));
            }
        }
        return OperationResult<IReadOnlyList<CardInvoiceRow>>.Success(
            rows.OrderBy(row => row.DueDate, StringComparer.Ordinal).ThenBy(row => row.CardName, StringComparer.CurrentCulture).ThenBy(row => row.CardId).ToList());
    }

    private static CardInvoiceRow WithCard(CardInvoice invoice, Card card) => new()
    {
        Month = invoice.Month, PeriodStart = invoice.PeriodStart, PeriodEnd = invoice.PeriodEnd, ClosingDate = invoice.ClosingDate, DueDate = invoice.DueDate,
        TotalCents = invoice.TotalCents, ItemsCount = invoice.ItemsCount, Status = invoice.Status, Paid = invoice.Paid,
        CardId = card.Id, CardName = card.Name, Brand = card.Brand, Network = card.Network, Color = card.Color
    };

    /// <summary>Totais por mês das faturas sem pagamento com valor &gt; 0 formadas por compras até <paramref name="lastDate"/> (inclusive), em ordem de mês.</summary>
    private IEnumerable<KeyValuePair<string, long>> UnpaidTotals(Card card, DateOnly lastDate, IReadOnlyDictionary<string, CardInvoicePayment> payments) =>
        store.ListCardTransactions(card.Id, null, Iso(lastDate))
            .GroupBy(item => CardInvoiceRules.CycleFor(card.ClosingDay, card.DueDay, ParseDate(item.Date)).Month, StringComparer.Ordinal)
            .Select(group => KeyValuePair.Create(group.Key, group.Sum(item => CardInvoiceRules.SignedAmount(item.Kind, item.BaseAmountCents))))
            .Where(item => item.Value > 0 && !payments.ContainsKey(item.Key))
            .OrderBy(item => item.Key, StringComparer.Ordinal);

    public OperationResult<long> PayCardInvoice(long cardId, string month, RecordData data)
    {
        var card = cardId > 0 ? store.FindCard(cardId) : null;
        if (card is null) return OperationResult<long>.NotFound();
        if (!IsInvoiceMonth(month)) return OperationResult<long>.Invalid("month", Messages.Month);
        var validated = ValidateWithReferences(ModuleSchemas.InvoicePayment, data, ValidationMode.Create);
        if (!validated.IsSuccess) return validated.Failure<long>();
        var input = validated.Value!;
        if (PaymentsByMonth(cardId).ContainsKey(month)) return OperationResult<long>.Invalid("month", Messages.InvoiceAlreadyPaid);

        var (_, items) = LoadInvoice(card, month);
        var total = items.Sum(item => CardInvoiceRules.SignedAmount(item.Kind, item.BaseAmountCents));
        var amount = input.Number("amount_cents");
        if (amount is null && total <= 0) return OperationResult<long>.Invalid("amount_cents", Messages.InvoiceWithoutAmount);
        var date = input.Text("date") ?? Today.ToString("yyyy-MM-dd", Invariant);
        var closed = ClosedMonthError<long>("date", date, month);
        if (closed is not null) return closed;

        return store.PayCardInvoice(new CardInvoicePaymentCommand(
            cardId, month, amount ?? total, date, input.Number("account_id")!.Value,
            $"Fatura {card.Name} {month[5..7]}/{month[..4]}", timeProvider.GetUtcNow().ToString("O", Invariant)));
    }

    public OperationResult<bool> UnpayCardInvoice(long cardId, string month)
    {
        if (cardId <= 0 || store.FindCard(cardId) is null) return OperationResult<bool>.NotFound();
        if (!IsInvoiceMonth(month)) return OperationResult<bool>.Invalid("month", Messages.Month);
        if (!PaymentsByMonth(cardId).TryGetValue(month, out var payment)) return OperationResult<bool>.NotFound();
        return ClosedMonthError<bool>("date", payment.Date, month) ?? store.UnpayCardInvoice(cardId, month);
    }

    /// <summary>Totais do cartão em <c>/api/state</c>: fatura aberta hoje, faturas não pagas com valor até a aberta e limite disponível.</summary>
    private Card WithInvoiceTotals(Card card)
    {
        var open = CardInvoiceRules.CycleFor(card.ClosingDay, card.DueDay, Today);
        var payments = PaymentsByMonth(card.Id);
        var totals = store.ListCardTransactions(card.Id, null, Iso(open.ClosingDate))
            .GroupBy(item => CardInvoiceRules.CycleFor(card.ClosingDay, card.DueDay, ParseDate(item.Date)).Month, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Sum(item => CardInvoiceRules.SignedAmount(item.Kind, item.BaseAmountCents)), StringComparer.Ordinal);
        var unpaid = totals.Where(item => item.Value > 0 && !payments.ContainsKey(item.Key)).Sum(item => item.Value);
        return new Card
        {
            Id = card.Id, Name = card.Name, ClosingDay = card.ClosingDay, DueDay = card.DueDay, RealLimitCents = card.RealLimitCents,
            PersonalLimitCents = card.PersonalLimitCents, Active = card.Active, Brand = card.Brand, Network = card.Network, Color = card.Color,
            OpenInvoiceCents = totals.GetValueOrDefault(open.Month),
            UnpaidInvoicesCents = unpaid,
            AvailableLimitCents = CardInvoiceRules.AvailableLimit(card.RealLimitCents, card.PersonalLimitCents, unpaid)
        };
    }

    private (InvoiceCycle Cycle, IReadOnlyList<Transaction> Items) LoadInvoice(Card card, string month)
    {
        var cycle = CardInvoiceRules.Cycle(card.ClosingDay, card.DueDay, month);
        return (cycle, store.ListCardTransactions(card.Id, Iso(cycle.PeriodStart), Iso(cycle.ClosingDate)));
    }

    private CardInvoice BuildInvoice(InvoiceCycle cycle, IReadOnlyList<Transaction> items, IReadOnlyDictionary<string, CardInvoicePayment> payments)
    {
        payments.TryGetValue(cycle.Month, out var payment);
        var total = items.Sum(item => CardInvoiceRules.SignedAmount(item.Kind, item.BaseAmountCents));
        return new CardInvoice
        {
            Month = cycle.Month,
            PeriodStart = Iso(cycle.PeriodStart),
            PeriodEnd = Iso(cycle.PeriodEnd),
            ClosingDate = Iso(cycle.ClosingDate),
            DueDate = Iso(cycle.DueDate),
            TotalCents = total,
            ItemsCount = items.Count,
            Status = CardInvoiceRules.Status(cycle, Today, payment is not null, total),
            Paid = payment is null ? null : new InvoicePaymentInfo(payment.AmountCents, payment.Date, payment.AccountId, payment.AccountName, payment.BankEntryId)
        };
    }

    private Dictionary<string, CardInvoicePayment> PaymentsByMonth(long cardId) =>
        store.ListInvoicePayments(cardId).ToDictionary(payment => payment.Month, StringComparer.Ordinal);

    private static InvoiceCycle CycleOf(Card card, DateOnly month) => CardInvoiceRules.Cycle(card.ClosingDay, card.DueDay, month.Year, month.Month);

    /// <summary>Competência válida com folga para o mês anterior (o período começa no fechamento do mês anterior).</summary>
    private static bool IsInvoiceMonth(string? value) => InputValidator.IsMonth(value) && FirstDay(value!).Year is >= 1900 and <= 9998;

    private static DateOnly FirstDay(string month) => DateOnly.ParseExact($"{month}-01", "yyyy-MM-dd", Invariant);
    private static DateOnly ParseDate(string date) => DateOnly.ParseExact(date, "yyyy-MM-dd", Invariant);
    private static string Iso(DateOnly date) => date.ToString("yyyy-MM-dd", Invariant);

    // ---------- Vínculos ----------

    public OperationResult<ReassignCounts> GetCategoryLinks(long categoryId) =>
        categoryId > 0 && store.FindCategory(categoryId) is not null
            ? OperationResult<ReassignCounts>.Success(store.CountCategoryLinks(categoryId))
            : OperationResult<ReassignCounts>.NotFound();

    public OperationResult<CardLinks> GetCardLinks(long cardId) =>
        cardId > 0 && store.FindCard(cardId) is not null
            ? OperationResult<CardLinks>.Success(store.CountCardLinks(cardId))
            : OperationResult<CardLinks>.NotFound();
}
