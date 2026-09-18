using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Application.Validation;
using FinanceControl.Domain.Rules;

namespace FinanceControl.Application.UseCases;

/// <summary>Configurações (v1.2): preferências de interface, atualização automática do mercado, reserva de emergência e número da liberdade.</summary>
public sealed partial class FinanceService
{
    private const string UiPreferencesField = "ui_preferences";

    public OperationResult<bool> UpdateSettings(RecordData data)
    {
        // null em qualquer campo mantém o valor atual (compatível com a v1.1).
        var raw = data.Values.Where(item => item.Value is not null && item.Key != UiPreferencesField)
            .ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);
        var validated = InputValidator.Validate(ModuleSchemas.Settings, raw, ValidationMode.Update);
        if (!validated.IsSuccess) return validated.Failure<bool>();
        var input = validated.Value!;

        // Nome em branco é permitido (vira texto vazio), ao contrário dos demais textos.
        var displayName = data.Values.TryGetValue("display_name", out var name) && name is string text ? text.Trim() : null;
        var currency = input.Text("currency");
        if (currency is not null && !IsCurrency(currency)) return OperationResult<bool>.Invalid("currency", Messages.Currency);

        UiPreferences? preferences = null;
        if (data.Values.TryGetValue(UiPreferencesField, out var rawPreferences) && rawPreferences is not null)
        {
            var merged = MergePreferences(store.GetSettings().UiPreferences, rawPreferences);
            if (!merged.IsSuccess) return merged.Failure<bool>();
            preferences = merged.Value;
        }

        store.UpdateSettings(new SettingsCommand(
            input.Flag("setup_completed"),
            displayName,
            currency,
            input.Number("monthly_net_income_cents"),
            input.Number("monthly_spending_limit_cents"),
            input.Number("emergency_months_target") is long months ? (int)months : null,
            input.Flag("tour_completed"),
            input.Flag("market_auto_refresh"),
            input.Flag("emergency_goal_auto"),
            preferences,
            input.Number("freedom_multiplier") is long multiplier ? (int)multiplier : null,
            input.Flag("freedom_goal_auto")));
        return OperationResult<bool>.Success(true);
    }

    public OperationResult<long> EnsureEmergencyGoal()
    {
        var settings = store.GetSettings();
        if (ReserveRules.Target(settings.MonthlyNetIncomeCents, settings.EmergencyMonthsTarget) <= 0)
            return OperationResult<long>.Invalid("monthly_net_income_cents", Messages.ReserveIncomeRequired);
        return OperationResult<long>.Success(store.EnsureEmergencyGoal());
    }

    /// <summary>
    /// Mescla um objeto parcial de preferências nas atuais. Chave desconhecida → 400 <c>ui_preferences.&lt;chave&gt;</c> "Campo não permitido.";
    /// valor fora das opções → "Opção inválida."; tipo errado → "Valor inválido.".
    /// </summary>
    internal static OperationResult<UiPreferences> MergePreferences(UiPreferences current, object raw)
    {
        if (raw is not IReadOnlyDictionary<string, object?> values) return OperationResult<UiPreferences>.Invalid(UiPreferencesField, Messages.BodyObject);
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var result = current;
        foreach (var (key, value) in values)
        {
            var field = $"{UiPreferencesField}.{key}";
            if (!UiPreferenceRules.Keys.Contains(key)) { errors[field] = [Messages.NotAllowed]; continue; }
            switch (key)
            {
                case UiPreferenceRules.ThemeKey: result = Choice(value, UiPreferenceRules.Themes, field, errors) is string theme ? result with { Theme = theme } : result; break;
                case UiPreferenceRules.AccentKey: result = Choice(value, UiPreferenceRules.Accents, field, errors) is string accent ? result with { Accent = accent } : result; break;
                case UiPreferenceRules.DensityKey: result = Choice(value, UiPreferenceRules.Densities, field, errors) is string density ? result with { Density = density } : result; break;
                case UiPreferenceRules.AnimationsKey: result = Flag(value, field, errors) is bool animations ? result with { Animations = animations } : result; break;
                case UiPreferenceRules.HideValuesKey: result = Flag(value, field, errors) is bool hide ? result with { HideValues = hide } : result; break;
                case UiPreferenceRules.ShowMarketTickerKey: result = Flag(value, field, errors) is bool ticker ? result with { ShowMarketTicker = ticker } : result; break;
                case UiPreferenceRules.DashboardWidgetsKey: result = Widgets(value, field, errors) is { } widgets ? result with { DashboardWidgets = widgets } : result; break;
            }
        }
        return errors.Count > 0 ? OperationResult<UiPreferences>.Invalid(errors) : OperationResult<UiPreferences>.Success(result);
    }

    private static string? Choice(object? value, IReadOnlySet<string> options, string field, Dictionary<string, string[]> errors)
    {
        if (value is not string text) { errors[field] = [Messages.InvalidValue]; return null; }
        if (!options.Contains(text.Trim())) { errors[field] = [Messages.InvalidOption]; return null; }
        return text.Trim();
    }

    private static bool? Flag(object? value, string field, Dictionary<string, string[]> errors)
    {
        if (value is bool flag) return flag;
        errors[field] = [Messages.InvalidValue];
        return null;
    }

    /// <summary>Lista ordenada, sem repetições, de ids conhecidos (pode ser vazia).</summary>
    private static IReadOnlyList<string>? Widgets(object? value, string field, Dictionary<string, string[]> errors)
    {
        if (value is not IReadOnlyList<object?> items || items.Any(item => item is not string)) { errors[field] = [Messages.InvalidValue]; return null; }
        var widgets = items.Cast<string>().Select(item => item.Trim()).ToList();
        if (widgets.Any(item => !UiPreferenceRules.Widgets.Contains(item, StringComparer.Ordinal)) || widgets.Distinct(StringComparer.Ordinal).Count() != widgets.Count)
        {
            errors[field] = [Messages.InvalidOption];
            return null;
        }
        return widgets;
    }
}
