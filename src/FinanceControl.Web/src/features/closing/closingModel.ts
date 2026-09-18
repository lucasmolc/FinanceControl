import { currentMonth, formatMonthLabel } from "../../lib/date";
import type { CardInvoiceRow, ChecklistItem, FormState, MonthlySummary } from "../../types";
import { invoiceMonthLabel } from "../catalog/invoiceModel";

/** Tooltip/hint for actions blocked by a monthly closing (MEL-22). */
export const MONTH_CLOSED = "Mês fechado";

/** True when the loaded summary is for `month` and says it is closed. */
export const isMonthClosed = (summary: MonthlySummary | null | undefined, month: string): boolean =>
  Boolean(summary && summary.month === month && summary.closed);

/** Closing date of `month` (null when open or unknown). */
export const closedAt = (summary: MonthlySummary | null | undefined, month: string): string | null =>
  isMonthClosed(summary, month) ? summary?.closed_at ?? null : null;

/** Only past or current months can be closed. */
export const canCloseMonth = (month: string, today = currentMonth()): boolean => month <= today;

/** "Setembro de 2026" */
export const monthTitle = (month: string): string => {
  const label = formatMonthLabel(month);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export interface MonthTotals { incomeCents: number; expenseCents: number; investmentCents: number; resultCents: number; }

/** Month result = receitas − despesas − investimentos (same rule as Lançamentos). */
export function monthTotals(summary: Pick<MonthlySummary, "income_cents" | "expense_cents" | "investment_cents">): MonthTotals {
  const incomeCents = summary.income_cents;
  const expenseCents = summary.expense_cents;
  const investmentCents = summary.investment_cents;
  return { incomeCents, expenseCents, investmentCents, resultCents: incomeCents - expenseCents - investmentCents };
}

/** Initial state of the "month-close" form: the month and, when the summary is for it, its totals (cents). */
export function monthCloseInitial(month: string, summary: MonthlySummary | null): FormState {
  const current = summary && summary.month === month ? summary : null;
  return {
    month,
    income_cents: current?.income_cents ?? null,
    expense_cents: current?.expense_cents ?? null,
    investment_cents: current?.investment_cents ?? null,
  };
}

/** Totals carried in the form (null when the summary was not available). */
export function formTotals(form: FormState): MonthTotals | null {
  const read = (key: string) => typeof form[key] === "number" ? form[key] as number : null;
  const income = read("income_cents");
  const expense = read("expense_cents");
  const investment = read("investment_cents");
  if (income === null || expense === null || investment === null) return null;
  return monthTotals({ income_cents: income, expense_cents: expense, investment_cents: investment });
}

/** One unpaid item of the month shown in the closing dialog (R2-X-2 / R4-LANC-3). */
export interface MonthPendency { key: string; kind: "bill" | "invoice"; name: string; cents: number; }
export interface MonthPendencies { items: MonthPendency[]; bills: number; invoices: number; totalCents: number; }

/**
 * Unpaid bills of the month's checklist and unpaid card invoices (due in the month or carried from earlier, with an
 * amount), invoices first. Paid rows and empty invoices are left out.
 */
export function monthPendencies(checklist: ChecklistItem[], invoices: CardInvoiceRow[]): MonthPendencies {
  const invoiceItems: MonthPendency[] = invoices
    .filter(invoice => !invoice.paid && invoice.status !== "paga" && invoice.total_cents > 0)
    .sort((left, right) => left.due_date.localeCompare(right.due_date))
    .map(invoice => ({ key: `invoice:${invoice.card_id}:${invoice.month}`, kind: "invoice", name: `Fatura ${invoice.card_name} · ${invoiceMonthLabel(invoice.month)}`, cents: invoice.total_cents }));
  const billItems: MonthPendency[] = checklist
    .filter(item => !item.paid)
    .sort((left, right) => left.due_day - right.due_day)
    .map(item => ({ key: `bill:${item.id}`, kind: "bill", name: item.name, cents: item.amount_cents }));
  const items = [...invoiceItems, ...billItems];
  return { items, bills: billItems.length, invoices: invoiceItems.length, totalCents: items.reduce((sum, item) => sum + item.cents, 0) };
}

/** "1 fatura e 2 contas não pagas" */
export function pendencyCountText({ bills, invoices }: Pick<MonthPendencies, "bills" | "invoices">): string {
  const parts = [
    invoices ? `${invoices} ${invoices === 1 ? "fatura" : "faturas"}` : "",
    bills ? `${bills} ${bills === 1 ? "conta" : "contas"}` : "",
  ].filter(Boolean);
  const total = bills + invoices;
  return `${parts.join(" e ")} ${total === 1 ? "não paga" : "não pagas"}`;
}
