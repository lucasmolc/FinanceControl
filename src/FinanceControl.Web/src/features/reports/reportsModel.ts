import { isMonth, shiftMonth } from "../../lib/date";

export type PeriodPreset = "month" | "3m" | "6m" | "12m" | "year" | "custom";
export interface Period { from: string; to: string }

const MAX_REPORT_MONTHS = 36;

export const periodPresets: { id: PeriodPreset; label: string }[] = [
  { id: "month", label: "Este mês" },
  { id: "3m", label: "3 meses" },
  { id: "6m", label: "6 meses" },
  { id: "12m", label: "12 meses" },
  { id: "year", label: "Este ano" },
  { id: "custom", label: "Personalizado" },
];

/** Inclusive number of months between two "YYYY-MM" (0 when invalid or reversed). */
export function monthSpan(from: string, to: string): number {
  if (!isMonth(from) || !isMonth(to)) return 0;
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  const span = (ty - fy) * 12 + (tm - fm) + 1;
  return span > 0 ? span : 0;
}

/** Range of a preset ending at `anchor` (the current month); custom returns `custom`. */
export function presetPeriod(preset: PeriodPreset, anchor: string, custom?: Period): Period {
  switch (preset) {
    case "month": return { from: anchor, to: anchor };
    case "3m": return { from: shiftMonth(anchor, -2), to: anchor };
    case "12m": return { from: shiftMonth(anchor, -11), to: anchor };
    case "year": return { from: `${anchor.slice(0, 4)}-01`, to: anchor };
    case "custom": return custom ?? { from: shiftMonth(anchor, -5), to: anchor };
    default: return { from: shiftMonth(anchor, -5), to: anchor };
  }
}

/** Validation of a custom range; null when valid (pt-BR message otherwise). */
export function periodError(period: Period): string | null {
  if (!isMonth(period.from) || !isMonth(period.to)) return "Informe o mês inicial e o final.";
  const span = monthSpan(period.from, period.to);
  if (!span) return "O mês inicial deve ser anterior ou igual ao final.";
  if (span > MAX_REPORT_MONTHS) return `Escolha no máximo ${MAX_REPORT_MONTHS} meses.`;
  return null;
}

/** The same-length period right before `period` (for deltas). */
export function previousPeriod(period: Period): Period {
  const span = Math.max(1, monthSpan(period.from, period.to));
  return { from: shiftMonth(period.from, -span), to: shiftMonth(period.from, -1) };
}

export interface Delta { pct: number | null; direction: "up" | "down" | "flat" }

/** Relative change current vs previous (null % when the previous value is zero). */
export function delta(current: number, previous: number): Delta {
  const direction = current > previous ? "up" : current < previous ? "down" : "flat";
  if (!previous) return { pct: null, direction };
  return { pct: Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10, direction };
}

/** "+12,5%" / "−3%" / "0%" (U+2212 minus). */
export function formatPct(value: number, signed = false): string {
  const text = Math.abs(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (!signed || value === 0) return `${value < 0 ? "−" : ""}${text}%`;
  return `${value > 0 ? "+" : "−"}${text}%`;
}

/** Short axis label: "2026-09" → "set/26". */
export function shortMonthLabel(month: string): string {
  if (!isMonth(month)) return month;
  const [year, monthIndex] = month.split("-").map(Number) as [number, number];
  const name = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(year, monthIndex - 1, 1)).replace(".", "");
  return `${name}/${String(year).slice(2)}`;
}

/**
 * R4-REL-2: monthly average over the months that have entries (income, expense or investment), so empty months at the
 * start of the history do not halve it. `active` = months with entries, `span` = months in the period.
 */
export function activeMonthlyAverage(months: { income_cents: number; expense_cents: number; investment_cents: number }[], total: number): { cents: number; active: number; span: number } {
  const active = months.filter(item => item.income_cents > 0 || item.expense_cents > 0 || item.investment_cents > 0).length;
  return { cents: active ? Math.round(total / active) : 0, active, span: months.length };
}

/** "Média de R$ 5.500,00 por mês" or, with empty months, "Média de R$ 11.000,00 nos 3 meses com lançamentos". */
export function averageHint(amount: string, active: number, span: number): string {
  if (active >= span) return `Média de ${amount} por mês`;
  return active === 1 ? `${amount} no único mês com lançamentos` : `Média de ${amount} nos ${active} meses com lançamentos`;
}

/** "abr/26 a set/26" or a single month label. */
export function periodLabel(period: Period): string {
  return period.from === period.to ? shortMonthLabel(period.from) : `${shortMonthLabel(period.from)} a ${shortMonthLabel(period.to)}`;
}
