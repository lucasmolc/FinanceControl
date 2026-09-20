import { api } from "../../api/client";
import { currencyOf } from "../../lib/currencies";
import { defaultDateForMonth } from "../../lib/date";
import { formatMoneyInput, formatRate } from "../../lib/money";
import type { FormState, Transaction } from "../../types";
import { idOrNull, idText, money, rateOrNull, textOrNull, trimmed, validator } from "../records/formUtils";
import type { FormContext, RecordFormDefinition } from "../records/types";
import { TransactionFields } from "./formFields";
import { CARD_REQUIRED, nextTransactionForm, paymentDefaults, preselectedCard, transactionCurrency } from "./formModel";
import {
  amountIsTotal, closedInstallmentMonths, installmentCount, installmentNumber, installmentPlan,
  MAX_INSTALLMENTS, MIN_INSTALLMENTS, repeatMode,
} from "./installments";

const COUNT_RANGE = `Informe de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas.`;
const NUMBER_REQUIRED = "Informe a parcela atual.";
const NUMBER_ABOVE_COUNT = "A parcela atual não pode ser maior que o total de parcelas.";
const TOTAL_TOO_SMALL = "O valor total precisa cobrir ao menos um centavo por parcela.";

/** Dados da compra, iguais para o lançamento simples e para cada parcela da série. */
function transactionPayload(form: FormState): Record<string, unknown> {
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
}

/**
 * "Todo mês, sem prazo" é uma assinatura: é ela que já repete indefinidamente, aparece nas faturas seguintes, tem o
 * valor editável valendo só para as próximas cobranças e termina ao ser desativada. A cobrança desta data entra
 * junto, pelo fluxo de cobrança da assinatura, que a registra e evita duplicar com o débito automático.
 */
async function createSubscription(form: FormState): Promise<void> {
  const paymentMethod = trimmed(form, "payment_method") || "card";
  const cardId = paymentMethod === "card" ? idOrNull(form, "card_id") : null;
  const accountId = cardId === null ? idOrNull(form, "account_id") : null;
  const currency = transactionCurrency(form);
  const date = trimmed(form, "date");
  const created = await api.create("subscriptions", {
    name: trimmed(form, "description"),
    amount_cents: money(form, "amount", currencyOf(currency).decimals),
    frequency: "monthly",
    billing_day: Number(date.slice(8, 10)),
    card_id: cardId,
    category_id: idOrNull(form, "category_id"),
    notes: textOrNull(form, "notes"),
    currency,
    // Sem cartão nem conta não há de onde debitar, então a cobrança automática fica desligada.
    auto_debit: cardId !== null || accountId !== null,
    account_id: accountId,
    brand: textOrNull(form, "brand"),
    active: true,
  });
  await api.chargeSubscription(created.id, cardId !== null
    ? { date }
    : { date, account_id: accountId, payment_method: paymentMethod });
}

export const transactionForm: RecordFormDefinition = {
  module: "transactions",
  title: ctx => ctx.mode === "edit" ? "Editar lançamento" : "Novo lançamento",
  defaults: (ctx, initial) => {
    const form: FormState = { date: defaultDateForMonth(ctx.month), kind: "expense", ...paymentDefaults(ctx.state), category_id: "", account_id: "", currency: "BRL", exchange_rate: "", brand: "",
      repeat: "none", amount_basis: "installment", installment_number: "1", installment_count: "", ...initial };
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
    if (repeatMode(form) === "installments") validateInstallments(form, ctx, check, currencyOf(currency).decimals);
    return check.errors;
  },
  toPayload: transactionPayload,
  submit: async (form, ctx) => {
    if (ctx.mode === "edit") {
      if (ctx.id === undefined) throw new Error("Lançamento sem identificador para edição.");
      await api.update("transactions", ctx.id, transactionPayload(form));
      return;
    }
    if (repeatMode(form) === "forever") return createSubscription(form);

    const plan = installmentPlan(form, currencyOf(transactionCurrency(form)).decimals);
    // Sem parcelamento, um lançamento só; com ele, o servidor grava a série inteira em uma operação.
    await api.create("transactions", plan === null ? transactionPayload(form) : {
      ...transactionPayload(form),
      amount_cents: plan.perInstallmentCents,
      installment_count: plan.count,
      installment_number: plan.number,
      ...(amountIsTotal(form) ? { installment_total_cents: plan.totalCents } : {}),
    });
  },
  apiFieldMap: { amount_cents: "amount", installment_total_cents: "amount" },
  successMessage: (ctx, form) => {
    if (ctx.mode === "edit") return "Lançamento atualizado.";
    if (repeatMode(form) === "forever") return "Assinatura criada e a cobrança deste mês lançada.";
    const count = installmentCount(form);
    return repeatMode(form) === "installments" && count !== null ? `Compra em ${count}x lançada.` : "Lançamento registrado.";
  },
  saveAndNew: { label: "Salvar e lançar outro", next: form => nextTransactionForm(form), message: "Lançamento registrado. Pode lançar o próximo." },
  size: "lg",
  // R3-REC-2: closed months are known before Salvar (the API still blocks as a fallback).
  usesClosedMonths: true,
  Fields: TransactionFields,
};

/** Parcelamento: números dentro do limite, parcela atual não maior que o total e nenhum mês da série fechado. */
function validateInstallments(form: FormState, ctx: FormContext, check: ReturnType<typeof validator>, decimals: number) {
  const count = installmentCount(form);
  const number = installmentNumber(form);
  check.check(count !== null && count >= MIN_INSTALLMENTS && count <= MAX_INSTALLMENTS, "installment_count", COUNT_RANGE);
  check.check(number !== null, "installment_number", NUMBER_REQUIRED);
  if (count !== null && number !== null) check.check(number <= count, "installment_number", NUMBER_ABOVE_COUNT);

  const plan = installmentPlan(form, decimals);
  if (plan === null) {
    // Números válidos e ainda assim sem plano: o total não cobre um centavo por parcela.
    const amount = money(form, "amount", decimals);
    if (count !== null && number !== null && number <= count && amount !== null && amount > 0) check.check(false, "amount", TOTAL_TOO_SMALL);
    return;
  }
  const closed = closedInstallmentMonths(plan, trimmed(form, "date"), ctx.closedMonths);
  if (closed.length > 0) check.check(false, "date", `Parcelas caem em meses fechados (${closed.join(", ")}). Reabra para lançar a compra inteira.`);
}
