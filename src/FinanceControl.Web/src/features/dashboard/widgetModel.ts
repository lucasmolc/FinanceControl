import { DASHBOARD_WIDGETS, DEFAULT_DASHBOARD_WIDGETS, dashboardWidgetLabels, type DashboardWidgetId } from "../../lib/preferences";

// Dashboard widgets (MEL-30/MEL-38): `ui_preferences.dashboard_widgets` is the ordered list of VISIBLE widget ids.
// Ids missing from the list are hidden; unknown ids are kept (the server is the authority) but never rendered.

export type WidgetSpan = "full" | "2" | "1";

export const widgetSpan: Record<DashboardWidgetId, WidgetSpan> = {
  saldo: "full", fluxo: "2", contas: "1", categorias: "1", metas: "1", mercado: "1", assinaturas: "1",
  patrimonio: "1", maiores_gastos: "1", ritmo: "2", orcamento: "1", pagamentos: "1", plano: "1",
};

const isWidgetId = (id: string): id is DashboardWidgetId => (DASHBOARD_WIDGETS as readonly string[]).includes(id);

export const widgetLabel = (id: DashboardWidgetId): string => dashboardWidgetLabels[id];

/** Visible widgets in the saved order (known ids only, no duplicates). */
export function visibleWidgets(saved: readonly string[]): DashboardWidgetId[] {
  return Array.from(new Set(saved.filter(isWidgetId)));
}

/** Known widgets not in the saved list, in default order. */
export function hiddenWidgets(saved: readonly string[]): DashboardWidgetId[] {
  const shown = new Set(saved);
  return DASHBOARD_WIDGETS.filter(id => !shown.has(id));
}

/** Moves `id` by `delta` positions among the visible widgets (unknown ids keep their slots at the end). */
export function moveWidget(saved: readonly string[], id: DashboardWidgetId, delta: number): string[] {
  const visible = visibleWidgets(saved);
  const from = visible.indexOf(id);
  if (from < 0) return [...saved];
  const to = Math.max(0, Math.min(visible.length - 1, from + delta));
  return withOrder(saved, reorder(visible, from, to));
}

/** Moves `id` to the position of `target` (drag and drop). */
export function moveWidgetTo(saved: readonly string[], id: DashboardWidgetId, target: DashboardWidgetId): string[] {
  const visible = visibleWidgets(saved);
  const from = visible.indexOf(id);
  const to = visible.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...saved];
  return withOrder(saved, reorder(visible, from, to));
}

/** Shows (appended at the end) or hides a widget. */
export function setWidgetVisible(saved: readonly string[], id: DashboardWidgetId, visible: boolean): string[] {
  const without = saved.filter(entry => entry !== id);
  return visible ? [...without, id] : without;
}

/** "Restaurar padrão": the reduced default set (CR-13); every other widget stays available as hidden. */
export const defaultWidgets = (): string[] => [...DEFAULT_DASHBOARD_WIDGETS];

function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Known ids in the new order followed by the unknown ids that were saved. */
function withOrder(saved: readonly string[], order: DashboardWidgetId[]): string[] {
  return [...order, ...saved.filter(id => !isWidgetId(id))];
}

/** Currencies always shown by the ticker and the market widget (plus the ones the person holds). */
const TICKER_CURRENCIES = ["USD", "EUR", "BTC"];

/** Reference currencies followed by the foreign currencies held (no duplicates, no BRL). */
export const tickerCodes = (held: readonly string[]): string[] => Array.from(new Set([...TICKER_CURRENCIES, ...held.filter(code => code !== "BRL")]));
