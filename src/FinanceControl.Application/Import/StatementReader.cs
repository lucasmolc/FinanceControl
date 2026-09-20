using System.Text;
using System.Text.RegularExpressions;
using FinanceControl.Application.Common;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.Import;

/// <summary>Arquivo lido: as linhas normalizadas, o formato reconhecido e a convenção de sinal usada.</summary>
public sealed record StatementDocument(IReadOnlyList<StatementLine> Lines, string Format, AmountConvention Convention);

/// <summary>
/// Leitura de faturas e extratos nos formatos que os bancos exportam: CSV/TXT (qualquer separador, cabeçalho
/// reconhecido por apelidos), OFX (SGML e XML) e QIF. Tudo aqui é determinístico e sem E/S: o arquivo chega em bytes
/// e sai como linhas prontas para virar lançamento.
/// </summary>
public static partial class StatementReader
{
    public const string Csv = "csv";
    public const string Ofx = "ofx";
    public const string Qif = "qif";

    /// <summary>Colunas de CSV reconhecidas, por apelido normalizado (minúsculo e sem acento).</summary>
    private static readonly (string Field, string[] Aliases)[] CsvColumns =
    [
        ("date", ["data", "data da compra", "data compra", "data do lancamento", "data de lancamento", "data lancamento", "data da transacao", "data transacao", "data mov", "data movimento", "dt", "date", "posted date", "transaction date"]),
        ("description", ["estabelecimento", "descricao", "descricao da transacao", "historico", "lancamento", "detalhe", "detalhes", "titulo", "title", "description", "memo", "payee", "nome"]),
        ("amount", ["valor", "valor r$", "valor (r$)", "valor em r$", "valor brl", "valor da compra", "valor do lancamento", "montante", "quantia", "amount", "value", "debito/credito"]),
        ("card", ["portador", "titular", "cartao", "cartao final", "final do cartao", "final", "numero do cartao", "card", "card holder", "cardholder"]),
        ("installment", ["parcela", "parcelas", "installment", "parcelamento"]),
    ];

    /// <summary>Texto do arquivo: UTF-8 quando válido (BOM removido) e ISO-8859-1 caso contrário, como exportam vários bancos.</summary>
    public static string Decode(byte[] content)
    {
        try
        {
            return new UTF8Encoding(false, throwOnInvalidBytes: true).GetString(content).TrimStart('﻿');
        }
        catch (DecoderFallbackException)
        {
            return Encoding.Latin1.GetString(content);
        }
    }

    /// <summary>
    /// Lê o arquivo no formato reconhecido pelo conteúdo. <paramref name="preferred"/> força a convenção de sinal
    /// (uma fatura em CSV traz a compra positiva; extratos, OFX e QIF trazem a saída negativa).
    /// </summary>
    public static OperationResult<StatementDocument> Read(byte[] content, AmountConvention preferred, int decimals = 2)
    {
        var text = Decode(content);
        if (string.IsNullOrWhiteSpace(text)) return OperationResult<StatementDocument>.Invalid("file", Messages.ImportEmpty);

        if (text.Contains("<OFX", StringComparison.OrdinalIgnoreCase) || text.Contains("OFXHEADER", StringComparison.OrdinalIgnoreCase))
            return Document(ReadOfx(text), Ofx, AmountConvention.CreditPositive);
        if (FirstMeaningfulLine(text).StartsWith('!'))
            return Document(ReadQif(text, decimals), Qif, AmountConvention.CreditPositive);
        return Document(ReadCsv(text, decimals), Csv, preferred);
    }

    private static OperationResult<StatementDocument> Document(IReadOnlyList<StatementLine> lines, string format, AmountConvention convention) =>
        lines.Count == 0
            ? OperationResult<StatementDocument>.Invalid("file", Messages.ImportNoLines)
            : OperationResult<StatementDocument>.Success(new StatementDocument(lines, format, convention));

    private static string FirstMeaningfulLine(string text) =>
        text.Split('\n').Select(line => line.Trim()).FirstOrDefault(line => line.Length > 0) ?? "";

    // ---------- CSV ----------

    private static IReadOnlyList<StatementLine> ReadCsv(string text, int decimals)
    {
        var rows = SplitRows(text);
        if (rows.Count < 2) return [];
        var delimiter = Delimiter(rows[0]);
        var header = SplitFields(rows[0], delimiter).Select(StatementRules.Normalize).ToList();
        var columns = MapColumns(header);
        if (!columns.TryGetValue("date", out var dateAt) || !columns.TryGetValue("amount", out var amountAt)) return [];

        var lines = new List<StatementLine>();
        foreach (var row in rows.Skip(1))
        {
            var fields = SplitFields(row, delimiter);
            if (fields.Count <= Math.Max(dateAt, amountAt)) continue;
            if (StatementRules.ParseDate(fields[dateAt]) is not DateOnly date) continue;
            if (StatementRules.ParseAmountCents(fields[amountAt], decimals) is not long amount) continue;

            var description = StatementRules.CleanDescription(Field(fields, columns, "description"));
            var installment = StatementRules.Installment(Field(fields, columns, "installment")) ?? StatementRules.Installment(description);
            lines.Add(new StatementLine(date, description.Length > 0 ? description : Messages.ImportNoDescription, amount)
            {
                CardDigits = StatementRules.CardDigits(Field(fields, columns, "card")),
                CardHolder = StatementRules.CleanDescription(Field(fields, columns, "card")),
                InstallmentNumber = installment?.Number,
                InstallmentCount = installment?.Count,
            });
        }
        return lines;
    }

    private static string? Field(IReadOnlyList<string> fields, IReadOnlyDictionary<string, int> columns, string name) =>
        columns.TryGetValue(name, out var index) && index < fields.Count ? fields[index] : null;

    private static Dictionary<string, int> MapColumns(List<string> header)
    {
        var map = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var (field, aliases) in CsvColumns)
        {
            var index = header.FindIndex(name => aliases.Contains(name, StringComparer.Ordinal));
            // Sem nome exato, aceita o cabeçalho que começa com um dos apelidos ("valor em us$", "data da compra 1").
            if (index < 0) index = header.FindIndex(name => name.Length > 0 && aliases.Any(alias => name.StartsWith(alias, StringComparison.Ordinal)));
            if (index >= 0) map[field] = index;
        }
        return map;
    }

    /// <summary>Separador do arquivo: o candidato mais frequente fora de aspas no cabeçalho.</summary>
    private static char Delimiter(string header)
    {
        char[] candidates = [';', '\t', ',', '|'];
        return candidates.MaxBy(candidate => SplitFields(header, candidate).Count);
    }

    /// <summary>Linhas do arquivo, mantendo juntas as que estão dentro de aspas.</summary>
    private static List<string> SplitRows(string text)
    {
        var rows = new List<string>();
        var current = new StringBuilder();
        var quoted = false;
        foreach (var character in text.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n'))
        {
            if (character == '"') quoted = !quoted;
            if (character == '\n' && !quoted)
            {
                if (current.Length > 0) rows.Add(current.ToString());
                current.Clear();
                continue;
            }
            current.Append(character);
        }
        if (current.Length > 0) rows.Add(current.ToString());
        return rows.Where(row => row.Trim().Length > 0).ToList();
    }

    private static List<string> SplitFields(string row, char delimiter)
    {
        var fields = new List<string>();
        var current = new StringBuilder();
        var quoted = false;
        for (var index = 0; index < row.Length; index++)
        {
            var character = row[index];
            if (character == '"')
            {
                if (quoted && index + 1 < row.Length && row[index + 1] == '"') { current.Append('"'); index++; }
                else quoted = !quoted;
                continue;
            }
            if (character == delimiter && !quoted) { fields.Add(current.ToString().Trim()); current.Clear(); continue; }
            current.Append(character);
        }
        fields.Add(current.ToString().Trim());
        return fields;
    }

    // ---------- OFX ----------

    private static IReadOnlyList<StatementLine> ReadOfx(string text)
    {
        var lines = new List<StatementLine>();
        foreach (Match block in TransactionBlock().Matches(text))
        {
            var body = block.Groups["body"].Value;
            if (StatementRules.ParseDate(Tag(body, "DTPOSTED") ?? Tag(body, "DTUSER")) is not DateOnly date) continue;
            if (StatementRules.ParseAmountCents(Tag(body, "TRNAMT")) is not long amount) continue;
            var description = StatementRules.CleanDescription(Tag(body, "MEMO") ?? Tag(body, "NAME"));
            var installment = StatementRules.Installment(description);
            lines.Add(new StatementLine(date, description.Length > 0 ? description : Messages.ImportNoDescription, amount)
            {
                ExternalId = Tag(body, "FITID"),
                InstallmentNumber = installment?.Number,
                InstallmentCount = installment?.Count,
            });
        }
        return lines;
    }

    /// <summary>Valor de uma etiqueta OFX: vale para SGML (sem fechamento) e para XML.</summary>
    private static string? Tag(string body, string name)
    {
        var match = Regex.Match(body, $"<{name}>(?<value>[^<]*)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
        var value = match.Success ? match.Groups["value"].Value.Trim() : "";
        return value.Length > 0 ? value : null;
    }

    // ---------- QIF ----------

    private static IReadOnlyList<StatementLine> ReadQif(string text, int decimals)
    {
        var lines = new List<StatementLine>();
        DateOnly? date = null;
        long? amount = null;
        string? payee = null, memo = null;

        foreach (var raw in text.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n').Select(line => line.Trim()))
        {
            if (raw.Length == 0 || raw.StartsWith('!')) continue;
            if (raw == "^")
            {
                Flush();
                continue;
            }
            var value = raw[1..].Trim();
            switch (raw[0])
            {
                case 'D': date = StatementRules.ParseDate(value.Replace('\'', '/')); break;
                case 'T' or 'U': amount ??= StatementRules.ParseAmountCents(value, decimals); break;
                case 'P': payee = value; break;
                case 'M': memo = value; break;
                default: break;
            }
        }
        Flush();
        return lines;

        void Flush()
        {
            if (date is DateOnly day && amount is long cents)
            {
                var description = StatementRules.CleanDescription(payee ?? memo);
                var installment = StatementRules.Installment(description);
                lines.Add(new StatementLine(day, description.Length > 0 ? description : Messages.ImportNoDescription, cents)
                {
                    InstallmentNumber = installment?.Number,
                    InstallmentCount = installment?.Count,
                });
            }
            date = null; amount = null; payee = null; memo = null;
        }
    }

    [GeneratedRegex(@"<STMTTRN>(?<body>.*?)</STMTTRN>", RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.CultureInvariant)]
    private static partial Regex TransactionBlock();
}
