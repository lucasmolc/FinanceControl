import { currencyOf } from "../../lib/currencies";
import { formatDate, isISODate, isMonth } from "../../lib/date";
import { parseMoney, parseRate } from "../../lib/money";
import type { FinanceState, FormState } from "../../types";
import type { FormErrors } from "./types";

export const MONEY_INVALID = "Informe um valor válido, por exemplo 1.234,56.";
const RATE_INVALID = "Informe a cotação em reais por unidade, por exemplo 5,1234.";
/** MEL-44: movements dated in a closed month are blocked before reaching the API. */
export const closedMonthMessage = (date: string) => `O mês ${formatDate(date).slice(3)} está fechado. Reabra-o para registrar movimentações.`;
const MONEY_POSITIVE = "Informe um valor maior que zero.";
export const MONEY_NOT_NEGATIVE = "O valor não pode ser negativo.";
const DAY_INVALID = "Informe um dia entre 1 e 31.";
const DATE_INVALID = "Informe uma data válida.";
export const tooLong = (max: number) => `Use no máximo ${max} caracteres.`;

/** Raw text of a form value ("" for null/undefined). */
export const text = (form: FormState, key: string): string => {
  const value = form[key];
  return value === null || value === undefined ? "" : String(value);
};

export const trimmed = (form: FormState, key: string) => text(form, key).trim();

/** Trimmed text or null when blank. */
export const textOrNull = (form: FormState, key: string): string | null => trimmed(form, key) || null;

/** Numeric id from a select value, or null when blank. */
export const idOrNull = (form: FormState, key: string): number | null => {
  const value = trimmed(form, key);
  return value && /^\d+$/.test(value) ? Number(value) : null;
};

/** Minor units from money text (null when blank or invalid); `decimals` of the currency (default 2 = cents). */
export const money = (form: FormState, key: string, decimals = 2): number | null => parseMoney(text(form, key), decimals);

/** Minor units, treating blank as `fallback` (validate first). */
export const moneyOr = (form: FormState, key: string, fallback: number, decimals = 2): number => money(form, key, decimals) ?? fallback;

/** Currency code of the form (`key`, default "currency"), upper case; BRL when blank. */
export const currencyCode = (form: FormState, key = "currency"): string => currencyOf(trimmed(form, key)).code;

/** Normalized exchange rate ("5.1234") or null when blank/invalid. */
export const rateOrNull = (form: FormState, key: string): string | null => parseRate(text(form, key));

/** True when `date` (YYYY-MM-DD) falls in one of `closedMonths` (YYYY-MM). */
export const inClosedMonth = (date: string, closedMonths: readonly string[] | undefined): boolean =>
  Boolean(closedMonths?.length && isISODate(date) && closedMonths.includes(date.slice(0, 7)));

/**
 * R3-REC-2: the date to offer instead of one in a closed month — today when its month is open, otherwise the first day
 * of the first open month after `date` (null when none in the next two years).
 */
export function firstOpenDay(date: string, closedMonths: readonly string[] | undefined, today: string): string | null {
  if (!inClosedMonth(today, closedMonths)) return today;
  let [year, month] = date.slice(0, 7).split("-").map(Number) as [number, number];
  for (let step = 0; step < 24; step += 1) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    const candidate = `${year}-${String(month).padStart(2, "0")}-01`;
    if (!inClosedMonth(candidate, closedMonths)) return candidate;
  }
  return null;
}

export const dayValue = (form: FormState, key: string): number | null => {
  const value = trimmed(form, key);
  if (!/^\d{1,2}$/.test(value)) return null;
  const day = Number(value);
  return day >= 1 && day <= 31 ? day : null;
};

export const checked = (form: FormState, key: string): boolean => form[key] === true || form[key] === "true";

/** Money value for a select/text default: numbers are cents, strings are kept. */
export const moneyText = (value: FormState[string], format: (cents: number) => string): string =>
  typeof value === "number" ? format(value) : value === null || value === undefined ? "" : String(value);

type MoneyRule = "positive" | "nonNegative" | "any";

/** Small fluent validator that collects the first error per key. */
export class Validator {
  readonly errors: FormErrors = {};
  constructor(private readonly form: FormState) {}

  private fail(key: string, message: string) { if (!this.errors[key]) this.errors[key] = message; return this; }

  required(key: string, message: string) {
    if (!trimmed(this.form, key)) this.fail(key, message);
    return this;
  }

  maxLength(key: string, max: number) {
    if (trimmed(this.form, key).length > max) this.fail(key, tooLong(max));
    return this;
  }

  requiredText(key: string, message: string, max: number) { return this.required(key, message).maxLength(key, max); }

  /** `decimals`: minor-unit digits of the currency (default 2; JPY 0, BTC 8). */
  money(key: string, options: { required?: boolean; rule?: MoneyRule; requiredMessage?: string; decimals?: number } = {}) {
    const { required = false, rule = "positive", requiredMessage, decimals = 2 } = options;
    const raw = trimmed(this.form, key);
    if (!raw) return required ? this.fail(key, requiredMessage ?? (rule === "positive" ? MONEY_POSITIVE : "Informe um valor.")) : this;
    const cents = parseMoney(raw, decimals);
    if (cents === null) return this.fail(key, MONEY_INVALID);
    if (rule === "positive" && cents <= 0) return this.fail(key, MONEY_POSITIVE);
    if (rule === "nonNegative" && cents < 0) return this.fail(key, MONEY_NOT_NEGATIVE);
    return this;
  }

  day(key: string, required = true) {
    const raw = trimmed(this.form, key);
    if (!raw) return required ? this.fail(key, DAY_INVALID) : this;
    if (dayValue(this.form, key) === null) this.fail(key, DAY_INVALID);
    return this;
  }

  date(key: string, options: { required?: boolean; message?: string } = {}) {
    const raw = trimmed(this.form, key);
    if (!raw) return options.required ? this.fail(key, options.message ?? "Informe a data.") : this;
    if (!isISODate(raw)) this.fail(key, DATE_INVALID);
    return this;
  }

  /** Optional exchange rate ("Cotação usada"): must be a positive decimal when filled (or when `required`). */
  rate(key: string, options: { required?: boolean; message?: string } = {}) {
    const raw = trimmed(this.form, key);
    if (!raw) return options.required ? this.fail(key, options.message ?? "Informe a cotação usada.") : this;
    if (parseRate(raw) === null) this.fail(key, RATE_INVALID);
    return this;
  }

  /** MEL-44: the date must not be in a closed month. */
  openMonth(key: string, closedMonths: readonly string[] | undefined) {
    const raw = trimmed(this.form, key);
    if (inClosedMonth(raw, closedMonths)) this.fail(key, closedMonthMessage(raw));
    return this;
  }

  check(condition: boolean, key: string, message: string) { if (!condition) this.fail(key, message); return this; }
}

export const validator = (form: FormState) => new Validator(form);

/** `[id, "Instituição · Nome"]` options for active bank accounts ("· USD" appended for non-BRL accounts). */
export function accountOptions(state: FinanceState, excludeId?: number | null): [string, string][] {
  return state.bank_accounts
    .filter(account => account.id !== excludeId)
    .map(account => {
      const currency = currencyOf(account.currency).code;
      return [String(account.id), `${account.institution} · ${account.name}${currency === "BRL" ? "" : ` · ${currency}`}`];
    });
}

/** Currency of a bank account id from a form value (BRL when unknown). */
export const accountCurrency = (state: FinanceState, id: FormState[string]): string =>
  currencyOf(findById(state.bank_accounts, id)?.currency).code;

/** `[id, name]` options for categories of one kind. */
export function categoryOptions(state: FinanceState, kind: string): [string, string][] {
  return state.categories.filter(category => category.kind === kind).map(category => [String(category.id), category.name]);
}

/** Select value for a nullable id. */
export const idText = (id: number | null | undefined): string => id === null || id === undefined ? "" : String(id);

/** Record whose id equals the form value (numbers or numeric strings). */
export function findById<T extends { id: number }>(items: T[], id: FormState[string]): T | undefined {
  const wanted = Number(id);
  return Number.isInteger(wanted) ? items.find(item => item.id === wanted) : undefined;
}

/** A valid "YYYY-MM" from the form, or `fallback`. */
export const monthOr = (form: FormState, key: string, fallback: string): string => {
  const month = trimmed(form, key);
  return isMonth(month) ? month : fallback;
};

/** Preset swatches for card/category colors (MEL-35/39): `[#rrggbb, pt-BR name]`. */
const COLOR_PRESETS: [string, string][] = [
  ["#820ad1", "Roxo"], ["#1f6feb", "Azul"], ["#0f9d58", "Verde"], ["#e0b341", "Dourado"], ["#ec7000", "Laranja"],
  ["#cc092f", "Vermelho"], ["#e56fc2", "Rosa"], ["#0b2a4a", "Marinho"], ["#242424", "Grafite"], ["#6b7280", "Cinza"],
];

/** Card color swatches for the ColorPicker (`{ value, name }`). */
export const CARD_SWATCHES = COLOR_PRESETS.map(([color, name]) => ({ value: color, name }));

/** R1-REC-1: one order for the kind choice in every form — Despesa (the most common) · Receita · Investimento. */
export const KIND_OPTIONS: [string, string][] = [["expense", "Despesa"], ["income", "Receita"], ["investment", "Investimento"]];
