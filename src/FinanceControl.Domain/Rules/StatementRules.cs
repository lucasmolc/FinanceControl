using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace FinanceControl.Domain.Rules;

/// <summary>
/// Convenção de sinal do arquivo. Faturas de cartão em CSV trazem a compra positiva e o estorno negativo;
/// extratos e arquivos OFX/QIF seguem o padrão contrário (entrada positiva, saída negativa).
/// </summary>
public enum AmountConvention
{
    /// <summary>Valor positivo é saída (fatura de cartão em CSV).</summary>
    DebitPositive,
    /// <summary>Valor positivo é entrada (extrato, OFX e QIF).</summary>
    CreditPositive
}

/// <summary>Linha de fatura ou extrato já normalizada, antes de virar lançamento.</summary>
public sealed record StatementLine(DateOnly Date, string Description, long SignedAmountCents)
{
    /// <summary>Últimos 4 dígitos do cartão usado, quando o arquivo informa (fatura com cartões adicionais).</summary>
    public string? CardDigits { get; init; }
    /// <summary>Portador informado na fatura, quando o arquivo identifica o cartão pelo nome em vez dos dígitos.</summary>
    public string? CardHolder { get; init; }
    /// <summary>Parcela informada na descrição ("6/10"), só para exibição — a importação não cria as outras parcelas.</summary>
    public int? InstallmentNumber { get; init; }
    public int? InstallmentCount { get; init; }
    /// <summary>Identificador da transação no arquivo (FITID do OFX), quando existe.</summary>
    public string? ExternalId { get; init; }
}

/// <summary>Leitura de valores, datas e descrições de faturas e extratos, nos formatos usados pelos bancos brasileiros.</summary>
public static partial class StatementRules
{
    public const int MaxDescription = 160;

    /// <summary>Despesa quando o valor sai, receita quando entra, conforme a convenção do arquivo.</summary>
    public static string KindOf(long signedAmountCents, AmountConvention convention)
    {
        var outgoing = convention == AmountConvention.DebitPositive ? signedAmountCents > 0 : signedAmountCents < 0;
        return outgoing ? "expense" : "income";
    }

    /// <summary>Valor do lançamento (sempre positivo); o sentido vai em <see cref="KindOf"/>.</summary>
    public static long AmountOf(long signedAmountCents) => Math.Abs(signedAmountCents);

    /// <summary>
    /// Valor em unidades mínimas, com sinal. Aceita "1.234,56", "1,234.56", "1234.56", "R$ 1.234,56", "-12,90",
    /// "12,90-" e "(12,90)". Com um único separador seguido de exatamente 3 dígitos ele é de milhar ("1.234" = 1234,00).
    /// </summary>
    public static long? ParseAmountCents(string? text, int decimals = 2)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var raw = text.Trim();
        // O sinal pode vir antes do número ("R$ -5.195,80"), depois dele ("12,90-") ou por parênteses ("(12,90)").
        var firstDigit = raw.IndexOfAny("0123456789".ToCharArray());
        var negative = (firstDigit > 0 && raw[..firstDigit].Contains('-', StringComparison.Ordinal))
            || raw.StartsWith('-') || raw.EndsWith('-') || (raw.StartsWith('(') && raw.EndsWith(')'));
        var digits = new string(raw.Where(character => char.IsAsciiDigit(character) || character is '.' or ',').ToArray());
        if (digits.Length == 0 || !digits.Any(char.IsAsciiDigit)) return null;

        var lastDot = digits.LastIndexOf('.');
        var lastComma = digits.LastIndexOf(',');
        var separator = Math.Max(lastDot, lastComma);
        // Com os dois separadores, o último é o decimal. Com um só: repetido é milhar ("1.234.567") e, aparecendo uma
        // única vez, é milhar quando tem exatamente 3 dígitos à direita ("1.234") e decimal nos demais casos ("12,9").
        if (separator >= 0 && (lastDot < 0 || lastComma < 0))
        {
            var repeated = digits.IndexOf(digits[separator]) != separator;
            if (repeated || digits.Length - separator - 1 == 3) separator = -1;
        }

        var wholeText = separator < 0 ? digits : digits[..separator];
        var fractionText = separator < 0 ? "" : digits[(separator + 1)..];
        var whole = new string(wholeText.Where(char.IsAsciiDigit).ToArray());
        var fraction = new string(fractionText.Where(char.IsAsciiDigit).ToArray());
        if (whole.Length == 0) whole = "0";
        fraction = fraction.Length >= decimals ? fraction[..decimals] : fraction.PadRight(decimals, '0');

        try
        {
            var scale = (long)Math.Pow(10, decimals);
            var value = checked(long.Parse(whole, CultureInfo.InvariantCulture) * scale + (decimals == 0 ? 0 : long.Parse(fraction, CultureInfo.InvariantCulture)));
            return negative ? -value : value;
        }
        catch (Exception exception) when (exception is OverflowException or FormatException)
        {
            return null;
        }
    }

    private static readonly string[] DateFormats =
        ["yyyy-MM-dd", "dd/MM/yyyy", "dd/MM/yy", "dd-MM-yyyy", "dd-MM-yy", "dd.MM.yyyy", "yyyy/MM/dd", "yyyyMMdd"];

    /// <summary>Data nos formatos usados pelos bancos. Datas OFX ("20260917120000[-3:BRT]") usam os 8 primeiros dígitos.</summary>
    public static DateOnly? ParseDate(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var raw = text.Trim();
        if (raw.Length > 8 && raw.Take(8).All(char.IsAsciiDigit)) raw = raw[..8];
        return DateOnly.TryParseExact(raw, DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : null;
    }

    /// <summary>Descrição em uma linha, sem espaços repetidos e limitada ao tamanho aceito pelo lançamento.</summary>
    public static string CleanDescription(string? text)
    {
        var collapsed = Whitespace().Replace(text ?? "", " ").Trim();
        return collapsed.Length <= MaxDescription ? collapsed : collapsed[..MaxDescription].TrimEnd();
    }

    /// <summary>Últimos 4 dígitos de um campo de cartão ("•••• 1234", "XXXX-1234", "1234"); null quando não há 4 dígitos.</summary>
    public static string? CardDigits(string? text)
    {
        var digits = new string((text ?? "").Where(char.IsAsciiDigit).ToArray());
        return digits.Length >= 4 ? digits[^4..] : null;
    }

    /// <summary>
    /// Parcela informada na descrição ("… 6/10", "… parcela 6 de 10"), só no fim do texto ou depois de "parc" —
    /// assim uma data no meio da descrição não é confundida com parcela.
    /// </summary>
    public static (int Number, int Count)? Installment(string? description)
    {
        if (string.IsNullOrWhiteSpace(description)) return null;
        var match = InstallmentPattern().Match(description);
        if (!match.Success) return null;
        var number = int.Parse(match.Groups["n"].Value, CultureInfo.InvariantCulture);
        var count = int.Parse(match.Groups["t"].Value, CultureInfo.InvariantCulture);
        return InstallmentRules.IsValidCount(count) && InstallmentRules.IsValidNumber(number, count) ? (number, count) : null;
    }

    /// <summary>Texto comparável: minúsculo, sem acento e sem espaços repetidos.</summary>
    public static string Normalize(string? text)
    {
        var decomposed = (text ?? "").Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        foreach (var character in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
                builder.Append(character);
        return Whitespace().Replace(builder.ToString().Normalize(NormalizationForm.FormC), " ");
    }

    /// <summary>
    /// Linha de pagamento da fatura anterior, que toda fatura traz como crédito. No app o pagamento é registrado pela
    /// tela de faturas (sai da conta bancária), então importá-la como lançamento contaria o mesmo pagamento duas vezes.
    /// </summary>
    public static bool IsInvoicePayment(string? description)
    {
        var normalized = Normalize(description);
        return normalized.Contains("pagamento", StringComparison.Ordinal)
            || normalized.Contains("pagto", StringComparison.Ordinal)
            || normalized.Contains("pgto", StringComparison.Ordinal);
    }

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex Whitespace();

    [GeneratedRegex(@"(?:parc\w*\.?\s*)?\b(?<n>\d{1,2})\s*(?:/|\s+de\s+)\s*(?<t>\d{1,2})\b\s*$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex InstallmentPattern();
}
