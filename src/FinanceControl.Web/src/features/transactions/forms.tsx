import { currencyOf } from "../../lib/currencies";
import { defaultDateForMonth } from "../../lib/date";
import { formatMoneyInput, formatRate } from "../../lib/money";
import type { FormState, Transaction } from "../../types";
import { idOrNull, idText, money, rateOrNull, textOrNull, trimmed, validator } from "../records/formUtils";
import type { RecordFormDefinition } from "../records/types";
import { TransactionFields } from "./formFields";
import { CARD_REQUIRED, nextTransactionForm, paymentDefaults, preselectedCard, transactionCurrency } from "./formModel";

export const transactionForm: RecordFormDefinition = {
  module: "transactions",
  title: ctx => ctx.mode === "edit" ? "Editar lançamento" : "Novo lançamento",
  defaults: (ctx, initial) => {
    const form: FormState = { date: defaultDateForMonth(ctx.month), kind: "expense", ...paymentDefaults(ctx.state), category_id: "", account_id: "", currency: "BRL", exchange_rate: "", brand: "", ...initial };
    // CR-06: a card purchase opens with the only card already chosen.
    if (trimmed(form, "payment_method") === "card" && !trimmed(form, "card_id")) form.card_id = preselectedCard(ctx.state);
    return form;
  },
  fromRecord: record => {
    const item = record as Transaction;
    const currency = currencyOf(item.currency).code;
    return {
      date: item.date, description: item.description, kind: item.kind, amount: formatMoneyInput(item.amount_cents, currencyOf(currency).decimals),
      category_id: item.category_id === null ? "" : String(item.category_id), category_name: item.category_name,
      payment_method: item.payment_method, account_id: item.account_id === null || item.account_id === undefined ? "" : String(item.account_id),
      account_name: item.account_name ?? null, notes: item.notes ?? "",
      card_id: idText(item.card_id), card_name: item.card_name ?? null,
      currency, exchange_rate: currency === "BRL" ? "" : formatRate(item.exchange_rate), exchange_rate_touched: Boolean(item.exchange_rate && currency !== "BRL"),
      brand: item.brand ?? "", brand_touched: Boolean(item.brand),
    };
  },
  validate: (form, ctx) => {
    const currency = transactionCurrency(form);
    const check = validator(form)
      .date("date", { required: true, message: "Informe a data." })
      .openMonth("date", ctx.closedMonths)
      .requiredText("description", "Informe uma descrição.", 160)
      .money("amount", { required: true, decimals: currencyOf(currency).decimals })
      .maxLength("notes", 500);
    if (currency !== "BRL") check.rate("exchange_rate");
    if ((trimmed(form, "payment_method") || "card") === "card") check.check(idOrNull(form, "card_id") !== null, "card_id", CARD_REQUIRED);
    return check.errors;
  },
  toPayload: form => {
    const paymentMethod = trimmed(form, "payment_method") || "card";
    // MEL-23: a card purchase goes to the invoice; the account only moves when the invoice is paid.
    const cardId = paymentMethod === "card" ? idOrNull(form, "card_id") : null;
    const currency = transactionCurrency(form);
    return {
      date: trimmed(form, "date"),
      description: trimmed(form, "description"),
      kind: trimmed(form, "kind") || "expense",
      amount_cents: money(form, "amount", currencyOf(currency).decimals),
      category_id: idOrNull(form, "category_id"),
      payment_method: paymentMethod,
      account_id: cardId === null ? idOrNull(form, "account_id") : null,
      card_id: cardId,
      notes: textOrNull(form, "notes"),
      currency,
      // MEL-26: BRL per unit; null lets the server use the latest known rate.
      exchange_rate: currency === "BRL" ? null : rateOrNull(form, "exchange_rate"),
      brand: textOrNull(form, "brand"),
    };
  },
  apiFieldMap: { amount_cents: "amount" },
  successMessage: ctx => ctx.mode === "edit" ? "Lançamento atualizado." : "Lançamento registrado.",
  saveAndNew: { label: "Salvar e lançar outro", next: form => nextTransactionForm(form), message: "Lançamento registrado. Pode lançar o próximo." },
  size: "lg",
  // R3-REC-2: closed months are known before Salvar (the API still blocks as a fallback).
  usesClosedMonths: true,
  Fields: TransactionFields,
};
