/**
 * One color per financial series across every chart (CR-10): the Painel and Relatórios must paint "Investimentos" the
 * same way. Semantic series use the signal tokens (receitas → ganho, despesas → perda); the rest use FIXED hues of the
 * validated ring (`--hue-*`, which follow the theme but never the accent), because `--chart-1…8` rotate with the accent
 * and would collide with the signal greens (e.g. the emerald accent makes --chart-1 emerald, next to "Receitas").
 * Categorical data without meaning (categories, payment methods) keeps using `chartColor(index)`.
 */
export type FinanceSeriesKey =
  | "income" | "expense" | "investment" | "net"
  | "net_worth" | "bank" | "investments"
  | "spent" | "pace" | "limit" | "amount" | "projection_real";

const SERIES_COLORS: Record<FinanceSeriesKey, string> = {
  income: "var(--gain)",
  expense: "var(--loss)",
  investment: "var(--hue-blue, var(--chart-1))",
  net: "var(--text)",
  net_worth: "var(--hue-emerald, var(--chart-1))",
  bank: "var(--hue-violet, var(--chart-2))",
  investments: "var(--hue-blue, var(--chart-1))",
  spent: "var(--chart-1, var(--accent))",
  pace: "var(--muted)",
  limit: "var(--warning)",
  amount: "var(--chart-2, var(--accent))",
  projection_real: "var(--hue-violet, var(--chart-2))",
};

/** CSS color of a financial series (same on the Painel, Relatórios and Projeções). */
export const seriesColor = (key: FinanceSeriesKey): string => SERIES_COLORS[key];
