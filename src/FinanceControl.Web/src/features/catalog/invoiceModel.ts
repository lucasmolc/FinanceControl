import { formatMonthLabel } from "../../lib/date";
import type { Card, CardInvoice } from "../../types";

export type InvoiceTone = "neutral" | "positive" | "negative" | "warning" | "accent";

const invoiceStatusLabels: Record<string, string> = { aberta: "Aberta", fechada: "Fechada", vencida: "Vencida", paga: "Paga" };
const invoiceStatusTones: Record<string, InvoiceTone> = { aberta: "accent", fechada: "warning", vencida: "negative", paga: "positive" };

export const invoiceStatusLabel = (status: string): string => invoiceStatusLabels[status] ?? status;
export const invoiceStatusTone = (status: string): InvoiceTone => invoiceStatusTones[status] ?? "neutral";

/** CR-05: one competency format everywhere — "Outubro/2026" (invoices are identified by their due month). */
export function invoiceMonthLabel(month: string): string {
  const name = formatMonthLabel(month).replace(/\s+de\s+\d{4}$/, "");
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}/${month.slice(0, 4)}`;
}

/** "Fatura de Outubro/2026". */
export const invoiceTitle = (month: string): string => `Fatura de ${invoiceMonthLabel(month)}`;

/** "fatura de Outubro/2026" (inside sentences and accessible names). */
export const invoiceRef = (month: string): string => `fatura de ${invoiceMonthLabel(month)}`;

/** @deprecated kept for older callers; use `invoiceMonthLabel`. */
export const invoiceMonthShort = invoiceMonthLabel;

/** CR-05 states: Vencida · Fechada · Atual (collecting purchases now) · Futura · Paga. */
export type InvoicePhase = "vencida" | "fechada" | "atual" | "futura" | "paga";

const phaseLabels: Record<InvoicePhase, string> = { vencida: "Vencida", fechada: "Fechada", atual: "Atual", futura: "Futura", paga: "Paga" };
const phaseTones: Record<InvoicePhase, InvoiceTone> = { vencida: "negative", fechada: "warning", atual: "accent", futura: "neutral", paga: "positive" };
export const invoicePhaseLabel = (phase: InvoicePhase): string => phaseLabels[phase];
export const invoicePhaseTone = (phase: InvoicePhase): InvoiceTone => phaseTones[phase];

/**
 * Phase of an invoice on `today`: the server status (paga/vencida/fechada) wins; an open ("aberta") one is the current
 * invoice while its purchase period has started, and a future one before that.
 */
export function invoicePhase(invoice: Pick<CardInvoice, "status" | "paid" | "period_start">, today: string): InvoicePhase {
  if (invoice.paid || invoice.status === "paga") return "paga";
  if (invoice.status === "vencida") return "vencida";
  if (invoice.status === "fechada") return "fechada";
  return invoice.period_start > today ? "futura" : "atual";
}

export interface InvoiceGroups<T> {
  /** Unpaid closed invoices, overdue first (oldest first): what to pay now. */
  due: T[];
  /** The invoice collecting purchases today (null when none). */
  current: T | null;
  /** Future and paid invoices, folded by default (future first, then paid newest first). */
  others: T[];
}

/** CR-05 order: overdue and closed ones with something to pay first, then the current invoice, the rest folded. */
export function groupInvoices<T extends Pick<CardInvoice, "month" | "status" | "paid" | "period_start" | "total_cents">>(invoices: T[], today: string): InvoiceGroups<T> {
  const byMonth = [...invoices].sort((left, right) => left.month.localeCompare(right.month));
  const phase = (item: T) => invoicePhase(item, today);
  const current = byMonth.find(item => phase(item) === "atual") ?? null;
  const toPay = (item: T, wanted: InvoicePhase) => phase(item) === wanted && item.total_cents > 0;
  const due = [...byMonth.filter(item => toPay(item, "vencida")), ...byMonth.filter(item => toPay(item, "fechada"))];
  // Empty closed invoices have nothing to pay: they wait folded with the future and paid ones.
  const empty = byMonth.filter(item => (phase(item) === "vencida" || phase(item) === "fechada") && item.total_cents <= 0);
  return {
    due,
    current,
    others: [...byMonth.filter(item => item !== current && (phase(item) === "futura" || phase(item) === "atual")), ...empty, ...byMonth.filter(item => phase(item) === "paga").reverse()],
  };
}

/** Unpaid invoices with something to pay can be paid; paid ones can be undone. */
export const canPayInvoice = (invoice: Pick<CardInvoice, "status" | "paid" | "total_cents">): boolean => !invoice.paid && invoice.status !== "paga" && invoice.total_cents > 0;

/** The open invoice (the one collecting purchases today); falls back to the latest one. */
export function currentInvoice(invoices: CardInvoice[]): CardInvoice | null {
  const sorted = [...invoices].sort((left, right) => left.month.localeCompare(right.month));
  return sorted.find(item => item.status === "aberta") ?? sorted[sorted.length - 1] ?? null;
}

export interface CardLimitView {
  /** personal_limit (or real_limit when personal is 0). */
  limitCents: number;
  usedCents: number;
  availableCents: number;
  percent: number;
  tone: "warning" | "negative" | undefined;
  label: string;
}

/** Limit usage from the unpaid invoices (MEL-23); null without a limit or when the server does not send the figures. */
export function cardLimitView(card: Pick<Card, "personal_limit_cents" | "real_limit_cents" | "unpaid_invoices_cents" | "available_limit_cents">): CardLimitView | null {
  const limitCents = card.personal_limit_cents > 0 ? card.personal_limit_cents : card.real_limit_cents;
  if (limitCents <= 0 || card.unpaid_invoices_cents === undefined) return null;
  const usedCents = card.unpaid_invoices_cents;
  const availableCents = card.available_limit_cents ?? limitCents - usedCents;
  const percent = usedCents / limitCents * 100;
  const tone = percent > 100 ? "negative" : percent >= 80 ? "warning" : undefined;
  const label = percent > 100 ? "Acima do limite" : percent >= 80 ? "Perto do limite" : "Dentro do limite";
  return { limitCents, usedCents, availableCents, percent, tone, label };
}

/** Cards with closed (not yet paid) invoices: unpaid total minus the open invoice (MEL-23, dashboard line). */
export function invoicesToPay(cards: Card[]): { card: Card; cents: number }[] {
  return cards
    .map(card => ({ card, cents: (card.unpaid_invoices_cents ?? 0) - Math.max(0, card.open_invoice_cents ?? 0) }))
    .filter(item => item.cents > 0);
}
