import { daysBetween } from "../../lib/date";
import { daysLabel } from "../../lib/labels";
import type { CardInvoiceRow } from "../../types";
import { invoiceMonthLabel } from "../catalog/invoiceModel";
import type { StatusLabel } from "./billStatus";
import { paidDate } from "./billStatus";
import { formatDayMonth } from "./dueDates";

/** R1-BILLS-2: a card invoice listed in Contas a pagar next to the bills (overdue card debt is never hidden). */
export interface InvoiceDueRow {
  invoice: CardInvoiceRow;
  paid: boolean;
  /** Days from today to the due date (negative = overdue). */
  daysUntil: number;
  /** Due before the month on screen (an earlier invoice still unpaid). */
  carried: boolean;
  status: StatusLabel;
}

const isPaid = (invoice: CardInvoiceRow) => Boolean(invoice.paid) || invoice.status === "paga";

/** Status line of an invoice, with the bills' vocabulary: "Vencida há N dias", "Vence em …", "Paga em dd/mm", "Não paga" (closed month). */
export function invoiceDueStatus(invoice: CardInvoiceRow, today: string, closed = false): StatusLabel {
  if (isPaid(invoice)) {
    const date = paidDate(invoice.paid?.date ?? null);
    return { label: date ? `Paga em ${formatDayMonth(date)}` : "Paga", tone: "positive" };
  }
  if (closed) return { label: "Não paga", tone: "neutral" };
  if (invoice.status === "aberta") return { label: `Aberta · fecha em ${formatDayMonth(invoice.closing_date)}`, tone: "neutral" };
  const days = daysBetween(today, invoice.due_date);
  if (days < 0) return { label: `Vencida há ${daysLabel(-days)}`, tone: "negative" };
  if (days === 0) return { label: "Vence hoje", tone: "warning" };
  return { label: `Vence em ${formatDayMonth(invoice.due_date)} (${daysLabel(days)})`, tone: days <= 5 ? "warning" : "neutral" };
}

/** Rows for the month: overdue first (oldest first), then the ones to pay by due date, paid ones last. */
export function buildInvoiceRows(invoices: CardInvoiceRow[], month: string, today: string, closed = false): InvoiceDueRow[] {
  const rows = invoices
    .filter(invoice => invoice.total_cents > 0 || isPaid(invoice))
    .map(invoice => ({
      invoice,
      paid: isPaid(invoice),
      daysUntil: daysBetween(today, invoice.due_date),
      carried: invoice.month < month,
      status: invoiceDueStatus(invoice, today, closed),
    }))
    .sort((left, right) => left.invoice.due_date.localeCompare(right.invoice.due_date) || left.invoice.card_name.localeCompare(right.invoice.card_name, "pt-BR"));
  const overdue = (row: InvoiceDueRow) => !row.paid && row.daysUntil < 0;
  return [...rows.filter(overdue), ...rows.filter(row => !row.paid && !overdue(row)), ...rows.filter(row => row.paid)];
}

/** "Fatura Nubank · Agosto/2026". */
export const invoiceRowTitle = (invoice: Pick<CardInvoiceRow, "card_name" | "month">): string => `Fatura ${invoice.card_name} · ${invoiceMonthLabel(invoice.month)}`;

/** R2-BILLS-1: phone title of an invoice row — "Agosto/2026" under "Faturas de cartão" (the card goes to the subtitle, next to its logo). */
export const invoiceMonthTitle = (invoice: Pick<CardInvoiceRow, "month">): string => invoiceMonthLabel(invoice.month);
