import type { FinanceState, FormState } from "../../types";
import { currencyCode, idOrNull, trimmed } from "../records/formUtils";

/** MEL-23/26: card purchases are always BRL; otherwise the form currency (inherited from the account when one is chosen). */
export const transactionCurrency = (form: FormState): string =>
  (trimmed(form, "payment_method") || "card") === "card" && idOrNull(form, "card_id") !== null ? "BRL" : currencyCode(form);

/** CR-06: a credit card purchase must name its card (else it is left out of every invoice and limit). */
export const CARD_REQUIRED = "Escolha o cartão da compra.";

/** The most recently created transaction (highest id) among the loaded ones. */
const latestTransaction = (state: FinanceState) =>
  state.transactions.reduce<FinanceState["transactions"][number] | null>((latest, item) => (!latest || item.id > latest.id ? item : latest), null);

/**
 * CR-06 defaults: the payment method of the last transaction (a card purchase only when a card exists), and the card —
 * the only one when there is just one, else the card of the last purchase while it is still active.
 */
export function paymentDefaults(state: FinanceState): { payment_method: string; card_id: string } {
  const last = latestTransaction(state);
  const hasCards = state.cards.length > 0;
  let method = last?.payment_method || (hasCards ? "card" : "pix");
  if (method === "card" && !hasCards) method = "pix";
  return { payment_method: method, card_id: method === "card" ? preselectedCard(state, last?.card_id ?? null) : "" };
}

/** Card chosen by default for a card purchase: the only card, or `preferred` when it is still active; "" otherwise. */
export function preselectedCard(state: FinanceState, preferred: number | null = null): string {
  if (state.cards.length === 1) return String(state.cards[0]!.id);
  return preferred !== null && state.cards.some(card => card.id === preferred) ? String(preferred) : "";
}

/** Keys kept by "Salvar e lançar outro" (CR-15): when and how it was paid; what was bought starts over. */
const REPEATED_KEYS = ["date", "kind", "payment_method", "card_id", "account_id", "currency"] as const;

export function nextTransactionForm(form: FormState): FormState {
  const next: FormState = { description: "", amount: "", category_id: "", brand: "", notes: "", exchange_rate: "" };
  for (const key of REPEATED_KEYS) next[key] = form[key];
  return next;
}
