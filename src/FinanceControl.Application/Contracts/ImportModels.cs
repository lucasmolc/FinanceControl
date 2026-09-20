namespace FinanceControl.Application.Contracts;

/// <summary>
/// Pedido de importação de fatura ou extrato. O arquivo vai em base64 (o servidor descobre a codificação e o formato);
/// o destino é um cartão (fatura) ou uma conta bancária (extrato), nunca os dois.
/// </summary>
public sealed record ImportCommand(
    long? CardId,
    long? AccountId,
    string? FileName,
    string? ContentBase64,
    // Força a convenção de sinal do arquivo; sem valor vale o padrão do destino (fatura: positivo é despesa).
    bool? PositiveIsExpense,
    // Categoria aplicada a todas as linhas importadas; sem valor elas entram sem categoria, para categorizar em lote depois.
    long? CategoryId,
    // Linhas escolhidas na conferência (marcas de origem); só usado ao confirmar.
    IReadOnlyList<string>? Fingerprints);

/// <summary>Situação de uma linha lida do arquivo.</summary>
public static class ImportStatus
{
    // Ainda não existe: entra marcada.
    public const string New = "novo";
    // Já existe um lançamento de mesmo valor e destino por perto: entra desmarcada, para o usuário decidir.
    public const string Duplicate = "duplicado";
    // Esta mesma linha já foi importada antes: não entra de novo.
    public const string Imported = "importado";
    // Pagamento da fatura anterior: é registrado pela tela de faturas, não como lançamento.
    public const string Payment = "pagamento";
    // Cai em um mês fechado: só entra depois de reabrir o mês.
    public const string ClosedMonth = "mes_fechado";
}

/// <summary>Uma linha do arquivo já traduzida para lançamento, com o que o usuário precisa conferir antes de gravar.</summary>
public sealed record ImportLine(
    string Fingerprint,
    // Data do gasto (para parcelas, o mês da parcela, não o da compra original).
    string Date,
    string Description,
    string Kind,
    long AmountCents,
    string Currency,
    // Cartão identificado na fatura (portador ou últimos dígitos) ou o destino escolhido.
    long? CardId,
    string? CardName,
    long? AccountId,
    // Fatura em que a compra cai (AAAA-MM); null fora de cartão.
    string? InvoiceMonth,
    int? InstallmentNumber,
    int? InstallmentCount,
    // Data da compra original quando diferente da data do gasto (parcelas).
    string? PurchaseDate,
    string? Notes,
    string Status,
    // Lançamento já existente que esta linha parece repetir (cobrança de assinatura, por exemplo).
    string? DuplicateOf = null,
    string? DuplicateDate = null);

public sealed record ImportTotals(int Lines, int New, int Duplicate, int Imported, int Payment, int ClosedMonth, long ExpenseCents, long IncomeCents);

/// <summary>Conferência da importação: o que foi lido, para onde vai e o que já existe.</summary>
public sealed record ImportPreview(
    string Format,
    string TargetKind,
    long TargetId,
    string TargetName,
    string Currency,
    bool PositiveIsExpense,
    IReadOnlyList<ImportLine> Lines,
    ImportTotals Totals);

public sealed record ImportResult(int Created, int Skipped, IReadOnlyList<long> Ids);
