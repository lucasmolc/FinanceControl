import type { AccentId, DensityId, ThemeId, UiPreferences } from "../types";

// Appearance preferences (MEL-30): defaults, validation, <html> data attributes and the localStorage cache
// that main.tsx applies before the first render (no flash of the wrong theme).

export const THEMES: readonly ThemeId[] = ["noite", "esmeralda", "ouro", "grafite", "claro", "sistema"];
export const ACCENTS: readonly AccentId[] = ["indigo", "esmeralda", "ouro", "violeta", "ciano", "rosa"];
export const DENSITIES: readonly DensityId[] = ["confortavel", "compacto"];

export const themeLabels: Record<ThemeId, string> = { noite: "Noite", esmeralda: "Esmeralda", ouro: "Ouro", grafite: "Grafite", claro: "Claro", sistema: "Sistema" };
export const accentLabels: Record<AccentId, string> = { indigo: "Índigo", esmeralda: "Esmeralda", ouro: "Ouro", violeta: "Violeta", ciano: "Ciano", rosa: "Rosa" };
export const densityLabels: Record<DensityId, string> = { confortavel: "Confortável", compacto: "Compacto" };

/** Dashboard widget ids (spec §5 + MEL-38 §9), in default order. */
export const DASHBOARD_WIDGETS = ["saldo", "fluxo", "contas", "categorias", "metas", "mercado", "assinaturas", "patrimonio", "maiores_gastos", "ritmo", "orcamento", "pagamentos", "plano"] as const;
export type DashboardWidgetId = typeof DASHBOARD_WIDGETS[number];

export const dashboardWidgetLabels: Record<DashboardWidgetId, string> = {
  saldo: "Patrimônio em destaque", fluxo: "Fluxo de 6 meses", contas: "Próximos vencimentos", categorias: "Gastos por categoria",
  metas: "Metas", mercado: "Cotações", assinaturas: "Assinaturas", patrimonio: "Evolução do patrimônio",
  maiores_gastos: "Maiores gastos", ritmo: "Gasto acumulado × teto", orcamento: "Orçamento por categoria", pagamentos: "Formas de pagamento", plano: "Plano 70-20-10",
};

/**
 * CR-13: default dashboard — one answer per question, no repeated numbers. The hero carries the patrimônio (its
 * sparkline replaces "Evolução do patrimônio"), the ticker carries the rates ("Cotações" off), and the long tail
 * (assinaturas, maiores gastos, formas de pagamento) stays one click away in "Personalizar painel".
 */
export const DEFAULT_DASHBOARD_WIDGETS: readonly DashboardWidgetId[] = ["saldo", "contas", "fluxo", "ritmo", "categorias", "orcamento", "metas", "plano"];

export const DEFAULT_PREFERENCES: UiPreferences = {
  theme: "noite", accent: "esmeralda", density: "confortavel", animations: true, hide_values: false, show_market_ticker: true,
  dashboard_widgets: [...DEFAULT_DASHBOARD_WIDGETS],
};

export const PREFERENCES_CACHE_KEY = "lmm-ui";

const pick = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback;

/** Fills defaults and drops invalid values (unknown widget ids are kept: the server is the authority on them). */
export function normalizePreferences(input: unknown): UiPreferences {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input as Partial<Record<keyof UiPreferences, unknown>> : {};
  const widgets = Array.isArray(source.dashboard_widgets)
    ? Array.from(new Set(source.dashboard_widgets.filter((item): item is string => typeof item === "string" && item.trim() !== "")))
    : [...DEFAULT_PREFERENCES.dashboard_widgets];
  return {
    theme: pick(THEMES, source.theme, DEFAULT_PREFERENCES.theme),
    accent: pick(ACCENTS, source.accent, DEFAULT_PREFERENCES.accent),
    density: pick(DENSITIES, source.density, DEFAULT_PREFERENCES.density),
    animations: typeof source.animations === "boolean" ? source.animations : DEFAULT_PREFERENCES.animations,
    hide_values: typeof source.hide_values === "boolean" ? source.hide_values : DEFAULT_PREFERENCES.hide_values,
    show_market_ticker: typeof source.show_market_ticker === "boolean" ? source.show_market_ticker : DEFAULT_PREFERENCES.show_market_ticker,
    dashboard_widgets: widgets,
  };
}

export const samePreferences = (left: UiPreferences, right: UiPreferences): boolean => JSON.stringify(left) === JSON.stringify(right);

const matches = (query: string): boolean => {
  try { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches; }
  catch { return false; }
};

/** "sistema" follows prefers-color-scheme (claro/noite); other themes are used as is. */
const resolveTheme = (theme: ThemeId): Exclude<ThemeId, "sistema"> =>
  theme === "sistema" ? (matches("(prefers-color-scheme: light)") ? "claro" : "noite") : theme;

export const prefersReducedMotion = (): boolean => matches("(prefers-reduced-motion: reduce)");

/** True when animations should run: preference on and the OS does not ask for reduced motion. */
export const motionAllowed = (preferences: Pick<UiPreferences, "animations">): boolean => preferences.animations && !prefersReducedMotion();

/**
 * Applies the preferences on <html>: data-theme (the choice; CSS resolves "sistema" with prefers-color-scheme),
 * data-theme-resolved (claro/noite/… for scripts), data-accent, data-density, data-motion="on|off",
 * data-hide-values="true|false".
 */
export function applyPreferences(preferences: UiPreferences, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = preferences.theme;
  root.dataset.themeResolved = resolveTheme(preferences.theme);
  root.dataset.accent = preferences.accent;
  root.dataset.density = preferences.density;
  root.dataset.motion = preferences.animations ? "on" : "off";
  root.dataset.hideValues = preferences.hide_values ? "true" : "false";
}

export function readCachedPreferences(): UiPreferences | null {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_CACHE_KEY);
    return raw ? normalizePreferences(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeCachedPreferences(preferences: UiPreferences): void {
  try { window.localStorage.setItem(PREFERENCES_CACHE_KEY, JSON.stringify(preferences)); } catch { /* storage unavailable: ignore */ }
}

/** main.tsx: applies the last known preferences before the first render (defaults when there is no cache). */
export function applyCachedPreferences(): UiPreferences {
  const preferences = readCachedPreferences() ?? DEFAULT_PREFERENCES;
  try { applyPreferences(preferences); } catch { /* no document: ignore */ }
  return preferences;
}
