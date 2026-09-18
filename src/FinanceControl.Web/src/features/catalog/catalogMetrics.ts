import { addDays, addMonths, dateInMonth, formatDate, isISODate, shiftMonth } from "../../lib/date";
import { currencyOf } from "../../lib/currencies";
import { monthlyEquivalentCents } from "../../lib/labels";
import { toBaseCents, type ExchangeRates } from "../../lib/money";
import type { Category, CategorySpend, MonthlySummary, Subscription, Transaction } from "../../types";

export type StatusTone = "positive" | "negative" | "warning";

// ── Cartões ─────────────────────────────────────────────────────────────────

/** Best purchase day: the day after closing (31 wraps to 1). */
export function bestPurchaseDay(closingDay: number): number {
  const day = Math.trunc(closingDay);
  return day >= 31 || day < 1 ? 1 : day + 1;
}

export interface LimitUsage { percent: number; tone: StatusTone | undefined; label: string; }

/** Committed amount against a limit: ≥ 80% warning, > 100% negative. Null without a limit. */
export function limitUsage(usedCents: number, limitCents: number): LimitUsage | null {
  if (limitCents <= 0) return null;
  const percent = usedCents / limitCents * 100;
  if (percent > 100) return { percent, tone: "negative", label: "Acima do limite" };
  if (percent >= 80) return { percent, tone: "warning", label: "Perto do limite" };
  return { percent, tone: undefined, label: "Dentro do limite" };
}

/**
 * Monthly equivalent of the subscriptions charged on a card, in BRL (MEL-46): other currencies are converted with
 * `rates`; a currency without a known rate is left out of the total and reported in `missing`.
 */
export function cardSubscriptions(subscriptions: Subscription[], cardId: number, rates?: ExchangeRates | null): { items: Subscription[]; monthlyCents: number; missing: string[] } {
  const items = subscriptions.filter(item => item.card_id === cardId && item.active !== false);
  const missing = new Set<string>();
  let monthlyCents = 0;
  for (const item of items) {
    const code = currencyOf(item.currency).code;
    const base = toBaseCents(monthlyEquivalentCents(item.amount_cents, item.frequency), code, rates);
    if (base === null) missing.add(code);
    else monthlyCents += base;
  }
  return { items, monthlyCents, missing: [...missing].sort() };
}

// ── Categorias ──────────────────────────────────────────────────────────────

export interface BudgetStatus { percent: number; tone: StatusTone; label: string; /** budget − spent (negative = excess). */ remainingCents: number; }

/** "Dentro do limite" (< 80%) · "Perto do limite" (≥ 80%) · "Excedido" (> 100%). Null without a budget. */
export function budgetStatus(spentCents: number, budgetCents: number): BudgetStatus | null {
  if (budgetCents <= 0) return null;
  const percent = spentCents / budgetCents * 100;
  const remainingCents = budgetCents - spentCents;
  if (percent > 100) return { percent, tone: "negative", label: "Excedido", remainingCents };
  if (percent >= 80) return { percent, tone: "warning", label: "Perto do limite", remainingCents };
  return { percent, tone: "positive", label: "Dentro do limite", remainingCents };
}

/**
 * Realized amount per category in `month`, for every kind (MEL-11): expenses spent, income received, investments applied.
 * Uses the server summary when available (expense `categories` + `income_categories` + `investment_categories`),
 * otherwise sums the loaded transactions of the month (pass `categories` to include income/investment kinds).
 */
export function categorySpending(summary: MonthlySummary | null, transactions: Transaction[], month: string, categories?: Category[]): Map<number, number> {
  if (summary && summary.month === month) {
    const rows: CategorySpend[] = [...summary.categories, ...(summary.income_categories ?? []), ...(summary.investment_categories ?? [])];
    return new Map(rows.map(item => [item.category_id, item.spent_cents]));
  }
  // Without the category list only expenses are counted; with it, each transaction counts for a category of its own kind.
  const kindById = new Map(categories?.map(category => [category.id, category.kind]));
  const spent = new Map<number, number>();
  for (const item of transactions) {
    if (item.category_id === null || !item.date.startsWith(month)) continue;
    if (item.kind !== (categories ? kindById.get(item.category_id) : "expense")) continue;
    spent.set(item.category_id, (spent.get(item.category_id) ?? 0) + item.amount_cents);
  }
  return spent;
}

export type CategoryFilter = "all" | Category["kind"];

export const filterCategories = (categories: Category[], filter: CategoryFilter): Category[] =>
  filter === "all" ? categories : categories.filter(item => item.kind === filter);

// ── Assinaturas ─────────────────────────────────────────────────────────────

/** Yearly cost: monthly × 12 · yearly × 1 · weekly × 52. */
export function annualCents(amountCents: number, frequency: string): number {
  switch (frequency) {
    case "yearly": return amountCents;
    case "weekly": return amountCents * 52;
    default: return amountCents * 12;
  }
}

export const needsBillingDate = (subscription: Pick<Subscription, "frequency">): boolean => subscription.frequency === "yearly" || subscription.frequency === "weekly";

/** First occurrence on or after `today` of a schedule anchored at `anchor` (yearly +1 year, weekly +7 days, monthly +1 month). */
export function advanceToToday(anchor: string, frequency: string, today: string): string {
  if (anchor >= today) return anchor;
  if (frequency === "weekly") {
    const [ay = 0, am = 1, ad = 1] = anchor.split("-").map(Number);
    const [ty = 0, tm = 1, td = 1] = today.split("-").map(Number);
    const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
    return addDays(anchor, Math.ceil(days / 7) * 7);
  }
  const step = frequency === "yearly" ? 12 : 1;
  const monthsApart = (Number(today.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(anchor.slice(5, 7));
  let count = Math.max(0, Math.floor(monthsApart / step));
  let next = addMonths(anchor, count * step);
  while (next < today) { count += 1; next = addMonths(anchor, count * step); }
  return next;
}

/**
 * Next billing date (MEL-12): with `next_billing_date`, the anchor advanced to today or later (yearly +1 year, weekly +7 days,
 * monthly +1 month); without it, monthly subscriptions use the billing day this month (clamped) or next month when it already
 * passed; yearly/weekly ones without a date are unknown (null).
 */
export function nextBillingDate(subscription: Pick<Subscription, "next_billing_date" | "billing_day" | "frequency">, today: string): string | null {
  const anchor = subscription.next_billing_date?.slice(0, 10);
  if (anchor && isISODate(anchor)) return advanceToToday(anchor, subscription.frequency, today);
  if (subscription.frequency !== "monthly" || !subscription.billing_day) return null;
  const month = today.slice(0, 7);
  const thisMonth = dateInMonth(month, subscription.billing_day);
  return thisMonth >= today ? thisMonth : dateInMonth(shiftMonth(month, 1), subscription.billing_day);
}

/**
 * Latest billing date on or before `today` (the charge that may be due now): the day before the next billing moved back
 * one period (yearly −1 year, weekly −7 days, monthly −1 month) unless the next one is today. Null when unknown.
 */
export function lastBillingDate(subscription: Pick<Subscription, "next_billing_date" | "billing_day" | "frequency">, today: string): string | null {
  const next = nextBillingDate(subscription, today);
  if (!next) return null;
  if (next === today) return today;
  const anchor = subscription.next_billing_date?.slice(0, 10);
  if (anchor && isISODate(anchor) && anchor > today) return null;
  if (subscription.frequency === "weekly") return addDays(next, -7);
  if (subscription.frequency === "yearly") return addMonths(next, -12);
  // Monthly: the billing day of the previous month (clamped), which can only be this month or the last one.
  return anchor && isISODate(anchor) ? addMonths(next, -1) : dateInMonth(shiftMonth(next.slice(0, 7), -1), subscription.billing_day);
}

/**
 * CR-26: "Lançar cobrança" is offered on the row only while the charge of the current period is pending — it is due
 * (on or before today, within this month or the last 7 days for weekly ones), not in automatic debit and not charged yet.
 */
export function chargePending(subscription: Pick<Subscription, "next_billing_date" | "billing_day" | "frequency" | "last_charge_date" | "auto_debit" | "active">, today: string): boolean {
  if (subscription.auto_debit || subscription.active === false) return false;
  const due = lastBillingDate(subscription, today);
  if (!due) return false;
  const recent = subscription.frequency === "weekly" ? due >= addDays(today, -7) : due.slice(0, 7) === today.slice(0, 7);
  if (!recent) return false;
  const charged = subscription.last_charge_date?.slice(0, 10);
  return !charged || charged < due;
}

/** "Cobrada em dd/mm" when the latest charge falls in the month of `today` (MEL-05); null otherwise. */
export function chargedLabel(subscription: Pick<Subscription, "last_charge_date">, today: string): string | null {
  const date = subscription.last_charge_date?.slice(0, 10);
  if (!date || !isISODate(date) || date.slice(0, 7) !== today.slice(0, 7)) return null;
  return `Cobrada em ${formatDate(date).slice(0, 5)}`;
}


/**
 * R2-REC-1: bucket preselected for a new category while a 70-20-10 plan is active — expenses start in "Gastos fixos",
 * investments in "Investimento" (income never enters the plan). Without a plan nothing is preselected.
 */
export function suggestedBucket(settings: { plan_fixed_pct?: number | null }, kind: string): "" | "fixo" | "investimento" {
  if (typeof settings.plan_fixed_pct !== "number") return "";
  return kind === "expense" ? "fixo" : kind === "investment" ? "investimento" : "";
}
