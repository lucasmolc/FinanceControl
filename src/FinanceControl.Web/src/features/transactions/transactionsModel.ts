import { labelFor, paymentMethodLabels } from "../../lib/labels";
import type { Transaction } from "../../types";

export type KindFilter = "all" | "income" | "expense" | "investment";

export const kindFilters: { value: KindFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "income", label: "Receitas" },
  { value: "expense", label: "Despesas" },
  { value: "investment", label: "Investimentos" },
];

/** Lowercase text without accents, for forgiving search ("credito" finds "Crédito"). */
const normalizeSearch = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Category filter value: "" = all, "sem" = uncategorized, otherwise the category id. */
export const UNCATEGORIZED = "sem";

/** v1.4: veio de uma importação de fatura ou extrato. */
export const isImported = (item: Transaction): boolean => item.imported === true;

/** v1.4: rótulo da parcela ("6/10") de uma compra parcelada; null quando o lançamento não faz parte de uma série. */
export const installmentLabel = (item: Transaction): string | null =>
  item.installment_number && item.installment_count ? `${item.installment_number}/${item.installment_count}` : null;

/** Matches description, category and notes against the search text, the kind and the category filters. */
export function matchesTransaction(item: Transaction, search: string, kind: KindFilter, category = "", importedOnly = false): boolean {
  if (kind !== "all" && item.kind !== kind) return false;
  if (importedOnly && !isImported(item)) return false;
  if (category === UNCATEGORIZED ? item.category_id !== null : category !== "" && String(item.category_id) !== category) return false;
  const query = normalizeSearch(search);
  if (!query) return true;
  const haystack = normalizeSearch([item.description, item.category_name ?? "", item.notes ?? ""].join(" "));
  return query.split(/\s+/).every(term => haystack.includes(term));
}

export interface TransactionTotals { income: number; expense: number; investment: number; balance: number; }

/** BRL cents of a transaction (MEL-26): `base_amount_cents` for other currencies, the amount itself for BRL. */
export const baseAmount = (item: Transaction): number =>
  item.currency && item.currency !== "BRL" && typeof item.base_amount_cents === "number" ? item.base_amount_cents : item.amount_cents;

/** True when the amount is in another currency than BRL. */
export const isForeign = (item: Transaction): boolean => Boolean(item.currency && item.currency !== "BRL");

/** Month totals in BRL; balance = receitas − despesas − investimentos. */
export function transactionTotals(items: Transaction[]): TransactionTotals {
  const sum = (kind: Transaction["kind"]) => items.filter(item => item.kind === kind).reduce((total, item) => total + baseAmount(item), 0);
  const income = sum("income");
  const expense = sum("expense");
  const investment = sum("investment");
  return { income, expense, investment, balance: income - expense - investment };
}

/** Account name when linked, the card name for card purchases (MEL-23), otherwise the payment method label. */
export const accountOrMethod = (item: Transaction): string => item.account_name || item.card_name || labelFor(paymentMethodLabels, item.payment_method);

/** R2-LANC-1: short payment method for the medium-width table (the account name moves to the tooltip). */
const shortMethodLabels: Record<string, string> = { card: "Crédito", debit: "Débito", pix: "Pix", cash: "Dinheiro", transfer: "Transf.", boleto: "Boleto", other: "Outro" };
export const shortMethod = (method: string | null | undefined): string => (method ? shortMethodLabels[method] ?? labelFor(paymentMethodLabels, method) : "");

/** MEL-16: shown under the account select when the linked account was removed. */
export const REMOVED_ACCOUNT_HINT = "A conta vinculada foi removida. Escolha outra conta ou “Não movimentar conta”.";

/** Signed BRL effect of a transaction on the month balance: income +, expense and investment −. */
export const signedBase = (item: Transaction): number => (item.kind === "income" ? 1 : -1) * baseAmount(item);

/** Net of a day (CR-16 subtotal): receitas − despesas − investimentos, in BRL. */
export const dayNet = (items: Transaction[]): number => items.reduce((total, item) => total + signedBase(item), 0);

const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "sexta-feira, 12 de setembro" for an ISO date (calendar date, no timezone shift). */
export function dayLabel(iso: string): string {
  const [year = 1970, month = 1, day = 1] = iso.slice(0, 10).split("-").map(Number);
  return weekdayFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

const shortFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });

/** "Qui, 17/09" (phones, R1-LANC-3). */
export function shortDayLabel(iso: string): string {
  const [year = 1970, month = 1, day = 1] = iso.slice(0, 10).split("-").map(Number);
  const weekday = shortFormatter.format(new Date(Date.UTC(year, month - 1, day))).replace(".", "");
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

/** Toolbar order (R1-LANC-4): the date column is hidden while the list is grouped by day. */
export const SORT_OPTIONS = [
  { value: "date:desc", label: "Mais recentes primeiro" },
  { value: "date:asc", label: "Mais antigos primeiro" },
  { value: "description:asc", label: "Descrição (A–Z)" },
];

export interface SortChoice { column: string; direction: "asc" | "desc"; }

/** Toolbar value of a table sort ("date:desc"). */
export const sortOption = (sort: SortChoice | null): string => (sort ? `${sort.column}:${sort.direction}` : "date:desc");

export function sortFromOption(value: string): SortChoice {
  const [column = "date", direction] = value.split(":");
  return { column, direction: direction === "asc" ? "asc" : "desc" };
}

const KINDS: readonly string[] = ["all", "income", "expense", "investment"];

/** Filters from the hash query (`#/lancamentos?categoria=3&tipo=expense`, MEL-38 drill-down). Unknown values are ignored. */
export function filtersFromParams(params: Record<string, string> | undefined): { kind: KindFilter; category: string } {
  const tipo = params?.tipo ?? "";
  const categoria = params?.categoria ?? "";
  return {
    kind: KINDS.includes(tipo) ? tipo as KindFilter : "all",
    category: categoria === UNCATEGORIZED || /^\d+$/.test(categoria) ? categoria : "",
  };
}
