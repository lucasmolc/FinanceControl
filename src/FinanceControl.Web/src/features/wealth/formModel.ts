import { currencyOf } from "../../lib/currencies";
import type { FormState } from "../../types";
import { accountCurrency, idOrNull, trimmed } from "../records/formUtils";
import type { FormContext } from "../records/types";

/** MEL-26: a transfer between accounts in different currencies needs the amount credited in the destination. */
export const isCrossCurrencyTransfer = (form: FormState, ctx: Pick<FormContext, "state">): boolean => {
  if (trimmed(form, "kind") !== "transfer_out") return false;
  const target = idOrNull(form, "related_account_id");
  return target !== null && accountCurrency(ctx.state, form.account_id) !== accountCurrency(ctx.state, target);
};

const rateFormatter = new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 6 });

/**
 * Exchange rate implied by a cross-currency transfer (MEL-26): "1 USD = 5,2 BRL" (units of the sent currency per unit
 * received). Null until both amounts are valid and positive.
 */
export function impliedRate(sentMinor: number | null, sentCurrency: string, receivedMinor: number | null, receivedCurrency: string): string | null {
  if (!sentMinor || !receivedMinor || sentMinor <= 0 || receivedMinor <= 0) return null;
  const sent = sentMinor / 10 ** currencyOf(sentCurrency).decimals;
  const received = receivedMinor / 10 ** currencyOf(receivedCurrency).decimals;
  return `Cotação usada: 1 ${receivedCurrency} = ${rateFormatter.format(sent / received)} ${sentCurrency}`;
}
