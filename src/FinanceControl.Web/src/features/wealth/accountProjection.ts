import { currencyOf } from "../../lib/currencies";
import { dateInMonth } from "../../lib/date";
import type { BankAccount, Bill, CardInvoiceRow, ChecklistItem, Subscription } from "../../types";
import { nextBillingDate } from "../catalog/catalogMetrics";
import { dueDateInMonth } from "../planning/dueDates";

/** One payment still ahead in the month for an account (R1-CONTAS-1): an automatic debit or an unpaid bill linked to it. */
export interface PendingDebit {
  name: string;
  date: string;
  cents: number;
  /** R2-CONTAS-1: an unpaid bill whose due date has passed (still leaves the account when it is paid). */
  overdue?: boolean;
}

export interface AccountProjection {
  debits: PendingDebit[];
  /** Sum of `debits` (account currency, minor units). */
  pendingCents: number;
  /** current balance − pending debits. */
  projectedCents: number;
}

/**
 * What will still leave each account until the end of `month`: every unpaid bill of the month linked to the account —
 * overdue or not, automatic debit or not (R2-CONTAS-1) — and auto-debit subscriptions (not on a card) whose next charge
 * falls in the month. Only amounts in the account currency count (a debit in another currency is converted by the bank,
 * so it is left out rather than guessed).
 */
export function projectAccounts(accounts: BankAccount[], bills: Bill[], checklist: ChecklistItem[], subscriptions: Subscription[], month: string, today: string): Map<number, AccountProjection> {
  const paid = new Set(checklist.filter(item => item.paid).map(item => item.id));
  const listed = new Set(checklist.map(item => item.id));
  const end = dateInMonth(month, 31);
  const result = new Map<number, AccountProjection>();
  for (const account of accounts) {
    const currency = currencyOf(account.currency).code;
    const debits: PendingDebit[] = [];
    for (const bill of bills) {
      if (bill.account_id !== account.id || paid.has(bill.id) || (checklist.length > 0 && !listed.has(bill.id))) continue;
      if (currencyOf(bill.currency).code !== currency) continue;
      const date = dueDateInMonth(month, bill.due_day).date;
      debits.push({ name: bill.name, date, cents: bill.amount_cents, overdue: date < today });
    }
    for (const item of subscriptions) {
      if (!item.auto_debit || item.card_id || item.account_id !== account.id || item.active === false) continue;
      if (currencyOf(item.currency).code !== currency) continue;
      const next = nextBillingDate(item, today);
      if (!next || next > end || next.slice(0, 7) !== month) continue;
      // A charge already launched this period is not pending any more.
      if (item.last_charge_date && item.last_charge_date.slice(0, 10) >= next) continue;
      debits.push({ name: item.name, date: next, cents: item.amount_cents });
    }
    debits.sort((left, right) => left.date.localeCompare(right.date));
    const pendingCents = debits.reduce((sum, debit) => sum + debit.cents, 0);
    result.set(account.id, { debits, pendingCents, projectedCents: account.current_balance_cents - pendingCents });
  }
  return result;
}

/** R2-CONTAS-1: card invoices still to pay by the end of `month` (overdue ones included) — they belong to no account. */
export function unpaidInvoicesUntil(invoices: CardInvoiceRow[], month: string, today: string): { count: number; cents: number; overdue: number } {
  const end = dateInMonth(month, 31);
  const open = invoices.filter(invoice => !invoice.paid && invoice.status !== "paga" && invoice.total_cents > 0 && invoice.due_date <= end);
  return { count: open.length, cents: open.reduce((sum, invoice) => sum + invoice.total_cents, 0), overdue: open.filter(invoice => invoice.due_date < today).length };
}

/**
 * R3-CONTAS-1: unpaid bills of `month` with no (active) account — they still leave some account when paid, so they lower
 * the consolidated projection like the card invoices do. Same month rules as `projectAccounts` (paid/listed checklist).
 */
export function unlinkedBillsUntil(bills: Bill[], accounts: Pick<BankAccount, "id">[], checklist: ChecklistItem[], month: string, today: string): Array<Pick<Bill, "name" | "amount_cents" | "currency"> & { overdue: boolean }> {
  const paid = new Set(checklist.filter(item => item.paid).map(item => item.id));
  const listed = new Set(checklist.map(item => item.id));
  const accountIds = new Set(accounts.map(account => account.id));
  return bills
    .filter(bill => !paid.has(bill.id) && (checklist.length === 0 || listed.has(bill.id)))
    .filter(bill => bill.account_id === null || bill.account_id === undefined || !accountIds.has(bill.account_id))
    .map(bill => ({ name: bill.name, amount_cents: bill.amount_cents, currency: bill.currency, overdue: dueDateInMonth(month, bill.due_day).date < today }));
}
