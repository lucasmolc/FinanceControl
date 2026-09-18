namespace FinanceControl.Domain.Rules;

/// <summary>Preferências de interface guardadas em <c>settings.ui_preferences</c> (JSON), sempre com os padrões preenchidos.</summary>
public sealed record UiPreferences(
    string Theme,
    string Accent,
    string Density,
    bool Animations,
    bool HideValues,
    bool ShowMarketTicker,
    IReadOnlyList<string> DashboardWidgets);

/// <summary>Valores aceitos e padrões das preferências de interface.</summary>
public static class UiPreferenceRules
{
    public const string ThemeKey = "theme";
    public const string AccentKey = "accent";
    public const string DensityKey = "density";
    public const string AnimationsKey = "animations";
    public const string HideValuesKey = "hide_values";
    public const string ShowMarketTickerKey = "show_market_ticker";
    public const string DashboardWidgetsKey = "dashboard_widgets";

    public static readonly IReadOnlySet<string> Keys = Set(ThemeKey, AccentKey, DensityKey, AnimationsKey, HideValuesKey, ShowMarketTickerKey, DashboardWidgetsKey);
    public static readonly IReadOnlySet<string> Themes = Set("noite", "esmeralda", "ouro", "grafite", "claro", "sistema");
    public static readonly IReadOnlySet<string> Accents = Set("indigo", "esmeralda", "ouro", "violeta", "ciano", "rosa");
    public static readonly IReadOnlySet<string> Densities = Set("confortavel", "compacto");

    /// <summary>Widgets aceitos no painel: os da v1.2 (§5), os gráficos da Visão geral (§9, MEL-38) e o plano 70-20-10 (MEL-45).</summary>
    public static readonly IReadOnlyList<string> Widgets =
        ["saldo", "fluxo", "contas", "categorias", "metas", "mercado", "assinaturas", "patrimonio", "maiores_gastos", "ritmo", "orcamento", "pagamentos", "plano"];

    /// <summary>Painel padrão (CR-13, igual a <c>DEFAULT_DASHBOARD_WIDGETS</c> do frontend): os demais ficam em "Personalizar painel".</summary>
    public static readonly IReadOnlyList<string> DefaultWidgets = ["saldo", "contas", "fluxo", "ritmo", "categorias", "orcamento", "metas", "plano"];

    public static readonly UiPreferences Default = new("noite", "esmeralda", "confortavel", true, false, true, DefaultWidgets);

    private static HashSet<string> Set(params string[] values) => new(values, StringComparer.Ordinal);
}
