using System.Text.Json;

namespace FinanceControl.Api.Adapters.Http;

/// <summary>Converte JSON em valores neutros (string, long, double, bool, null, listas e objetos) para a camada de aplicação.</summary>
internal static class JsonInput
{
    /// <summary>Falha quando o texto não é UTF-8 válido (System.Text.Json só valida strings ao lê-las).</summary>
    public static bool TryConvert(JsonElement element, out object? value)
    {
        try
        {
            value = ToValue(element);
            return true;
        }
        catch (InvalidOperationException)
        {
            value = null;
            return false;
        }
    }

    private static object? ToValue(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.Object => element.EnumerateObject().Aggregate(
            new Dictionary<string, object?>(StringComparer.Ordinal),
            (values, property) => { values[property.Name] = ToValue(property.Value); return values; }),
        JsonValueKind.Array => element.EnumerateArray().Select(ToValue).ToList(),
        JsonValueKind.String => element.GetString(),
        JsonValueKind.Number => element.TryGetInt64(out var number) ? number : (object)element.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        _ => null
    };
}
