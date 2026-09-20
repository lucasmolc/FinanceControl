namespace FinanceControl.Application.Validation;

public enum FieldType { Text, Integer, Money, Date, Month, Boolean, Choice, Reference, Currency, Identifier, Color, LogoData, Decimal, Digits }
public enum MoneyRule { Any, NonNegative, Positive }
public enum ReferenceTarget { Category, Card, ActiveBankAccount, ActiveCard }
public enum ValidationMode { Create, Update }

/// <summary>Definição de um campo aceito pela API: tipo, obrigatoriedade, limites e valores permitidos.</summary>
public sealed record FieldSpec(string Name, FieldType Type)
{
    public bool Required { get; init; }
    /// <summary>Quando falso, null é ignorado na criação (vale o padrão do banco) e rejeitado na atualização.</summary>
    public bool Nullable { get; init; } = true;
    public int? MaxLength { get; init; }
    public MoneyRule Money { get; init; }
    public long Min { get; init; } = long.MinValue;
    public long Max { get; init; } = long.MaxValue;
    public string? RangeMessage { get; init; }
    public IReadOnlySet<string>? Options { get; init; }
    public ReferenceTarget? Target { get; init; }
}

public sealed class InputSchema
{
    private readonly Dictionary<string, FieldSpec> _byName;

    public InputSchema(string name, bool rejectUnknownFields, params FieldSpec[] fields)
    {
        Name = name;
        RejectUnknownFields = rejectUnknownFields;
        Fields = fields;
        _byName = fields.ToDictionary(field => field.Name, StringComparer.Ordinal);
    }

    public string Name { get; }
    public bool RejectUnknownFields { get; }
    public IReadOnlyList<FieldSpec> Fields { get; }
    public IEnumerable<string> FieldNames => Fields.Select(spec => spec.Name);
    public bool TryGet(string name, out FieldSpec field) => _byName.TryGetValue(name, out field!);
}

/// <summary>Fábricas curtas para declarar esquemas.</summary>
public static class Field
{
    public static FieldSpec Text(string name, int maxLength, bool required = false) => new(name, FieldType.Text) { Required = required, Nullable = !required, MaxLength = maxLength };
    public static FieldSpec Money(string name, MoneyRule rule, bool required = false) => new(name, FieldType.Money) { Required = required, Nullable = false, Money = rule };
    public static FieldSpec Day(string name) => new(name, FieldType.Integer) { Nullable = false, Min = 1, Max = 31, RangeMessage = Common.Messages.DayRange };
    public static FieldSpec Integer(string name, long min, long max, string rangeMessage, bool required = false) => new(name, FieldType.Integer) { Required = required, Nullable = false, Min = min, Max = max, RangeMessage = rangeMessage };
    public static FieldSpec Date(string name, bool required = false) => new(name, FieldType.Date) { Required = required, Nullable = !required };
    public static FieldSpec Month(string name, bool required = false) => new(name, FieldType.Month) { Required = required, Nullable = !required };
    public static FieldSpec Flag(string name, bool required = false) => new(name, FieldType.Boolean) { Required = required, Nullable = false };
    public static FieldSpec Choice(string name, IReadOnlySet<string> options, bool required = false) => new(name, FieldType.Choice) { Required = required, Nullable = false, Options = options };
    public static FieldSpec Reference(string name, ReferenceTarget target, bool required = false) => new(name, FieldType.Reference) { Required = required, Nullable = !required, Target = target };
    public static FieldSpec Currency(string name) => new(name, FieldType.Currency) { Nullable = false };
    /// <summary>Identificador de catálogo do frontend (marca, ícone): <c>^[a-z0-9_-]{1,40}$</c>; vazio ou null limpa.</summary>
    public static FieldSpec Identifier(string name) => new(name, FieldType.Identifier);
    /// <summary>Cor <c>#rrggbb</c>; vazio ou null limpa.</summary>
    public static FieldSpec Color(string name) => new(name, FieldType.Color);
    /// <summary>Data URL de imagem (png, jpeg, webp, svg+xml) em base64 com até 200 000 caracteres; null limpa.</summary>
    public static FieldSpec LogoData(string name) => new(name, FieldType.LogoData);
    /// <summary>Número decimal positivo (texto com ponto/vírgula ou número JSON), normalizado como texto.</summary>
    public static FieldSpec Decimal(string name, bool required = false) => new(name, FieldType.Decimal) { Required = required, Nullable = !required };
    /// <summary>Exatamente <paramref name="length"/> dígitos (os últimos do cartão); vazio ou null limpa.</summary>
    public static FieldSpec Digits(string name, int length, string message) => new(name, FieldType.Digits) { MaxLength = length, RangeMessage = message };
}

public sealed record ReferenceCheck(string Field, ReferenceTarget Target, long Id);

/// <summary>Valores normalizados (strings aparadas, booleanos como 0/1) e as referências que precisam existir no banco.</summary>
public sealed record ValidatedInput(IReadOnlyDictionary<string, object?> Values, IReadOnlyList<ReferenceCheck> References)
{
    public bool Has(string field) => Values.ContainsKey(field);
    public string? Text(string field) => Values.TryGetValue(field, out var value) ? value as string : null;
    public long? Number(string field) => Values.TryGetValue(field, out var value) && value is long number ? number : null;
    public bool? Flag(string field) => Number(field) is long number ? number == 1 : null;
}
