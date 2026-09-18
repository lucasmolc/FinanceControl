import { api } from "../../api/client";
import { bankEntryKindLabels, goalEntryKindLabels, investmentEntryKindLabels, labelFor, transactionKindLabels } from "../../lib/labels";
import type { BankStatementItem, GoalEntry, InvestmentEntry } from "../../types";

export interface HistoryAction { label: string; run: () => void; }

/** One line of a movement history (goal, investment or bank statement). */
export interface HistoryRow {
  key: string;
  date: string;
  kindLabel: string;
  description: string | null;
  /** Signed effect on the balance; null when only the absolute value is known (e.g. balance adjustments). */
  deltaCents: number | null;
  /** Raw amount; shown as "Novo saldo" when `deltaCents` is null. */
  amountCents: number;
  /** Extra context, e.g. the other account of a transfer. */
  detail: string | null;
  notes: string | null;
  /** Estorno (reversal) API call; absent when the row cannot be reversed from here. */
  reverse?: () => Promise<void>;
  /** Undoes the estorno (MEL-13); offered as "Desfazer" in the notice after reversing. */
  restore?: () => Promise<unknown>;
  /** Alternative action (e.g. remove the linked transaction). */
  action?: HistoryAction;
}

/**
 * CR-20: balance right after each movement, walking back from the current balance (rows newest first, as listed).
 * An adjustment without a stored delta sets the balance to its amount; rows older than it are unknown (null).
 */
export function runningBalances(rows: Pick<HistoryRow, "deltaCents" | "amountCents">[], current: number | null | undefined): Array<number | null> {
  let balance: number | null = typeof current === "number" ? current : null;
  return rows.map(row => {
    if (balance === null) return null;
    if (row.deltaCents === null) {
      balance = null;
      return row.amountCents;
    }
    const after = balance;
    balance -= row.deltaCents;
    return after;
  });
}

/** Kind of a goal movement; rows from before MEL-04 have no kind (negative amounts were withdrawals). */
const goalEntryKind = (entry: Pick<GoalEntry, "kind" | "amount_cents">): string =>
  entry.kind === "withdrawal" || (!entry.kind && entry.amount_cents < 0) ? "withdrawal" : "contribution";

export function goalEntryRows(goalId: number, entries: GoalEntry[]): HistoryRow[] {
  return entries.map(entry => {
    const kind = goalEntryKind(entry);
    const amount = Math.abs(entry.amount_cents);
    return {
      key: `goal-entry-${entry.id}`,
      date: entry.date,
      kindLabel: labelFor(goalEntryKindLabels, kind),
      description: null,
      deltaCents: kind === "withdrawal" ? -amount : amount,
      amountCents: amount,
      detail: null,
      notes: entry.notes,
      reverse: () => api.removeGoalEntry(goalId, entry.id),
      restore: () => api.restoreGoalEntry(goalId, entry.id),
    };
  });
}

/** Signed effect of an investment movement on the current value; null for adjustments (amount = new value). */
export function investmentDelta(kind: string, amountCents: number): number | null {
  switch (kind) {
    case "deposit":
    case "yield": return amountCents;
    case "withdrawal": return -amountCents;
    default: return null;
  }
}

export function investmentEntryRows(investmentId: number, entries: InvestmentEntry[]): HistoryRow[] {
  return entries.map(entry => ({
    key: `investment-entry-${entry.id}`,
    date: entry.date,
    kindLabel: labelFor(investmentEntryKindLabels, entry.kind),
    description: null,
    deltaCents: investmentDelta(entry.kind, entry.amount_cents),
    amountCents: entry.amount_cents,
    detail: null,
    notes: entry.notes,
    reverse: () => api.removeInvestmentEntry(investmentId, entry.id),
    restore: () => api.restoreInvestmentEntry(investmentId, entry.id),
  }));
}

/** Signed balance effect of a statement line; derives it from the kind for rows created before the detailed history. */
export function bankDelta(item: Pick<BankStatementItem, "source" | "kind" | "amount_cents" | "delta_cents">): number | null {
  if (item.delta_cents !== null && item.delta_cents !== undefined) return item.delta_cents;
  if (item.source === "transaction") return item.kind === "income" ? item.amount_cents : -item.amount_cents;
  switch (item.kind) {
    case "deposit":
    case "transfer_in": return item.amount_cents;
    case "withdrawal":
    case "transfer_out": return -item.amount_cents;
    default: return null;
  }
}

function bankDetail(item: BankStatementItem): string | null {
  if (!item.related_account_name) return item.source === "transaction" ? "Lançamento" : null;
  if (item.kind === "transfer_in") return `De ${item.related_account_name}`;
  if (item.kind === "transfer_out") return `Para ${item.related_account_name}`;
  return item.related_account_name;
}

/** Bank statement lines; entries can be reversed, linked transactions offer `onRemoveTransaction` instead. */
export function bankStatementRows(accountId: number, items: BankStatementItem[], onRemoveTransaction: (id: number, label: string) => void): HistoryRow[] {
  return items.map(item => {
    const isTransaction = item.source === "transaction";
    const row: HistoryRow = {
      key: `${item.source}-${item.id}`,
      date: item.date,
      kindLabel: isTransaction ? labelFor(transactionKindLabels, item.kind) : labelFor(bankEntryKindLabels, item.kind),
      description: item.description || null,
      deltaCents: bankDelta(item),
      amountCents: item.amount_cents,
      detail: bankDetail(item),
      notes: item.notes,
    };
    if (isTransaction) row.action = { label: "Remover lançamento", run: () => onRemoveTransaction(item.id, item.description || "Lançamento") };
    else {
      row.reverse = () => api.removeBankEntry(accountId, item.id);
      row.restore = () => api.restoreBankEntry(accountId, item.id);
    }
    return row;
  });
}
