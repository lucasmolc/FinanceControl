import { api, ApiError } from "../../api/client";
import { currencyOf } from "../../lib/currencies";
import { currentMonth, dateInMonth, defaultDateForMonth, isMonth, todayISO } from "../../lib/date";
import { formatMoneyInput } from "../../lib/money";
import type { Bill, FormState, Goal } from "../../types";
import { findById, monthOr, checked, closedMonthMessage, currencyCode, dayValue, idOrNull, idText, inClosedMonth, money, moneyOr, moneyText, text, textOrNull, trimmed, validator } from "../records/formUtils";
import type { FormContext, RecordFormDefinition } from "../records/types";
import { BillFields, BillPaymentFields, GoalFields, GoalEntryFields } from "./formFields";
import { AUTO_RESERVE_CONFIRM, AUTO_RESERVE_TARGET_ERROR, isAutoReserveGoal, isAutoReserveError } from "./reserveModel";

const decimalsOf = (code: string | null | undefined) => currencyOf(code).decimals;

// ── Conta a pagar ────────────────────────────────────────────────────────────

export const billForm: RecordFormDefinition = {
  module: "bills",
  title: ctx => ctx.mode === "edit" ? "Editar conta a pagar" : "Nova conta a pagar",
  defaults: (_ctx, initial) => ({ due_day: "10", category_id: "", currency: "BRL", auto_debit: false, account_id: "", brand: "", icon: "", ...initial }),
  fromRecord: record => {
    const bill = record as Bill;
    const currency = currencyOf(bill.currency).code;
    return {
      name: bill.name, amount: formatMoneyInput(bill.amount_cents, decimalsOf(currency)), due_day: String(bill.due_day), category_id: idText(bill.category_id), category_name: bill.category_name ?? null,
      currency, auto_debit: Boolean(bill.auto_debit), account_id: idText(bill.account_id), account_name: bill.account_name ?? null,
      brand: bill.brand ?? "", brand_touched: Boolean(bill.brand), icon: bill.icon ?? "", icon_touched: Boolean(bill.icon),
      active_since: bill.active_since ?? "",
    };
  },
  validate: form => {
    const check = validator(form)
      .requiredText("name", "Informe o nome da conta.", 120)
      .money("amount", { required: true, decimals: decimalsOf(currencyCode(form)) })
      .day("due_day")
      .date("active_since", { required: false });
    // MEL-29: auto-debit needs the account that will be debited.
    if (checked(form, "auto_debit")) check.required("account_id", "Escolha a conta que será debitada.");
    return check.errors;
  },
  toPayload: (form, ctx) => {
    const autoDebit = checked(form, "auto_debit");
    const currency = currencyCode(form);
    return {
      name: trimmed(form, "name"),
      amount_cents: money(form, "amount", decimalsOf(currency)),
      due_day: dayValue(form, "due_day"),
      category_id: idOrNull(form, "category_id"),
      currency,
      auto_debit: autoDebit,
      account_id: autoDebit ? idOrNull(form, "account_id") : null,
      brand: textOrNull(form, "brand"),
      icon: textOrNull(form, "icon"),
      // R1-BILLS-1: blank on create = today (server); on edit, blank = "sempre existiu" (null).
      ...(ctx.mode === "create" ? (trimmed(form, "active_since") ? { active_since: trimmed(form, "active_since") } : {}) : { active_since: textOrNull(form, "active_since") }),
      ...(ctx.mode === "create" ? { recurring: true } : {}),
    };
  },
  apiFieldMap: { amount_cents: "amount" },
  successMessage: ctx => ctx.mode === "edit" ? "Conta a pagar atualizada." : "Conta a pagar adicionada.",
  // R2-REC-3: bills are usually entered in a batch; the next one keeps the category and the currency.
  saveAndNew: { label: "Salvar e criar outra", shortLabel: "Salvar e outra", message: "Conta a pagar adicionada. Pode cadastrar a próxima.",
    next: (form, ctx) => billForm.defaults!(ctx, { category_id: form.category_id ?? "", currency: form.currency ?? "BRL" }) },
  Fields: BillFields,
};

// ── Pagamento de conta ───────────────────────────────────────────────────────

const paymentMonth = (form: FormState, ctx: FormContext) => monthOr(form, "month", ctx.month);
const paymentCurrency = (form: FormState, ctx: FormContext) => currencyOf(findById(ctx.state.bills, form.bill_id)?.currency ?? text(form, "currency")).code;

export const billPaymentForm: RecordFormDefinition = {
  title: (_ctx, form) => `Pagar ${trimmed(form, "name") || "conta"}`,
  defaults: (ctx, initial) => {
    const billId = Number(initial.bill_id);
    const bill = ctx.state.bills.find(item => item.id === billId);
    const month = isMonth(String(initial.month ?? "")) ? String(initial.month) : ctx.month;
    const date = month === currentMonth() ? todayISO() : dateInMonth(month, bill?.due_day ?? 1);
    const amount = initial.amount ?? initial.amount_cents ?? bill?.amount_cents;
    const decimals = decimalsOf(bill?.currency);
    return {
      register_transaction: true, payment_method: "pix", account_id: "",
      ...initial,
      month, date: typeof initial.date === "string" && initial.date ? initial.date : date,
      name: initial.name ?? bill?.name ?? "",
      amount: moneyText(amount, cents => formatMoneyInput(cents, decimals)),
    };
  },
  validate: (form, ctx) => checked(form, "register_transaction")
    ? validator(form).date("date", { required: true, message: "Informe a data do pagamento." }).money("amount", { required: true, decimals: decimalsOf(paymentCurrency(form, ctx)) }).errors
    : {},
  submit: async (form, ctx) => {
    const base = { bill_id: Number(form.bill_id), month: paymentMonth(form, ctx), paid: true };
    if (!checked(form, "register_transaction")) { await api.setChecklist({ ...base, register_transaction: false }); return; }
    await api.setChecklist({
      ...base, register_transaction: true,
      date: trimmed(form, "date"),
      amount_cents: money(form, "amount", decimalsOf(paymentCurrency(form, ctx))) ?? undefined,
      account_id: idOrNull(form, "account_id"),
      payment_method: trimmed(form, "payment_method") || "other",
    });
  },
  apiFieldMap: { amount_cents: "amount" },
  successMessage: (_ctx, form) => checked(form, "register_transaction") ? "Conta paga e lançada como despesa." : "Conta marcada como paga.",
  submitLabel: () => "Confirmar pagamento",
  Fields: BillPaymentFields,
};

// ── Meta ─────────────────────────────────────────────────────────────────────

function goalPayload(form: FormState, ctx: FormContext): Record<string, unknown> {
  const currency = currencyCode(form);
  const decimals = decimalsOf(currency);
  return {
    name: trimmed(form, "name"),
    type: trimmed(form, "type") || "custom",
    target_cents: money(form, "target", decimals),
    target_date: textOrNull(form, "target_date"),
    notes: textOrNull(form, "notes"),
    currency,
    ...(ctx.mode === "create" ? { current_cents: moneyOr(form, "current", 0, decimals) } : {}),
  };
}

/** Cancelled "desligar o cálculo automático": the target keeps the server's explanation as field error. */
const autoReserveCancelled = () => new ApiError(AUTO_RESERVE_TARGET_ERROR, 400, { target_cents: AUTO_RESERVE_TARGET_ERROR });

export const goalForm: RecordFormDefinition = {
  module: "goals",
  title: ctx => ctx.mode === "edit" ? "Editar meta" : "Nova meta",
  defaults: (_ctx, initial) => ({ type: "custom", currency: "BRL", ...initial }),
  fromRecord: record => {
    const goal = record as Goal;
    const currency = currencyOf(goal.currency).code;
    return {
      name: goal.name, type: goal.type, target: formatMoneyInput(goal.target_cents, decimalsOf(currency)), target_date: goal.target_date ?? "", notes: goal.notes ?? "",
      currency, original_target_cents: goal.target_cents,
    };
  },
  validate: (form, ctx) => {
    const decimals = decimalsOf(currencyCode(form));
    const check = validator(form)
      .requiredText("name", "Informe o nome da meta.", 120)
      .money("target", { required: true, requiredMessage: "Informe o valor da meta.", decimals })
      .date("target_date")
      .maxLength("notes", 500);
    if (ctx.mode === "create") check.money("current", { rule: "nonNegative", decimals });
    return check.errors;
  },
  toPayload: goalPayload,
  /**
   * MEL-43: changing the target of the automatic emergency reserve asks to turn the automatic calculation off
   * (`detach_auto: true`). Also handles the server's 400 when the client did not know the goal was linked.
   */
  submit: async (form, ctx) => {
    const payload = goalPayload(form, ctx);
    if (ctx.mode === "create") { await api.create("goals", payload); return; }
    if (ctx.id === undefined) throw new Error("Registro sem identificador para edição.");
    const id = ctx.id;
    const targetChanged = payload.target_cents !== form.original_target_cents;
    const askDetach = async () => {
      if (!ctx.confirm) return true;
      return ctx.confirm(AUTO_RESERVE_CONFIRM);
    };
    if (targetChanged && isAutoReserveGoal(ctx.state.settings, id)) {
      if (!await askDetach()) throw autoReserveCancelled();
      await api.update("goals", id, { ...payload, detach_auto: true });
      return;
    }
    try {
      await api.update("goals", id, payload);
    } catch (reason) {
      if (!isAutoReserveError(reason)) throw reason;
      if (!await askDetach()) throw autoReserveCancelled();
      await api.update("goals", id, { ...payload, detach_auto: true });
    }
  },
  apiFieldMap: { target_cents: "target", current_cents: "current" },
  successMessage: ctx => ctx.mode === "edit" ? "Meta atualizada." : "Meta criada.",
  Fields: GoalFields,
};

// ── Aporte em meta ───────────────────────────────────────────────────────────

const findGoal = (form: FormState, ctx: FormContext) => findById(ctx.state.goals, form.goal_id);

const isWithdrawal = (form: FormState) => trimmed(form, "kind") === "withdrawal";

/** MEL-44: reason the movement cannot be saved (date in a closed month). */
const closedReason = (form: FormState, ctx: FormContext): string | undefined =>
  inClosedMonth(trimmed(form, "date"), ctx.closedMonths) ? closedMonthMessage(trimmed(form, "date")) : undefined;

export const goalEntryForm: RecordFormDefinition = {
  title: (ctx, form) => `${isWithdrawal(form) ? "Resgate" : "Novo aporte"} · ${findGoal(form, ctx)?.name ?? (text(form, "goal_name") || "meta")}`,
  defaults: (ctx, initial) => ({ date: defaultDateForMonth(ctx.month), kind: "contribution", ...initial }),
  validate: (form, ctx) => {
    const withdrawal = isWithdrawal(form);
    const goal = findGoal(form, ctx);
    const decimals = decimalsOf(goal?.currency);
    const check = validator(form)
      .date("date", { required: true })
      .openMonth("date", ctx.closedMonths)
      .money("amount", { required: true, decimals, requiredMessage: withdrawal ? "Informe um resgate maior que zero." : "Informe um aporte maior que zero." })
      .maxLength("notes", 500);
    const amount = money(form, "amount", decimals);
    if (withdrawal && goal && amount !== null && amount > goal.current_cents) check.check(false, "amount", "O resgate é maior que o valor guardado na meta.");
    return check.errors;
  },
  submit: async (form, ctx) => {
    const goalId = Number(form.goal_id);
    const decimals = decimalsOf(findGoal(form, ctx)?.currency);
    await api.addGoalEntry(goalId, { goal_id: goalId, date: trimmed(form, "date"), kind: isWithdrawal(form) ? "withdrawal" : "contribution", amount_cents: money(form, "amount", decimals), notes: textOrNull(form, "notes") });
  },
  apiFieldMap: { amount_cents: "amount" },
  successMessage: (_ctx, form) => isWithdrawal(form) ? "Resgate registrado na meta." : "Aporte registrado na meta.",
  submitLabel: (_ctx, form) => isWithdrawal(form) ? "Registrar resgate" : "Registrar aporte",
  submitDisabledReason: (ctx, form) => closedReason(form, ctx),
  usesClosedMonths: true,
  Fields: GoalEntryFields,
};
