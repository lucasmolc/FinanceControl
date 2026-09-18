using System.Globalization;
using System.Text.RegularExpressions;
using FinanceControl.Application.Common;

namespace FinanceControl.Application.Validation;

public static partial class InputValidator
{
    [GeneratedRegex("^[a-z0-9_-]{1,40}$", RegexOptions.CultureInvariant)]
    private static partial Regex IdentifierPattern();

    [GeneratedRegex("^#[0-9a-fA-F]{6}$", RegexOptions.CultureInvariant)]
    private static partial Regex ColorPattern();

    [GeneratedRegex(@"^data:image/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$", RegexOptions.CultureInvariant)]
    private static partial Regex LogoPattern();

    public const int MaxLogoLength = 200_000;

    public static OperationResult<ValidatedInput> Validate(InputSchema schema, IReadOnlyDictionary<string, object?> raw, ValidationMode mode)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var values = new Dictionary<string, object?>(StringComparer.Ordinal);
        var references = new List<ReferenceCheck>();

        foreach (var (key, input) in raw)
        {
            if (!schema.TryGet(key, out var field))
            {
                if (schema.RejectUnknownFields) errors[key] = [Messages.NotAllowed];
                continue;
            }

            var (value, error) = input is null ? (null, null) : Normalize(field, input);
            if (error is not null) { errors[key] = [error]; continue; }
            if (value is null)
            {
                if (field.Required || mode == ValidationMode.Update && !field.Nullable) errors[key] = [Messages.Required];
                else if (field.Nullable) values[key] = null;
                continue;
            }

            values[key] = value;
            if (field.Type == FieldType.Reference && value is long id) references.Add(new ReferenceCheck(key, field.Target!.Value, id));
        }

        if (mode == ValidationMode.Create)
            foreach (var field in schema.Fields.Where(field => field.Required))
                if (!values.ContainsKey(field.Name)) errors.TryAdd(field.Name, [Messages.Required]);

        return errors.Count > 0
            ? OperationResult<ValidatedInput>.Invalid(errors)
            : OperationResult<ValidatedInput>.Success(new ValidatedInput(values, references));
    }

    public static string ReferenceMessage(ReferenceTarget target) => target switch
    {
        ReferenceTarget.Category => Messages.CategoryNotFound,
        ReferenceTarget.Card => Messages.CardNotFound,
        ReferenceTarget.ActiveCard => Messages.ActiveCardNotFound,
        _ => Messages.AccountNotFound
    };

    public static bool IsIsoDate(string? value) => value is { Length: 10 } && DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    public static bool IsMonth(string? value) => value is { Length: 7 } && DateOnly.TryParseExact($"{value}-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private static (object? Value, string? Error) Normalize(FieldSpec field, object input) => field.Type switch
    {
        FieldType.Text => input is string text ? NormalizeText(field, text) : (null, Messages.InvalidValue),
        FieldType.Integer => input is long number
            ? number < field.Min || number > field.Max ? (null, field.RangeMessage ?? Messages.InvalidValue) : (number, null)
            : (null, Messages.InvalidValue),
        FieldType.Money => input is long cents ? NormalizeMoney(field.Money, cents) : (null, Messages.InvalidValue),
        FieldType.Date => NormalizePattern(input, IsIsoDate, Messages.Date),
        FieldType.Month => NormalizePattern(input, IsMonth, Messages.Month),
        FieldType.Boolean => input switch
        {
            bool flag => (flag ? 1L : 0L, null),
            long number and (0 or 1) => (number, null),
            _ => (null, Messages.InvalidValue)
        },
        FieldType.Choice => NormalizePattern(input, value => field.Options!.Contains(value), Messages.InvalidOption),
        FieldType.Reference => input is long id ? id > 0 ? (id, null) : (null, ReferenceMessage(field.Target!.Value)) : (null, Messages.InvalidValue),
        FieldType.Currency => NormalizeCurrency(input),
        FieldType.Identifier => NormalizePattern(input, value => IdentifierPattern().IsMatch(value), Messages.Identifier40),
        FieldType.Color => NormalizePattern(input, value => ColorPattern().IsMatch(value), Messages.Color),
        FieldType.LogoData => input is string logo
            ? logo.Trim().Length == 0 ? (null, null) : logo.Trim().Length <= MaxLogoLength && LogoPattern().IsMatch(logo.Trim()) ? (logo.Trim(), null) : (null, Messages.LogoData)
            : (null, Messages.LogoData),
        FieldType.Decimal => NormalizeDecimal(input),
        _ => (null, Messages.InvalidValue)
    };

    /// <summary>Código do catálogo de moedas; formato inválido mantém a mensagem de formato, código desconhecido informa que não é suportado.</summary>
    private static (object? Value, string? Error) NormalizeCurrency(object input)
    {
        if (input is not string text) return (null, Messages.InvalidValue);
        var trimmed = text.Trim();
        if (trimmed.Length == 0) return (null, null);
        if (Domain.Rules.Currencies.IsSupported(trimmed)) return (trimmed, null);
        return trimmed.Length is 3 or 4 && trimmed.All(character => character is >= 'A' and <= 'Z') ? (null, Messages.CurrencyUnsupported) : (null, Messages.Currency);
    }

    private static (object? Value, string? Error) NormalizeDecimal(object input)
    {
        decimal? value = input switch
        {
            long number => number,
            double number when double.IsFinite(number) && Math.Abs(number) < 1e15 => (decimal)number,
            string text => Domain.Rules.CurrencyRules.ParseRate(text) ?? (string.IsNullOrWhiteSpace(text) ? null : -1m),
            _ => -1m
        };
        if (value is null) return (null, null);
        return value > 0 ? (Domain.Rules.CurrencyRules.FormatRate(value.Value), null) : (null, Messages.ExchangeRate);
    }

    private static (object? Value, string? Error) NormalizeText(FieldSpec field, string text)
    {
        var trimmed = text.Trim();
        if (trimmed.Length == 0) return (null, null);
        return field.MaxLength is int max && trimmed.Length > max ? (null, Messages.MaxLength(max)) : (trimmed, null);
    }

    private static (object? Value, string? Error) NormalizeMoney(MoneyRule rule, long cents) => rule switch
    {
        MoneyRule.Positive when cents <= 0 => (null, Messages.Positive),
        MoneyRule.NonNegative when cents < 0 => (null, Messages.NonNegative),
        _ => (cents, null)
    };

    private static (object? Value, string? Error) NormalizePattern(object input, Func<string, bool> isValid, string message)
    {
        if (input is not string text) return (null, Messages.InvalidValue);
        var trimmed = text.Trim();
        if (trimmed.Length == 0) return (null, null);
        return isValid(trimmed) ? (trimmed, null) : (null, message);
    }
}
