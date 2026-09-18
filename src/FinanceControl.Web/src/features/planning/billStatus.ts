import { daysBetween, toISODate } from "../../lib/date";
import { daysLabel } from "../../lib/labels";
import type { Bill, Category, ChecklistItem } from "../../types";
import { dueDateInMonth, formatDayMonth } from "./dueDates";

export type StatusTone = "neutral" | "positive" | "negative" | "warning";
export interface StatusLabel { label: string; tone: StatusTone; }

/** Unpaid bills due within this many days are highlighted (amber). */
const DUE_SOON_DAYS = 5;

export interface BillRow {
  bill: Bill;
  paid: boolean;
  paidAt: string | null;
  transactionId: number | null;
  categoryName: string | null;
  /** Effective due date in the month (day clamped for shorter months). */
  dueDate: string;
  clamped: boolean;
  /** Days from today to the due date (negative = overdue). */
  daysUntil: number;
  status: StatusLabel;
}

/** Local ISO date of a stored `paid_at` (plain local timestamps are kept; UTC/offset timestamps are converted). */
export function paidDate(paidAt: string | null): string | null {
  if (!paidAt) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(paidAt.trim())) {
    const parsed = new Date(paidAt);
    if (!Number.isNaN(parsed.getTime())) return toISODate(parsed);
  }
  return /^\d{4}-\d{2}-\d{2}/.test(paidAt) ? paidAt.slice(0, 10) : null;
}

/** How the month is read (R1-BILLS-1): a closed month is history — nothing is "vencida" there, it just was not paid. */
export interface BillStatusOptions { closed?: boolean; autoDebit?: boolean; }

/**
 * "Paga em dd/mm" · "Vence hoje" · "Vencida há N dias" · "Vence em dd/mm (N dias)". A closed month says "Não paga" (neutral);
 * an automatic debit that did not run says "Não debitada" (R1-BILLS-1).
 */
export function billStatus(paid: boolean, paidAt: string | null, dueDate: string, today: string, options: BillStatusOptions = {}): StatusLabel {
  if (paid) {
    const date = paidDate(paidAt);
    return { label: date ? `Paga em ${formatDayMonth(date)}` : "Paga", tone: "positive" };
  }
  const days = daysBetween(today, dueDate);
  if (options.closed) return { label: options.autoDebit ? "Não debitada" : "Não paga", tone: "neutral" };
  if (days < 0 && options.autoDebit) return { label: `Não debitada em ${formatDayMonth(dueDate)}`, tone: "warning" };
  if (days < 0) return { label: `Vencida há ${daysLabel(-days)}`, tone: "negative" };
  if (days === 0) return { label: "Vence hoje", tone: "warning" };
  // R3-BILLS-2: the date first, as on the Painel, with the countdown in parentheses.
  return { label: `Vence em ${formatDayMonth(dueDate)} (${daysLabel(days)})`, tone: days <= DUE_SOON_DAYS ? "warning" : "neutral" };
}

/** True while an automatic debit is still ahead in an open month (nothing to do: the bill pays itself). */
export const autoDebitAhead = (row: Pick<BillRow, "bill" | "paid" | "daysUntil">, closed = false): boolean =>
  Boolean(row.bill.auto_debit) && !row.paid && row.daysUntil >= 0 && !closed;

/**
 * R2-BILLS-3: Contas a pagar says the state of an automatic debit once — "Débito automático em 22/09 (4 dias)" — instead
 * of "Vence em 4 dias" + "Será debitada em 22/09" + the "Débito automático" badge.
 */
export function billDisplayStatus(row: BillRow, closed = false): StatusLabel {
  if (!autoDebitAhead(row, closed)) return row.status;
  const when = row.daysUntil === 0 ? "hoje" : `em ${formatDayMonth(row.dueDate)} (${daysLabel(row.daysUntil)})`;
  return { label: `Débito automático ${when}`, tone: "neutral" };
}

/** R1-BILLS-1: a bill exists from the month of `active_since` on (null = always existed). */
export const billExistsIn = (bill: Pick<Bill, "active_since">, month: string): boolean =>
  !bill.active_since || bill.active_since.slice(0, 7) <= month;

/**
 * Bills of `month` merged with the month checklist, sorted by effective due date then name. With `options.onlyChecklist`
 * only the bills the server listed for the month are kept (it leaves out bills that did not exist yet, R1-BILLS-1).
 */
export function buildBillRows(bills: Bill[], checklist: ChecklistItem[], categories: Category[], month: string, today: string, options: BillStatusOptions & { onlyChecklist?: boolean } = {}): BillRow[] {
  const checklistById = new Map(checklist.map(item => [item.id, item]));
  const categoryById = new Map(categories.map(item => [item.id, item.name]));
  const inMonth = bills.filter(bill => billExistsIn(bill, month) && (!options.onlyChecklist || checklistById.has(bill.id)));
  return inMonth.map(bill => {
    const item = checklistById.get(bill.id);
    const paid = item?.paid ?? false;
    const paidAt = item?.paid_at ?? null;
    const { date, clamped } = dueDateInMonth(month, bill.due_day);
    return {
      bill, paid, paidAt,
      transactionId: item?.transaction_id ?? null,
      categoryName: bill.category_name ?? item?.category_name ?? (bill.category_id === null ? null : categoryById.get(bill.category_id) ?? null),
      dueDate: date, clamped,
      daysUntil: daysBetween(today, date),
      status: billStatus(paid, paidAt, date, today, { closed: options.closed, autoDebit: Boolean(bill.auto_debit) }),
    };
  }).sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.bill.name.localeCompare(right.bill.name, "pt-BR"));
}

export interface BillTotals {
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  /** CR-18: earliest unpaid bill that is not overdue yet (overdue ones are counted apart). */
  next: BillRow | null;
}

/** CR-18 / R1-BILLS-3: unpaid overdue bills first (oldest first), then the ones still to pay by due date, paid ones last. */
export function sortBillsForAction(rows: BillRow[]): BillRow[] {
  const overdue = (row: BillRow) => !row.paid && row.daysUntil < 0;
  return [...rows.filter(overdue), ...rows.filter(row => !row.paid && !overdue(row)), ...rows.filter(row => row.paid)];
}

export function billTotals(rows: BillRow[]): BillTotals {
  const paidRows = rows.filter(row => row.paid);
  const pendingRows = rows.filter(row => !row.paid);
  const sum = (items: BillRow[]) => items.reduce((total, row) => total + row.bill.amount_cents, 0);
  return {
    totalCents: sum(rows),
    paidCents: sum(paidRows),
    pendingCents: sum(pendingRows),
    paidCount: paidRows.length,
    pendingCount: pendingRows.length,
    overdueCount: pendingRows.filter(row => row.daysUntil < 0).length,
    next: [...pendingRows].sort((left, right) => left.dueDate.localeCompare(right.dueDate)).find(row => row.daysUntil >= 0) ?? null,
  };
}
