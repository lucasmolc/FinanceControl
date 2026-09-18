/** Relatórios: real distribution per plan bucket × the 70-20-10 plan over the period (MEL-45) and the grouped top expenses (CR-14). */
import type { ReportCategory, ReportMonth, ReportTopExpense } from "../../api/insights";
import { formatDate } from "../../lib/date";
import type { Category, CategoryBucket } from "../../types";
import type { PlanValues } from "../plan/planModel";

export interface BucketRow { id: "fixo" | "lazer" | "investimento"; label: string; realizedCents: number; plannedCents: number; realizedPct: number | null; planPct: number; kind: "ceiling" | "floor"; }
export interface PlanDistribution {
  rows: BucketRow[]; outsideCents: number; unbucketedCents: number; salaryCents: number;
  /** Months that form the salary basis (R2-REL-2: months with recorded income; all months when none has income). */
  months: number;
  /** Months in the period. */
  periodMonths: number;
}

/** Server per-month bucket figures summed over the period; null when the server does not send them (older versions). */
function monthSums(reportMonths: ReportMonth[]): Record<CategoryBucket | "none", number> | null {
  if (!reportMonths.length || reportMonths.some(month => typeof month.fixed_spent_cents !== "number")) return null;
  const sum = (key: keyof ReportMonth) => reportMonths.reduce((total, month) => total + (Number(month[key]) || 0), 0);
  // `invested_cents` already includes investment-kind transactions: keep "investimento" and add no investment total later.
  return { fixo: sum("fixed_spent_cents"), lazer: sum("fun_spent_cents"), investimento: sum("invested_cents"), fora: sum("out_of_plan_expense_cents"), none: sum("unbucketed_expense_cents") };
}

/**
 * Realized per bucket over the period: the server's per-month figures (bucket of each transaction's category) or,
 * for older servers, the expense categories summed by their current bucket plus the investment total.
 * Plan = salary × pct × basis months; `realizedPct` = share of the planned salary.
 * R2-REL-2: the basis is the months that have recorded income (a period with income in 3 of 6 months compares with
 * salary × 3, not × 6, which halved every rate). Without per-month income (or none at all) every month of the period counts.
 */
export function planDistribution(expenseCategories: ReportCategory[], investmentCents: number, categories: Category[], plan: PlanValues, salaryCents: number, months: number, reportMonths: ReportMonth[] = []): PlanDistribution {
  const fromServer = monthSums(reportMonths);
  const bucketOf = new Map<number, CategoryBucket | null | undefined>(categories.map(category => [category.id, category.bucket]));
  const sums: Record<CategoryBucket | "none", number> = fromServer ?? { fixo: 0, lazer: 0, investimento: 0, fora: 0, none: 0 };
  if (!fromServer) for (const item of expenseCategories) {
    const bucket = item.category_id === null ? null : bucketOf.get(item.category_id);
    sums[bucket ?? "none"] += item.total_cents;
  }
  const periodMonths = Math.max(1, months);
  const withIncome = reportMonths.filter(month => month.income_cents > 0).length;
  const basisMonths = withIncome > 0 ? Math.min(withIncome, periodMonths) : periodMonths;
  const income = Math.max(0, salaryCents) * basisMonths;
  const planned = (pct: number) => Math.round((income * pct) / 100);
  const share = (cents: number) => (income > 0 ? Math.round((cents / income) * 1000) / 10 : null);
  const invested = sums.investimento + (fromServer ? 0 : Math.max(0, investmentCents));
  return {
    rows: [
      { id: "fixo", label: "Gastos fixos", realizedCents: sums.fixo, plannedCents: planned(plan.fixedPct), realizedPct: share(sums.fixo), planPct: plan.fixedPct, kind: "ceiling" },
      { id: "lazer", label: "Lazer", realizedCents: sums.lazer, plannedCents: planned(plan.funPct), realizedPct: share(sums.lazer), planPct: plan.funPct, kind: "ceiling" },
      { id: "investimento", label: "Investimento", realizedCents: invested, plannedCents: planned(plan.investPct), realizedPct: share(invested), planPct: plan.investPct, kind: "floor" },
    ],
    outsideCents: sums.fora,
    unbucketedCents: sums.none,
    salaryCents,
    months: basisMonths,
    periodMonths,
  };
}

/** True when the bucket is on the right side of the plan (ceiling not exceeded / floor reached). */
export const bucketOnPlan = (row: BucketRow): boolean => (row.kind === "ceiling" ? row.realizedCents <= row.plannedCents : row.realizedCents >= row.plannedCents);

export type BucketStatus = "within" | "over" | "reached" | "below" | "no_data";

/**
 * R1-REL-1: a limit bucket with nothing counted while there is spend without a bucket is "no_data", never "within the
 * limit" (the spend may belong to it). Labels follow decision 1: limits and a minimum, never "teto".
 */
export function bucketStatus(row: BucketRow, unbucketedCents: number): BucketStatus {
  if (row.kind === "ceiling") {
    if (row.realizedCents === 0 && unbucketedCents > 0) return "no_data";
    return row.realizedCents <= row.plannedCents ? "within" : "over";
  }
  return row.realizedCents >= row.plannedCents ? "reached" : "below";
}

export const bucketStatusBadge: Record<BucketStatus, { tone: "positive" | "negative" | "warning" | "neutral"; label: string }> = {
  within: { tone: "positive", label: "Dentro do limite" },
  over: { tone: "negative", label: "Acima do limite" },
  reached: { tone: "positive", label: "Mínimo atingido" },
  below: { tone: "warning", label: "Abaixo do mínimo" },
  no_data: { tone: "neutral", label: "Sem dados" },
};

export interface TopExpenseGroup {
  key: string;
  /** Most recent item (opened when the bar is selected). */
  latest: ReportTopExpense;
  count: number;
  totalCents: number;
  label: string;
  detail: string;
}

const dayMonth = (iso: string) => formatDate(iso).slice(0, 5);

/**
 * CR-14: repeated descriptions ("Aluguel" × 6) become one bar "Aluguel · 6×" with the date range;
 * single items are labeled with their date ("Aluguel · 05/09"). Ordered by total, largest first.
 */
export function groupTopExpenses(items: ReportTopExpense[], money: (cents: number, currency?: string) => string): TopExpenseGroup[] {
  const groups = new Map<string, ReportTopExpense[]>();
  for (const item of items) {
    const key = `${(item.description || "Sem descrição").trim().toLocaleLowerCase("pt-BR")}|${item.category_name ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const sorted = [...list].sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id);
    const latest = sorted[0]!;
    const first = sorted[sorted.length - 1]!;
    const name = latest.description || "Sem descrição";
    const category = latest.category_name ?? "Sem categoria";
    const totalCents = list.reduce((sum, item) => sum + item.base_amount_cents, 0);
    const foreign = list.length === 1 && latest.currency !== "BRL" ? ` · ${money(latest.amount_cents, latest.currency)}` : "";
    return {
      key, latest, count: list.length, totalCents,
      label: list.length > 1 ? `${name} · ${list.length}×` : `${name} · ${dayMonth(latest.date)}`,
      detail: list.length > 1 ? `${category} · ${list.length} lançamentos de ${dayMonth(first.date)} a ${dayMonth(latest.date)}` : `${category} · ${formatDate(latest.date)}${foreign}`,
    };
  }).sort((left, right) => right.totalCents - left.totalCents || left.label.localeCompare(right.label, "pt-BR"));
}
