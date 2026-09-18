import { api } from "../../api/client";
import { currencyOf } from "../../lib/currencies";
import { defaultDateForMonth } from "../../lib/date";
import type { BankAccount, FormState, Investment } from "../../types";
import { accountCurrency, closedMonthMessage, currencyCode, findById, idOrNull, inClosedMonth, money, moneyOr, textOrNull, trimmed, validator } from "../records/formUtils";
import { isCrossCurrencyTransfer } from "./formModel";
import { hasTransferTarget, TRANSFER_UNAVAILABLE } from "./transfer";
import type { FormContext, RecordFormDefinition } from "../records/types";
import { InvestmentFields, InvestmentEntryFields, BankAccountFields, BankEntryFields } from "./formFields";

const decimalsOf = (code: string | null | undefined) => currencyOf(code).decimals;

/** Brand/logo payload shared by accounts and investments (MEL-33): blank → null. */
const brandPayload = (form: FormState) => ({ brand: textOrNull(form, "brand"), logo_data: textOrNull(form, "logo_data") });

// ── Investimento ─────────────────────────────────────────────────────────────

export const investmentForm: RecordFormDefinition = {
  module: "investments",
  title: ctx => ctx.mode === "edit" ? "Editar investimento" : "Novo investimento",
  defaults: (_ctx, initial) => ({ type: "fixed_income", currency: "BRL", brand: "", logo_data: "", ...initial }),
  fromRecord: record => {
    const item = record as Investment;
    return {
      name: item.name, type: item.type, institution: item.institution ?? "", benchmark: item.benchmark ?? "", liquidity: item.liquidity ?? "",
      currency: currencyOf(item.currency).code, brand: item.brand ?? "", brand_touched: Boolean(item.brand), logo_data: item.logo_data ?? "",
    };
  },
  validate: (form, ctx) => {
    const decimals = decimalsOf(currencyCode(form));
    const check = validator(form)
      .requiredText("name", "Informe o nome do investimento.", 120)
      .maxLength("institution", 120)
      .maxLength("benchmark", 80)
      .maxLength("liquidity", 80);
    if (ctx.mode === "create") check.money("invested", { required: true, rule: "nonNegative", requiredMessage: "Informe o valor aplicado.", decimals }).money("current", { rule: "nonNegative", decimals });
    return check.errors;
  },
  toPayload: (form, ctx) => {
    const payload: Record<string, unknown> = {
      name: trimmed(form, "name"),
      type: trimmed(form, "type") || "fixed_income",
      institution: textOrNull(form, "institution"),
      benchmark: textOrNull(form, "benchmark"),
      liquidity: textOrNull(form, "liquidity"),
      ...brandPayload(form),
    };
    if (ctx.mode === "create") {
      const currency = currencyCode(form);
      const decimals = decimalsOf(currency);
      const invested = moneyOr(form, "invested", 0, decimals);
      payload.currency = currency;
      payload.invested_cents = invested;
      payload.current_cents = moneyOr(form, "current", invested, decimals);
    }
    return payload;
  },
  apiFieldMap: { invested_cents: "invested", current_cents: "current" },
  successMessage: ctx => ctx.mode === "edit" ? "Investimento atualizado." : "Investimento adicionado.",
  Fields: InvestmentFields,
};

// ── Movimentação de investimento ─────────────────────────────────────────────

const findInvestment = (form: FormState, ctx: FormContext) => findById(ctx.state.investments, form.investment_id);
const isAdjustment = (form: FormState) => trimmed(form, "kind") === "adjustment";

/** MEL-44: reason a movement cannot be saved (date in a closed month). */
const closedReason = (form: FormState, ctx: FormContext): string | undefined =>
  inClosedMonth(trimmed(form, "date"), ctx.closedMonths) ? closedMonthMessage(trimmed(form, "date")) : undefined;

export const investmentEntryForm: RecordFormDefinition = {
  title: (ctx, form) => `Nova movimentação · ${findInvestment(form, ctx)?.name ?? "investimento"}`,
  defaults: (ctx, initial) => ({ date: defaultDateForMonth(ctx.month), kind: "deposit", ...initial }),
  validate: (form, ctx) => {
    const investment = findInvestment(form, ctx);
    const decimals = decimalsOf(investment?.currency);
    const check = validator(form)
      .date("date", { required: true })
      .openMonth("date", ctx.closedMonths)
      .money("amount", { required: true, decimals, rule: isAdjustment(form) ? "nonNegative" : "positive", requiredMessage: isAdjustment(form) ? "Informe o novo saldo." : undefined })
      .maxLength("notes", 500);
    const amount = money(form, "amount", decimals);
    if (trimmed(form, "kind") === "withdrawal" && investment && amount !== null && amount > investment.current_cents) check.check(false, "amount", "O resgate é maior que o saldo atual.");
    return check.errors;
  },
  submit: async (form, ctx) => {
    const investmentId = Number(form.investment_id);
    const decimals = decimalsOf(findInvestment(form, ctx)?.currency);
    await api.addInvestmentEntry(investmentId, { investment_id: investmentId, date: trimmed(form, "date"), kind: trimmed(form, "kind") || "deposit", amount_cents: money(form, "amount", decimals), notes: textOrNull(form, "notes") });
  },
  apiFieldMap: { amount_cents: "amount" },
  successMessage: () => "Movimentação do investimento registrada.",
  submitLabel: () => "Registrar movimentação",
  submitDisabledReason: (ctx, form) => closedReason(form, ctx),
  usesClosedMonths: true,
  Fields: InvestmentEntryFields,
};

// ── Conta bancária ───────────────────────────────────────────────────────────

export const bankAccountForm: RecordFormDefinition = {
  module: "bank-accounts",
  title: ctx => ctx.mode === "edit" ? "Editar conta bancária" : "Nova conta bancária",
  defaults: (_ctx, initial) => ({ account_type: "checking", currency: "BRL", brand: "", logo_data: "", ...initial }),
  fromRecord: record => {
    const account = record as BankAccount;
    return {
      institution: account.institution, name: account.name, account_type: account.account_type,
      currency: currencyOf(account.currency).code, brand: account.brand ?? "", brand_touched: Boolean(account.brand), logo_data: account.logo_data ?? "",
    };
  },
  validate: (form, ctx) => {
    const check = validator(form)
      .requiredText("institution", "Informe a instituição.", 120)
      .requiredText("name", "Informe um nome ou apelido.", 120);
    if (ctx.mode === "create") check.money("current_balance", { rule: "any", decimals: decimalsOf(currencyCode(form)) });
    return check.errors;
  },
  toPayload: (form, ctx) => {
    const currency = currencyCode(form);
    return {
      institution: trimmed(form, "institution"),
      name: trimmed(form, "name"),
      account_type: trimmed(form, "account_type") || "checking",
      ...brandPayload(form),
      ...(ctx.mode === "create" ? { currency, current_balance_cents: moneyOr(form, "current_balance", 0, decimalsOf(currency)) } : {}),
    };
  },
  apiFieldMap: { current_balance_cents: "current_balance" },
  successMessage: ctx => ctx.mode === "edit" ? "Conta bancária atualizada." : "Conta bancária adicionada.",
  Fields: BankAccountFields,
};

// ── Movimentação bancária ────────────────────────────────────────────────────

const findAccount = (form: FormState, ctx: FormContext) => findById(ctx.state.bank_accounts, form.account_id);

export const bankEntryForm: RecordFormDefinition = {
  title: (ctx, form) => `Nova movimentação · ${findAccount(form, ctx)?.name ?? "conta"}`,
  defaults: (ctx, initial) => ({ date: defaultDateForMonth(ctx.month), kind: "deposit", related_account_id: "", ...initial }),
  validate: (form, ctx) => {
    const kind = trimmed(form, "kind");
    const adjustment = kind === "adjustment";
    const check = validator(form)
      .date("date", { required: true })
      .money("amount", { required: true, decimals: decimalsOf(accountCurrency(ctx.state, form.account_id)), rule: adjustment ? "any" : "positive", requiredMessage: adjustment ? "Informe o novo saldo." : undefined })
      .maxLength("description", 160)
      .maxLength("notes", 500);
    if (kind === "transfer_out") {
      if (!hasTransferTarget(ctx.state, Number(form.account_id))) check.check(false, "kind", TRANSFER_UNAVAILABLE);
      else check.required("related_account_id", "Selecione a conta de destino.");
      if (isCrossCurrencyTransfer(form, ctx)) {
        check.money("related_amount", { required: true, decimals: decimalsOf(accountCurrency(ctx.state, form.related_account_id)), requiredMessage: "Informe o valor recebido na conta de destino." });
      }
    }
    return check.errors;
  },
  submit: async (form, ctx) => {
    const accountId = Number(form.account_id);
    const kind = trimmed(form, "kind") || "deposit";
    const crossCurrency = isCrossCurrencyTransfer(form, ctx);
    await api.addBankEntry(accountId, {
      account_id: accountId, date: trimmed(form, "date"), kind,
      description: textOrNull(form, "description"),
      amount_cents: money(form, "amount", decimalsOf(accountCurrency(ctx.state, accountId))),
      related_account_id: kind === "transfer_out" ? idOrNull(form, "related_account_id") : null,
      ...(crossCurrency ? { related_amount_cents: money(form, "related_amount", decimalsOf(accountCurrency(ctx.state, form.related_account_id))) } : {}),
      notes: textOrNull(form, "notes"),
    });
  },
  apiFieldMap: { amount_cents: "amount", related_amount_cents: "related_amount" },
  successMessage: () => "Movimentação bancária registrada.",
  submitLabel: () => "Registrar movimentação",
  Fields: BankEntryFields,
};
