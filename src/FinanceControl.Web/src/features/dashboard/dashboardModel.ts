import { currentMonth, dateInMonth, daysBetween, daysInMonth, formatDate, formatMonthLabel, shiftMonth, todayISO } from "../../lib/date";
import { formatProgress } from "../../lib/progress";
import { daysLabel } from "../../lib/labels";
import { brl, toBaseCents, type ExchangeRates } from "../../lib/money";
import type { ChecklistItem, DailyExpense, FinanceState, MonthlySummary } from "../../types";

export type StatusTone = "neutral" | "positive" | "negative" | "warning";
export interface StatusInfo { label: string; tone: StatusTone; }

/** "dd/mm" from an ISO date or timestamp ("2026-09-10", "2026-09-10T14:00:00", "2026-09-10 14:00:00"). */
export function shortDate(iso: string): string {
  const full = formatDate(iso.slice(0, 10));
  return /^\d{2}\/\d{2}\/\d{4}$/.test(full) ? full.slice(0, 5) : full;
}

/** Due/paid status of a checklist item in `month`, relative to `today`. The due day is clamped to the month length. */
/** `closed` (R3-PAINEL-1): a closed month is history — "Não paga"/"Não debitada" in neutral, like Contas a pagar. */
/** `short` (R4-PAINEL-2): the Painel timeline shows the date in its own tile, so "Vence em 10 dias" (no "28/09"). */
export function billStatus(item: ChecklistItem, month: string, today: string = todayISO(), closed = false, short = false): StatusInfo {
  if (item.paid) return { label: item.paid_at ? `Paga em ${shortDate(item.paid_at)}` : "Paga", tone: "positive" };
  if (closed) return { label: item.auto_debit ? "Não debitada" : "Não paga", tone: "neutral" };
  const due = dateInMonth(month, item.due_day);
  const days = daysBetween(today, due);
  if (days === 0) return { label: "Vence hoje", tone: "warning" };
  if (days < 0) return { label: `Vencida há ${daysLabel(-days)}`, tone: "negative" };
  if (days === 1) return { label: "Vence amanhã", tone: "warning" };
  // Same wording as Contas a pagar (R3-BILLS-2): "Vence em dd/mm (N dias)".
  return { label: short ? `Vence em ${daysLabel(days)}` : `Vence em ${shortDate(due)} (${daysLabel(days)})`, tone: days <= 3 ? "warning" : "neutral" };
}

export type BudgetLevel = "none" | "ok" | "near" | "over";

/** Budget consumption: ≥ 80% is "Perto do limite", > 100% is "Excedido". */
export function budgetLevel(spentCents: number, budgetCents: number): BudgetLevel {
  if (budgetCents <= 0) return "none";
  if (spentCents > budgetCents) return "over";
  return spentCents * 100 >= budgetCents * 80 ? "near" : "ok";
}

export const budgetBadge: Record<Exclude<BudgetLevel, "none">, StatusInfo> = {
  ok: { label: "Dentro do limite", tone: "positive" },
  near: { label: "Perto do limite", tone: "warning" },
  over: { label: "Excedido", tone: "negative" },
};

/** Percentage (integer, not clamped) of `part` over `whole`; 0 when `whole` is 0. */
export const percent = (part: number, whole: number): number => whole > 0 ? Math.round(part / whole * 100) : 0;

const overOneDecimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Decision 3: limit usage with the app-wide progress rule ("1,7%", "85%"); past the limit the real share ("112%").
 * R4-PAINEL-4: just past the limit (under 110%) one decimal, never "100%" next to "Acima do teto" ("100,7%").
 */
export function limitPercent(spent: number, limit: number): string {
  if (!(limit > 0 && spent > limit)) return formatProgress(spent, limit);
  const tenths = Math.floor(spent * 1000 / limit); // integer math: 100.700 / 100.000 → 1007 (no 1006.99… float)
  if (tenths < 1100) return `${overOneDecimal.format(Math.max(1001, tenths) / 10)}%`;
  return `${Math.floor(tenths / 10)}%`;
}

export interface CategoryRow { id: number; name: string; budget: number; spent: number; active: boolean; }

export interface MonthTotals {
  income: number;
  expenses: number;
  invested: number;
  uncategorized: number;
  categories: CategoryRow[];
  /** True when the totals come from the latest transactions of the state (summary unavailable). */
  estimated: boolean;
}

/** Month totals from the server summary, or computed from `state.transactions` when the summary is unavailable. */
export function monthTotals(state: FinanceState, month: string, summary: MonthlySummary | null): MonthTotals {
  if (summary) {
    return {
      income: summary.income_cents,
      expenses: summary.expense_cents,
      invested: summary.investment_cents,
      uncategorized: summary.uncategorized_expense_cents,
      categories: summary.categories.map(item => ({ id: item.category_id, name: item.name, budget: item.monthly_budget_cents, spent: item.spent_cents, active: item.active })),
      estimated: false,
    };
  }
  const monthItems = state.transactions.filter(item => item.date.startsWith(month));
  const sum = (kind: string) => monthItems.filter(item => item.kind === kind).reduce((total, item) => total + item.amount_cents, 0);
  const expenses = monthItems.filter(item => item.kind === "expense");
  const categories = state.categories
    .filter(category => category.kind === "expense")
    .map(category => ({
      id: category.id, name: category.name, budget: category.monthly_budget_cents, active: category.active,
      spent: expenses.filter(item => item.category_id === category.id).reduce((total, item) => total + item.amount_cents, 0),
    }))
    .sort((left, right) => right.spent - left.spent || left.name.localeCompare(right.name, "pt-BR"));
  const known = new Set(categories.map(category => category.id));
  return {
    income: sum("income"),
    expenses: sum("expense"),
    invested: sum("investment"),
    uncategorized: expenses.filter(item => item.category_id === null || !known.has(item.category_id)).reduce((total, item) => total + item.amount_cents, 0),
    categories,
    estimated: true,
  };
}

/** Money formatter (privacy-aware `useMoneyFormat` in components; `brl` by default). */
export type MoneyFormat = (cents: number) => string;

export interface KpiView { label: string; value: string; tone?: "positive" | "negative" | "warning"; hint?: string; }

/** Decision 1: the one "teto" is the monthly spending ceiling; with the 70-20-10 plan it is fixos + lazer. */
const tetoOf = (limit: number, fmt: MoneyFormat, planComposed: boolean) => `teto de gastos de ${fmt(limit)}${planComposed ? " (fixos + lazer)" : ""}`;

/** Remaining budget KPI; never clamped: overspending shows "Excedido em R$ X". */
export function availableKpi(limit: number, expenses: number, fmt: MoneyFormat = brl, planComposed = false): KpiView {
  const label = "Disponível no orçamento";
  if (limit <= 0) return { label, value: "Sem teto", hint: "Defina um teto de gastos em Configurações." };
  const remaining = limit - expenses;
  if (remaining < 0) return { label, value: `Excedido em ${fmt(-remaining)}`, tone: "negative", hint: `Acima do ${tetoOf(limit, fmt, planComposed)}.` };
  const level = budgetLevel(expenses, limit);
  return {
    label, value: fmt(remaining),
    tone: level === "near" ? "warning" : remaining > 0 ? "positive" : undefined,
    hint: level === "near" ? `Perto do limite: ${limitPercent(expenses, limit)} do ${tetoOf(limit, fmt, planComposed)} usado.` : `Do ${tetoOf(limit, fmt, planComposed)}.`,
  };
}

/** Income KPI: registered income when there is any, otherwise the planned income marked as "planejada". */
export function incomeKpi(income: number, planned: number, fmt: MoneyFormat = brl): KpiView {
  const label = "Renda do mês";
  if (income > 0) return { label, value: fmt(income), hint: planned > 0 ? `Registrada · planejada ${fmt(planned)}` : "Registrada no mês" };
  if (planned > 0) return { label, value: fmt(planned), hint: "Planejada · nenhuma receita registrada ainda" };
  return { label, value: fmt(0), hint: "Nenhuma receita registrada" };
}

export function expensesKpi(expenses: number, limit: number, fmt: MoneyFormat = brl, planComposed = false): KpiView {
  const label = "Gastos do mês";
  if (limit <= 0) return { label, value: fmt(expenses), hint: "Sem teto de gastos definido" };
  return { label, value: fmt(expenses), tone: expenses > limit ? "negative" : undefined, hint: `${limitPercent(expenses, limit)} do ${tetoOf(limit, fmt, planComposed)}` };
}

export function wealthKpi(bank: number, investments: number, fmt: MoneyFormat = brl): KpiView {
  const total = bank + investments;
  return {
    label: "Patrimônio",
    value: fmt(total),
    tone: total < 0 ? "negative" : undefined,
    hint: `Contas ${fmt(bank)} · Investimentos ${fmt(investments)}`,
  };
}

/** True when nothing was registered yet (first-run activation panel). */
export function isFirstUse(state: FinanceState): boolean {
  return !state.categories.length && !state.transactions.length && !state.bills.length && !state.goals.length
    && !state.investments.length && !state.cards.length && !state.bank_accounts.length && !state.subscriptions.length;
}

// ---------- MEL-38: spending pace ("ritmo do mês") ----------

export type ForecastStatus = "none" | "ok" | "warning" | "danger";
export interface MonthForecast {
  /** Days in the month and days elapsed (1…days for the current month, days for past months, 0 for future ones). */
  days: number;
  elapsed: number;
  /** Cumulative spend per day (null after today in the current month / every day of a future month). */
  cumulative: (number | null)[];
  spent: number;
  /** spent / elapsed × days (current month), the final spend (past month), null (future month or no data). */
  forecast: number | null;
  status: ForecastStatus;
  timing: "past" | "current" | "future";
}

/** Cumulative daily spend and the month-end forecast `spent / days_elapsed × days_in_month` (spec §9). */
export function monthForecast(daily: DailyExpense[], month: string, limit: number, today: string = todayISO()): MonthForecast {
  const days = daysInMonth(month);
  const todayMonth = today.slice(0, 7);
  const timing = month < todayMonth ? "past" : month > todayMonth ? "future" : "current";
  const elapsed = timing === "past" ? days : timing === "future" ? 0 : Math.min(days, Number(today.slice(8, 10)));
  const perDay = new Array<number>(days).fill(0);
  for (const item of daily) {
    if (!item.date.startsWith(month)) continue;
    const day = Number(item.date.slice(8, 10));
    if (day >= 1 && day <= days) perDay[day - 1]! += item.total_cents;
  }
  let running = 0;
  const cumulative = perDay.map((value, index) => {
    if (index >= elapsed) return null;
    running += value;
    return running;
  });
  const spent = running;
  const forecast = elapsed === 0 ? null : timing === "past" ? spent : Math.round(spent / elapsed * days);
  let status: ForecastStatus = "none";
  if (forecast !== null && limit > 0) status = forecast > limit ? "danger" : forecast * 10 > limit * 9 ? "warning" : "ok";
  return { days, elapsed, cumulative, spent, forecast, status, timing };
}

/** Ideal pace line: the limit spread evenly over the month (0 → limit). */
export const paceLine = (limit: number, days: number): number[] => Array.from({ length: days }, (_, index) => Math.round(limit * (index + 1) / days));

/** pt-BR forecast sentence for the "ritmo" widget. */
export function forecastText(result: MonthForecast, limit: number, fmt: MoneyFormat = brl): string {
  if (result.timing === "future") return "O mês ainda não começou.";
  if (result.forecast === null) return "Ainda não há gastos registrados.";
  const share = limit > 0 ? ` (${limitPercent(result.forecast, limit)} do teto de ${fmt(limit)})` : "";
  if (result.timing === "past") return `O mês fechou com ${fmt(result.spent)} em gastos${share}.`;
  return `No ritmo atual, o mês fecha em ${fmt(result.forecast)}${share}.`;
}

// ---------- Hero patrimônio ----------

export interface NetWorthPoint { month: string; total_cents: number; }

/** Snapshot of the month before `month` (for the hero delta), or null. */
export const previousSnapshot = <T extends NetWorthPoint>(series: T[], month: string): T | null =>
  series.find(item => item.month === shiftMonth(month, -1)) ?? null;

/** Relative change (ratio) between two totals; null when there is no base. */
export const changeRatio = (current: number, previous: number | null | undefined): number | null =>
  previous === null || previous === undefined || previous === 0 ? null : (current - previous) / Math.abs(previous);

/** Hero label: live value for the current month, the month snapshot otherwise. */
export const heroLabel = (month: string, now: string = currentMonth()): string => month === now ? "Patrimônio" : `Patrimônio em ${formatMonthLabel(month)}`;

export interface ForeignHolding { currency: string; native: number; base: number | null; }
export interface WealthFigures {
  /** BRL cents of the accounts and investments that could be converted. */
  bank: number;
  investments: number;
  total: number;
  /** Currencies without a known rate (left out of the totals). */
  missing: string[];
  /** Non-BRL balances grouped by currency (native minor units + BRL cents). */
  foreign: ForeignHolding[];
}

/** Live patrimônio in BRL: account and investment balances converted with the market rates (MEL-26/34). */
export function wealthFigures(state: Pick<FinanceState, "bank_accounts" | "investments">, rates: ExchangeRates): WealthFigures {
  const missing = new Set<string>();
  const foreign = new Map<string, ForeignHolding>();
  const convert = (minor: number, currency: string | undefined) => {
    const code = currency || "BRL";
    const base = toBaseCents(minor, code, rates);
    if (code !== "BRL") {
      const entry = foreign.get(code) ?? { currency: code, native: 0, base: 0 };
      entry.native += minor;
      entry.base = base === null || entry.base === null ? null : entry.base + base;
      foreign.set(code, entry);
    }
    if (base === null) { missing.add(code); return 0; }
    return base;
  };
  const bank = state.bank_accounts.reduce((sum, item) => sum + convert(item.current_balance_cents, item.currency), 0);
  const investments = state.investments.reduce((sum, item) => sum + convert(item.current_cents, item.currency), 0);
  return { bank, investments, total: bank + investments, missing: [...missing].sort(), foreign: [...foreign.values()].sort((left, right) => (right.base ?? 0) - (left.base ?? 0)) };
}
