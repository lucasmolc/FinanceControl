using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Application.Import;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.UseCases;

/// <summary>
/// Importação de fatura de cartão ou extrato de conta (v1.4): o arquivo vira um lançamento por linha, com a
/// <b>data da compra</b> — uma compra de setembro continua sendo gasto de setembro mesmo vindo na fatura de outubro.
/// Em linhas parceladas o arquivo repete a data da compra original, então a data do gasto é deslocada para o mês da
/// parcela cobrada (compra 04/07 na parcela 3/3 = gasto de 04/09), que é o mês em que ela realmente pesa.
/// Nada é gravado na conferência: a mesma leitura é refeita ao confirmar, e cada linha carrega uma marca de origem
/// que impede importar o mesmo arquivo duas vezes.
/// </summary>
public sealed partial class FinanceService
{
    /// <summary>Limite do arquivo enviado (5 MB), o bastante para faturas e extratos de qualquer período.</summary>
    private const int MaxImportBytes = 5 * 1024 * 1024;

    /// <summary>
    /// Dias de tolerância ao procurar um lançamento que a linha já repete. Uma assinatura lançada pelo app cai no dia
    /// de cobrança, enquanto a fatura mostra a data em que a compra foi processada; sem essa folga a mesma Netflix
    /// entraria duas vezes ao importar a fatura do cartão em que a assinatura está cadastrada.
    /// </summary>
    private const int DuplicateWindowDays = 4;

    private sealed record ImportTarget(Card? Card, BankAccount? Account, string Currency, AmountConvention Convention, bool PositiveIsExpense)
    {
        public long Id => Card?.Id ?? Account!.Id;
        public string Name => Card?.Name ?? Account!.Name;
        public string Kind => Card is not null ? "card" : "account";
    }

    public OperationResult<ImportPreview> PreviewImport(ImportCommand command)
    {
        var prepared = ReadImport(command);
        return prepared.IsSuccess ? OperationResult<ImportPreview>.Success(prepared.Value!) : prepared.Failure<ImportPreview>();
    }

    public OperationResult<ImportResult> CommitImport(ImportCommand command)
    {
        var prepared = ReadImport(command);
        if (!prepared.IsSuccess) return prepared.Failure<ImportResult>();
        var preview = prepared.Value!;

        var chosen = command.Fingerprints is { Count: > 0 } selected
            ? new HashSet<string>(selected, StringComparer.Ordinal)
            : null;
        // Sem escolha explícita valem as linhas novas; com escolha, as escolhidas que ainda podem entrar.
        var importable = preview.Lines
            .Where(line => line.Status is ImportStatus.New or ImportStatus.Duplicate or ImportStatus.Payment)
            .Where(line => chosen is null ? line.Status == ImportStatus.New : chosen.Contains(line.Fingerprint))
            .ToList();
        if (importable.Count == 0) return OperationResult<ImportResult>.Invalid("fingerprints", Messages.ImportNothingSelected);

        var categoryId = command.CategoryId;
        if (categoryId is long id && store.FindCategory(id) is null) return OperationResult<ImportResult>.Invalid("category_id", Messages.CategoryNotFound);

        var rows = importable.Select(line => (IReadOnlyDictionary<string, object?>)new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["date"] = line.Date,
            ["description"] = line.Description,
            ["kind"] = line.Kind,
            ["amount_cents"] = line.AmountCents,
            ["payment_method"] = line.CardId is not null ? "card" : PaymentMethodOf(line.Kind),
            ["card_id"] = line.CardId,
            ["account_id"] = line.AccountId,
            ["category_id"] = categoryId,
            ["notes"] = line.Notes,
            ["currency"] = line.Currency,
            ["base_amount_cents"] = BaseAmountOf(line),
            ["exchange_rate"] = ExchangeRateOf(line.Currency),
            ["installment_number"] = line.InstallmentNumber is int number ? (long)number : null,
            ["installment_count"] = line.InstallmentCount is int count ? (long)count : null,
            ["import_fingerprint"] = line.Fingerprint,
        }).ToList();

        var created = store.CreateTransactions(rows);
        return created.IsSuccess
            ? OperationResult<ImportResult>.Success(new ImportResult(created.Value!.Count, preview.Lines.Count - created.Value!.Count, created.Value!))
            : created.Failure<ImportResult>();
    }

    /// <summary>Extrato sem cartão: entrada vira depósito e saída, uma transferência — a forma de pagamento que o app usa para movimento de conta.</summary>
    private static string PaymentMethodOf(string kind) => kind == "income" ? "transfer" : "debit";

    private long BaseAmountOf(ImportLine line) =>
        line.Currency == Currencies.Base ? line.AmountCents : CurrencyRules.ToBaseCents(line.AmountCents, line.Currency, LatestRates()) ?? line.AmountCents;

    private string ExchangeRateOf(string currency) =>
        currency == Currencies.Base ? "1" : LatestRates().TryGetValue(currency, out var rate) ? CurrencyRules.FormatRate(rate) : "1";

    // ---------- Leitura ----------

    private OperationResult<ImportPreview> ReadImport(ImportCommand command)
    {
        var target = ResolveTarget(command);
        if (!target.IsSuccess) return target.Failure<ImportPreview>();
        var content = DecodeContent(command.ContentBase64);
        if (!content.IsSuccess) return content.Failure<ImportPreview>();

        var decimals = Currencies.DecimalsOf(target.Value!.Currency);
        var document = StatementReader.Read(content.Value!, target.Value!.Convention, decimals);
        if (!document.IsSuccess) return document.Failure<ImportPreview>();

        var lines = BuildLines(document.Value!, target.Value!, command.FileName);
        return OperationResult<ImportPreview>.Success(new ImportPreview(
            document.Value!.Format, target.Value!.Kind, target.Value!.Id, target.Value!.Name, target.Value!.Currency,
            target.Value!.PositiveIsExpense, lines, Totals(lines)));
    }

    private OperationResult<ImportTarget> ResolveTarget(ImportCommand command)
    {
        if (command.CardId is not null && command.AccountId is not null) return OperationResult<ImportTarget>.Invalid("card_id", Messages.ImportTargetSingle);
        if (command.CardId is long cardId)
        {
            var card = store.FindCard(cardId);
            if (card is not { Active: true }) return OperationResult<ImportTarget>.Invalid("card_id", Messages.ActiveCardNotFound);
            // Fatura de cartão: a compra vem positiva e o estorno negativo, salvo indicação contrária.
            var positiveIsExpense = command.PositiveIsExpense ?? true;
            return OperationResult<ImportTarget>.Success(new ImportTarget(card, null, Currencies.Base, Convention(positiveIsExpense), positiveIsExpense));
        }
        if (command.AccountId is long accountId)
        {
            var account = store.FindBankAccount(accountId);
            if (account is not { Active: true }) return OperationResult<ImportTarget>.Invalid("account_id", Messages.AccountNotFound);
            // Extrato: a saída vem negativa.
            var positiveIsExpense = command.PositiveIsExpense ?? false;
            return OperationResult<ImportTarget>.Success(new ImportTarget(null, account, account.Currency, Convention(positiveIsExpense), positiveIsExpense));
        }
        return OperationResult<ImportTarget>.Invalid("card_id", Messages.ImportTargetRequired);
    }

    private static AmountConvention Convention(bool positiveIsExpense) =>
        positiveIsExpense ? AmountConvention.DebitPositive : AmountConvention.CreditPositive;

    private static OperationResult<byte[]> DecodeContent(string? base64)
    {
        if (string.IsNullOrWhiteSpace(base64)) return OperationResult<byte[]>.Invalid("content_base64", Messages.ImportFileRequired);
        // O base64 tem ~4/3 do tamanho do arquivo; recusa antes de alocar.
        if ((long)base64.Length * 3 / 4 > MaxImportBytes) return OperationResult<byte[]>.Invalid("content_base64", Messages.ImportFileTooLarge);
        var payload = base64.Contains(',', StringComparison.Ordinal) ? base64[(base64.IndexOf(',', StringComparison.Ordinal) + 1)..] : base64;
        try
        {
            var bytes = Convert.FromBase64String(payload.Trim());
            return bytes.Length > MaxImportBytes
                ? OperationResult<byte[]>.Invalid("content_base64", Messages.ImportFileTooLarge)
                : OperationResult<byte[]>.Success(bytes);
        }
        catch (FormatException)
        {
            return OperationResult<byte[]>.Invalid("content_base64", Messages.ImportFileInvalid);
        }
    }

    private IReadOnlyList<ImportLine> BuildLines(StatementDocument document, ImportTarget target, string? fileName)
    {
        var cards = target.Card is null ? [] : store.ListActiveCards();
        var occurrences = new Dictionary<string, int>(StringComparer.Ordinal);
        var drafts = new List<(StatementLine Source, ImportLine Line)>();
        var fileCycle = FileCycle(document, target.Card);

        foreach (var source in document.Lines)
        {
            var kind = StatementRules.KindOf(source.SignedAmountCents, document.Convention);
            var amount = StatementRules.AmountOf(source.SignedAmountCents);
            if (amount == 0) continue;

            var date = InstallmentDate(source, fileCycle);
            var card = target.Card is null ? null : ResolveCard(source, target.Card, cards);
            var invoiceMonth = card is null ? null : CardInvoiceRules.CycleFor(card.ClosingDay, card.DueDay, date).Month;

            var key = $"{Iso(source.Date)}|{source.Description}|{source.SignedAmountCents}";
            occurrences[key] = occurrences.GetValueOrDefault(key) + 1;
            var fingerprint = Fingerprint(target, source, occurrences[key]);

            drafts.Add((source, new ImportLine(
                fingerprint, Iso(date), Describe(source), kind, amount, target.Currency,
                card?.Id, card?.Name, target.Account?.Id, invoiceMonth,
                source.InstallmentNumber, source.InstallmentCount,
                date == source.Date ? null : Iso(source.Date),
                Notes(source, fileName, date), ImportStatus.New)));
        }

        return Classify(drafts, target);
    }

    /// <summary>
    /// Fatura que o arquivo representa: o ciclo em que cai a maioria das compras à vista. É o que diz, adiante, se a
    /// data de uma parcela precisa ser deslocada. Sem cartão (extrato) ou sem compras à vista, fica indefinida.
    /// </summary>
    private static InvoiceCycle? FileCycle(StatementDocument document, Card? card)
    {
        if (card is null) return null;
        var plain = document.Lines.Where(line => line.InstallmentCount is null).ToList();
        if (plain.Count == 0) return null;
        return plain
            .GroupBy(line => CardInvoiceRules.CycleFor(card.ClosingDay, card.DueDay, line.Date).Month, StringComparer.Ordinal)
            .OrderByDescending(group => group.Count()).ThenBy(group => group.Key, StringComparer.Ordinal)
            .Select(group => CardInvoiceRules.Cycle(card.ClosingDay, card.DueDay, group.Key))
            .First();
    }

    /// <summary>
    /// Data do gasto de uma linha parcelada. Alguns bancos repetem a data da compra original em toda parcela
    /// ("04/07" na parcela 3/3 cobrada agora); nesse caso o gasto é deslocado para o mês da parcela, que é quando ela
    /// pesa. Quando a data da linha já pertence ao ciclo do arquivo, ela já é a data da cobrança e fica como está.
    /// </summary>
    private static DateOnly InstallmentDate(StatementLine source, InvoiceCycle? fileCycle)
    {
        if (source.InstallmentNumber is not int number || source.InstallmentCount is null) return source.Date;
        if (fileCycle is InvoiceCycle cycle && cycle.Contains(source.Date)) return source.Date;
        return InstallmentRules.DateOf(source.Date, 1, number);
    }

    /// <summary>Descrição do lançamento com a parcela, no formato das faturas ("Notebook (3/10)").</summary>
    private static string Describe(StatementLine source) =>
        source.InstallmentNumber is int number && source.InstallmentCount is int count
            ? $"{BaseDescription(source.Description, count)} ({InstallmentRules.Label(number, count)})"
            : source.Description;

    private static string? Notes(StatementLine source, string? fileName, DateOnly date)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(fileName)) parts.Add($"Importado de {fileName.Trim()}");
        if (date != source.Date) parts.Add($"Compra em {source.Date.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)}");
        if (!string.IsNullOrWhiteSpace(source.CardHolder)) parts.Add($"Portador: {source.CardHolder}");
        var notes = string.Join(" · ", parts);
        return notes.Length == 0 ? null : notes.Length <= 500 ? notes : notes[..500];
    }

    /// <summary>
    /// Cartão da linha: pelos últimos 4 dígitos informados na fatura, senão pelo portador comparado ao nome do cartão
    /// e, sem nada disso, o cartão escolhido na importação (o usuário ajusta na tela de lançamentos).
    /// </summary>
    private static Card ResolveCard(StatementLine source, Card chosen, IReadOnlyList<Card> cards)
    {
        if (source.CardDigits is string digits && cards.FirstOrDefault(card => card.LastDigits == digits) is Card byDigits) return byDigits;
        if (!string.IsNullOrWhiteSpace(source.CardHolder))
        {
            var holder = StatementRules.Normalize(source.CardHolder);
            if (cards.FirstOrDefault(card => StatementRules.Normalize(card.Name) == holder) is Card byHolder) return byHolder;
        }
        return chosen;
    }

    /// <summary>Marca de origem da linha: o identificador do arquivo quando existe (OFX), senão data, descrição, valor e a repetição dentro do arquivo.</summary>
    private static string Fingerprint(ImportTarget target, StatementLine source, int occurrence)
    {
        var seed = source.ExternalId is string external
            ? $"v1|{target.Kind}|{target.Id}|id|{external}"
            : $"v1|{target.Kind}|{target.Id}|{source.Date:yyyy-MM-dd}|{StatementRules.Normalize(source.Description)}|{source.SignedAmountCents}|{occurrence}";
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(seed)))[..32];
    }

    /// <summary>Marca cada linha: já importada, pagamento de fatura, mês fechado, possível repetida ou nova.</summary>
    private IReadOnlyList<ImportLine> Classify(IReadOnlyList<(StatementLine Source, ImportLine Line)> drafts, ImportTarget target)
    {
        if (drafts.Count == 0) return [];
        var imported = store.FindImportedFingerprints(drafts.Select(draft => draft.Line.Fingerprint).ToList());
        var dates = drafts.Select(draft => draft.Line.Date).Order(StringComparer.Ordinal).ToList();
        // A janela cobre também os dias vizinhos, onde ficam as cobranças de assinatura lançadas pelo próprio app.
        var existing = store.ListTransactionsOf(target.Card?.Id, target.Account?.Id,
                Iso(ParseDate(dates[0]).AddDays(-DuplicateWindowDays)), Iso(ParseDate(dates[^1]).AddDays(DuplicateWindowDays)))
            .Select(item => new ExistingTransaction(item)).ToList();
        var closedMonths = new Dictionary<string, bool>(StringComparer.Ordinal);

        var lines = new List<ImportLine>(drafts.Count);
        foreach (var (source, line) in drafts)
        {
            var month = line.Date[..7];
            if (!closedMonths.TryGetValue(month, out var closed)) closedMonths[month] = closed = store.IsMonthClosed(month);

            if (imported.Contains(line.Fingerprint)) { lines.Add(line with { Status = ImportStatus.Imported }); continue; }
            if (closed) { lines.Add(line with { Status = ImportStatus.ClosedMonth }); continue; }
            if (target.Card is not null && line.Kind == "income" && StatementRules.IsInvoicePayment(source.Description))
            {
                lines.Add(line with { Status = ImportStatus.Payment });
                continue;
            }

            var match = MatchExisting(existing, line);
            if (match is null) { lines.Add(line with { Status = ImportStatus.New }); continue; }
            match.Used = true;
            lines.Add(line with { Status = ImportStatus.Duplicate, DuplicateOf = match.Item.Description, DuplicateDate = match.Item.Date });
        }
        return lines;
    }

    private sealed class ExistingTransaction(Transaction item)
    {
        public Transaction Item { get; } = item;
        public bool Used { get; set; }
    }

    /// <summary>Lançamento ainda não casado com o mesmo tipo e valor, na data da linha ou até poucos dias dela (o mais próximo).</summary>
    private ExistingTransaction? MatchExisting(IReadOnlyList<ExistingTransaction> existing, ImportLine line)
    {
        var day = ParseDate(line.Date).DayNumber;
        return existing
            .Where(candidate => !candidate.Used && candidate.Item.Kind == line.Kind && candidate.Item.AmountCents == line.AmountCents)
            .Select(candidate => (candidate, distance: Math.Abs(ParseDate(candidate.Item.Date).DayNumber - day)))
            .Where(pair => pair.distance <= DuplicateWindowDays)
            .OrderBy(pair => pair.distance)
            .Select(pair => pair.candidate)
            .FirstOrDefault();
    }

    private static ImportTotals Totals(IReadOnlyList<ImportLine> lines) => new(
        lines.Count,
        lines.Count(line => line.Status == ImportStatus.New),
        lines.Count(line => line.Status == ImportStatus.Duplicate),
        lines.Count(line => line.Status == ImportStatus.Imported),
        lines.Count(line => line.Status == ImportStatus.Payment),
        lines.Count(line => line.Status == ImportStatus.ClosedMonth),
        lines.Where(line => line.Status != ImportStatus.Imported && line.Kind != "income").Sum(line => line.AmountCents),
        lines.Where(line => line.Status != ImportStatus.Imported && line.Kind == "income").Sum(line => line.AmountCents));
}
