import { api } from "../../api/client";
import { currencyOf } from "../../lib/currencies";
import { todayISO } from "../../lib/date";
import { formatMoneyInput } from "../../lib/money";
import type { Card, Category, FinanceState, FormState, Subscription } from "../../types";
import { checked, currencyCode, dayValue, findById, idOrNull, idText, money, moneyOr, moneyText, text, textOrNull, trimmed, validator } from "../records/formUtils";
import type { FormContext, RecordFormDefinition } from "../records/types";
import { CategoryFields, InvoicePaymentFields, SubscriptionChargeFields, SubscriptionFields, CardFields } from "./formFields";
import { needsBillingDate, suggestedBucket } from "./catalogMetrics";
import { invoiceRef } from "./invoiceModel";
import { bucketFormValue, bucketPayload } from "../plan/bucketModel";

/** R3-REC-4: first expense category in the plan's "lazer" bucket while a plan is active ("" otherwise). */
const planLeisureCategory = (state: FinanceState): string => {
  if (typeof state.settings.plan_fixed_pct !== "number") return "";
  const category = state.categories.find(item => item.kind === "expense" && item.bucket === "lazer");
  return category ? String(category.id) : "";
};

const decimalsOf = (code: string | null | undefined) => currencyOf(code).decimals;

/** #rrggbb or null (MEL-35/39). */
const colorOrNull = (form: FormState, key = "color") => {
  const value = trimmed(form, key).toLowerCase();
  return /^#[0-9a-f]{6}$/.test(value) ? value : null;
};

// ── Categoria ────────────────────────────────────────────────────────────────

export const categoryForm: RecordFormDefinition = {
  module: "categories",
  title: ctx => ctx.mode === "edit" ? "Editar categoria" : "Nova categoria",
  // R2-REC-1: with a plan active the new category starts in a bucket (it follows Tipo until a bucket is picked by hand).
  defaults: (ctx, initial) => ({ kind: "expense", icon: "", color: "", bucket: suggestedBucket(ctx.state.settings, String(initial.kind ?? "expense")), ...initial }),
  fromRecord: record => {
    const category = record as Category;
    return {
      name: category.name, kind: category.kind, monthly_budget: category.monthly_budget_cents ? formatMoneyInput(category.monthly_budget_cents) : "",
      icon: category.icon ?? "", icon_touched: Boolean(category.icon), color: category.color ?? "",
      bucket: bucketFormValue(category),
    };
  },
  validate: form => {
    const check = validator(form).requiredText("name", "Informe o nome da categoria.", 120);
    if ((trimmed(form, "kind") || "expense") === "expense") check.money("monthly_budget", { rule: "nonNegative" });
    return check.errors;
  },
  toPayload: (form, ctx) => {
    const kind = trimmed(form, "kind") || "expense";
    return {
      name: trimmed(form, "name"),
      kind,
      monthly_budget_cents: kind === "expense" ? moneyOr(form, "monthly_budget", 0) : 0,
      icon: textOrNull(form, "icon"),
      color: colorOrNull(form),
      // MEL-45: plan bucket (income categories never enter the plan).
      bucket: kind === "income" ? null : bucketPayload(form),
      ...(ctx.mode === "create" ? { active: true } : {}),
    };
  },
  apiFieldMap: { monthly_budget_cents: "monthly_budget" },
  successMessage: ctx => ctx.mode === "edit" ? "Categoria atualizada." : "Categoria criada.",
  // R2-REC-3: categories are often created in a row; the next one keeps Tipo and the bucket.
  saveAndNew: { label: "Salvar e criar outra", shortLabel: "Salvar e outra", message: "Categoria criada. Pode criar a próxima.",
    next: (form, ctx) => categoryForm.defaults!(ctx, { kind: form.kind ?? "expense", bucket: form.bucket ?? "", bucket_touched: form.bucket_touched ?? false }) },
  Fields: CategoryFields,
};

// ── Assinatura ───────────────────────────────────────────────────────────────

export const subscriptionForm: RecordFormDefinition = {
  module: "subscriptions",
  title: ctx => ctx.mode === "edit" ? "Editar assinatura" : "Nova assinatura",
  // R4-REC-5: the billing day starts at today's day (a subscription created on the 18th is not assumed to bill on the 1st).
  // R3-REC-4: with the 70-20-10 plan active a new subscription starts in the "lazer" category (when there is one).
  defaults: (ctx, initial) => ({ frequency: "monthly", billing_day: String(Number(todayISO().slice(8, 10))), card_id: "", category_id: planLeisureCategory(ctx.state), currency: "BRL", auto_debit: false, account_id: "", brand: "", icon: "", ...initial }),
  fromRecord: record => {
    const item = record as Subscription;
    const currency = currencyOf(item.currency).code;
    return {
      name: item.name, amount: formatMoneyInput(item.amount_cents, decimalsOf(currency)), frequency: item.frequency, billing_day: String(item.billing_day),
      next_billing_date: item.next_billing_date ?? "", card_id: idText(item.card_id), card_name: item.card_name,
      category_id: idText(item.category_id), category_name: item.category_name, notes: item.notes ?? "",
      currency, auto_debit: Boolean(item.auto_debit), account_id: idText(item.account_id), account_name: item.account_name ?? null,
      brand: item.brand ?? "", brand_touched: Boolean(item.brand), icon: item.icon ?? "", icon_touched: Boolean(item.icon),
    };
  },
  validate: form => {
    const byDate = needsBillingDate({ frequency: trimmed(form, "frequency") || "monthly" });
    const check = validator(form)
      .requiredText("name", "Informe o nome da assinatura.", 120)
      .money("amount", { required: true, decimals: decimalsOf(currencyCode(form)) })
      .date("next_billing_date", { required: byDate, message: "Informe a data da próxima cobrança." })
      .maxLength("notes", 500);
    // Yearly/weekly schedules hide the day (it comes from the next charge date).
    if (!byDate) check.day("billing_day");
    // MEL-29: an automatic charge needs where it is paid: a bank account or the card.
    if (checked(form, "auto_debit") && idOrNull(form, "card_id") === null) check.required("account_id", "Escolha a conta que será debitada ou um cartão.");
    return check.errors;
  },
  toPayload: (form, ctx) => {
    const currency = currencyCode(form);
    const autoDebit = checked(form, "auto_debit");
    const cardId = idOrNull(form, "card_id");
    return {
      name: trimmed(form, "name"),
      amount_cents: money(form, "amount", decimalsOf(currency)),
      frequency: trimmed(form, "frequency") || "monthly",
      // R1-REC-2: yearly/weekly schedules count from the next charge date, so its day is the billing day.
      billing_day: needsBillingDate({ frequency: trimmed(form, "frequency") || "monthly" }) && /^\d{4}-\d{2}-\d{2}$/.test(trimmed(form, "next_billing_date"))
        ? Number(trimmed(form, "next_billing_date").slice(8, 10)) : dayValue(form, "billing_day"),
      next_billing_date: textOrNull(form, "next_billing_date"),
      card_id: cardId,
      category_id: idOrNull(form, "category_id"),
      notes: textOrNull(form, "notes"),
      currency,
      auto_debit: autoDebit,
      account_id: autoDebit && cardId === null ? idOrNull(form, "account_id") : null,
      brand: textOrNull(form, "brand"),
      icon: textOrNull(form, "icon"),
      ...(ctx.mode === "create" ? { active: true } : {}),
    };
  },
  apiFieldMap: { amount_cents: "amount" },
  successMessage: ctx => ctx.mode === "edit" ? "Assinatura atualizada." : "Assinatura adicionada.",
  // R2-REC-3: the next subscription keeps the frequency, card, category and currency.
  saveAndNew: { label: "Salvar e criar outra", shortLabel: "Salvar e outra", message: "Assinatura adicionada. Pode cadastrar a próxima.",
    next: (form, ctx) => subscriptionForm.defaults!(ctx, { frequency: form.frequency ?? "monthly", card_id: form.card_id ?? "", category_id: form.category_id ?? "", currency: form.currency ?? "BRL" }) },
  Fields: SubscriptionFields,
};

// ── Cobrança de assinatura (MEL-05) ──────────────────────────────────────────

const findSubscription = (form: FormState, ctx: FormContext) => findById(ctx.state.subscriptions, form.subscription_id);

export const subscriptionChargeForm: RecordFormDefinition = {
  title: (ctx, form) => `Lançar cobrança · ${findSubscription(form, ctx)?.name ?? (text(form, "name") || "assinatura")}`,
  defaults: (ctx, initial) => {
    const subscription = findSubscription(initial, ctx);
    const decimals = decimalsOf(subscription?.currency);
    return {
      date: todayISO(), account_id: "",
      payment_method: subscription?.card_id ? "card" : "other",
      ...initial,
      amount: moneyText(initial.amount ?? subscription?.amount_cents, cents => formatMoneyInput(cents, decimals)),
    };
  },
  validate: (form, ctx) => validator(form)
    .date("date", { required: true, message: "Informe a data da cobrança." })
    .money("amount", { required: true, decimals: decimalsOf(findSubscription(form, ctx)?.currency) })
    .errors,
  submit: async (form, ctx) => {
    const id = Number(form.subscription_id);
    const date = trimmed(form, "date");
    const result = await api.chargeSubscription(id, {
      date,
      amount_cents: money(form, "amount", decimalsOf(findSubscription(form, ctx)?.currency)) ?? undefined,
      account_id: idOrNull(form, "account_id"),
      payment_method: trimmed(form, "payment_method") || "other",
    });
    const chargeDate = result?.charge_date || date;
    return { run: () => api.undoSubscriptionCharge(id, chargeDate), message: "Cobrança desfeita." };
  },
  apiFieldMap: { amount_cents: "amount" },
  successMessage: () => "Cobrança lançada.",
  submitLabel: () => "Lançar cobrança",
  Fields: SubscriptionChargeFields,
};

// ── Cartão ───────────────────────────────────────────────────────────────────

export const cardForm: RecordFormDefinition = {
  module: "cards",
  title: ctx => ctx.mode === "edit" ? "Editar cartão" : "Novo cartão",
  defaults: (_ctx, initial) => ({ closing_day: "25", due_day: "5", brand: "", network: "", color: "", ...initial }),
  fromRecord: record => {
    const card = record as Card;
    return {
      name: card.name, personal_limit: formatMoneyInput(card.personal_limit_cents), real_limit: formatMoneyInput(card.real_limit_cents), closing_day: String(card.closing_day), due_day: String(card.due_day),
      brand: card.brand ?? "", brand_touched: Boolean(card.brand), network: card.network ?? "", color: card.color ?? "",
    };
  },
  validate: form => validator(form)
    .requiredText("name", "Informe o nome do cartão.", 120)
    .money("personal_limit", { rule: "nonNegative" })
    .money("real_limit", { rule: "nonNegative" })
    .day("closing_day")
    .day("due_day")
    .errors,
  toPayload: form => ({
    name: trimmed(form, "name"),
    personal_limit_cents: moneyOr(form, "personal_limit", 0),
    real_limit_cents: moneyOr(form, "real_limit", 0),
    closing_day: dayValue(form, "closing_day"),
    due_day: dayValue(form, "due_day"),
    brand: textOrNull(form, "brand"),
    network: textOrNull(form, "network"),
    color: colorOrNull(form),
  }),
  apiFieldMap: { personal_limit_cents: "personal_limit", real_limit_cents: "real_limit" },
  successMessage: ctx => ctx.mode === "edit" ? "Cartão atualizado." : "Cartão adicionado.",
  Fields: CardFields,
};

// ── Pagamento de fatura (MEL-23) ─────────────────────────────────────────────

const findCard = (form: FormState, ctx: FormContext) => findById(ctx.state.cards, form.card_id);

export const invoicePaymentForm: RecordFormDefinition = {
  title: (ctx, form) => `Pagar ${invoiceRef(text(form, "month"))} · ${findCard(form, ctx)?.name ?? (text(form, "card_name") || "cartão")}`,
  defaults: (_ctx, initial) => ({
    date: todayISO(), account_id: "",
    ...initial,
    amount: moneyText(initial.amount ?? initial.total_cents, formatMoneyInput),
  }),
  validate: form => validator(form)
    .required("account_id", "Selecione a conta usada no pagamento.")
    .date("date", { required: true, message: "Informe a data do pagamento." })
    .money("amount", { required: true })
    .errors,
  submit: async form => {
    const cardId = Number(form.card_id);
    const month = trimmed(form, "month");
    await api.payInvoice(cardId, month, {
      account_id: idOrNull(form, "account_id") ?? 0,
      date: trimmed(form, "date"),
      amount_cents: money(form, "amount") ?? undefined,
    });
    return { run: () => api.undoInvoicePayment(cardId, month), message: "Pagamento da fatura desfeito." };
  },
  apiFieldMap: { amount_cents: "amount" },
  successMessage: () => "Fatura paga. A saída foi registrada na conta escolhida.",
  submitLabel: () => "Pagar fatura",
  Fields: InvoicePaymentFields,
};
