import { BASE_CURRENCY, currencies, currencyOf } from "./currencies";

// Money helpers. Amounts are integer MINOR UNITS of their currency (BRL/USD cents, JPY units, BTC satoshis…);
// all parsing is string/integer math (no float drift). Display strings use U+00A0 between symbol and number (like Intl).

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactFormatter = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const NBSP = " ";
const MINUS = "−";

/** Currency prefixes accepted (and ignored) when parsing: symbols and catalog codes, longest first. */
const PREFIXES = Array.from(new Set(["US$", "R$", "C$", "A$", "$", ...currencies.flatMap(currency => [currency.code, currency.symbol])]))
  .sort((left, right) => right.length - left.length);

function stripPrefix(value: string): string {
  const upper = value.toUpperCase();
  const prefix = PREFIXES.find(candidate => upper.startsWith(candidate.toUpperCase()));
  return prefix ? value.slice(prefix.length) : value;
}

function splitThousands(integer: string, separator: string): string | null {
  if (!integer.includes(separator)) return /^\d+$/.test(integer) ? integer : null;
  const groups = integer.split(separator);
  const [first, ...rest] = groups;
  if (!first || !/^\d{1,3}$/.test(first) || rest.some(group => !/^\d{3}$/.test(group))) return null;
  return groups.join("");
}

function toMinorFromParts(integer: string, fraction: string, decimals: number): number | null {
  if (!/^\d*$/.test(integer) || !/^\d*$/.test(fraction) || fraction.length > decimals) return null;
  if (!integer && !fraction) return null;
  const digits = `${integer || "0"}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  const minor = Number(digits);
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Converts user-typed money text into integer minor units (`decimals` fraction digits; default 2 = cents).
 * Returns null for blank or invalid text (never silently 0).
 * Accepts "12,50", "12.50", "1.234,56", "1234", "R$ 1.234,56", "US$ 10", "-50,00"; with decimals 8 also "0,005" / "0.005".
 * Rules: strip spaces and a currency prefix; when both "." and "," appear the last one is the decimal separator
 * (the other groups thousands by 3); only "," → decimal; only "." → decimal when followed by 1–2 digits
 * (1–`decimals` digits when decimals > 2, never when decimals = 0), otherwise thousands (groups of 3).
 */
export function parseMoney(text: string, decimals = 2): number | null {
  const places = Math.max(0, Math.trunc(decimals));
  let value = String(text ?? "").replace(/\s/g, "");
  if (!value) return null;
  let sign = 1;
  const takeSign = () => {
    if (value.startsWith("-") || value.startsWith(MINUS)) { sign = -sign; value = value.slice(1); return true; }
    if (value.startsWith("+")) { value = value.slice(1); return true; }
    return false;
  };
  const signed = takeSign();
  value = stripPrefix(value);
  if (!signed) takeSign();
  if (!value || !/^[\d.,]+$/.test(value) || !/\d/.test(value)) return null;

  const lastDot = value.lastIndexOf(".");
  const lastComma = value.lastIndexOf(",");
  let minor: number | null;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    const decimalIndex = value.lastIndexOf(decimalSeparator);
    const integerPart = value.slice(0, decimalIndex);
    const fraction = value.slice(decimalIndex + 1);
    if (integerPart.includes(decimalSeparator) || !fraction) return null;
    const integer = splitThousands(integerPart, thousandsSeparator);
    minor = integer === null ? null : toMinorFromParts(integer, fraction, places);
  } else if (lastComma >= 0) {
    const parts = value.split(",");
    if (parts.length !== 2) return null;
    const [integer = "", fraction = ""] = parts;
    if (!fraction) return null;
    minor = toMinorFromParts(integer, fraction, places);
  } else if (lastDot >= 0) {
    const parts = value.split(".");
    const [integer = "", fraction = ""] = parts;
    const decimalLimit = places > 2 ? places : 2;
    if (places > 0 && parts.length === 2 && fraction.length >= 1 && fraction.length <= decimalLimit && (places > 2 || fraction.length <= 2)) {
      minor = toMinorFromParts(integer, fraction, places);
    } else {
      const grouped = splitThousands(value, ".");
      minor = grouped === null ? null : toMinorFromParts(grouped, "", places);
    }
  } else {
    minor = toMinorFromParts(value, "", places);
  }

  if (minor === null) return null;
  return sign < 0 && minor !== 0 ? -minor : minor;
}

const group = (integer: string) => integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Integer and fraction digits of |minor| for `decimals`. */
function digitsOf(minor: number, decimals: number): { integer: string; fraction: string } {
  const safe = Math.abs(Math.trunc(Number.isFinite(minor) ? minor : 0));
  if (decimals <= 0) return { integer: String(safe), fraction: "" };
  const raw = String(safe).padStart(decimals + 1, "0");
  return { integer: raw.slice(0, -decimals), fraction: raw.slice(-decimals) };
}

/** Fraction trimmed to significant digits, keeping at least `min` (never more than it has). */
const trimFraction = (fraction: string, min: number) => {
  let end = fraction.length;
  while (end > min && fraction[end - 1] === "0") end -= 1;
  return fraction.slice(0, end);
};

/** Number part for display/input: "1.234,56"; decimals > 2 are trimmed to significant digits (min 2). */
function formatNumber(minor: number, decimals: number): string {
  const { integer, fraction } = digitsOf(minor, decimals);
  const shown = decimals > 2 ? trimFraction(fraction, 2) : fraction;
  return shown ? `${group(integer)},${shown}` : group(integer);
}

/**
 * Formats minor units for an editable input: "1.234,56" (grouped, `decimals` places, "-" prefix when negative).
 * With decimals > 2 (crypto) trailing zeros are trimmed to at least 2 places ("0,005").
 */
export function formatMoneyInput(minor: number, decimals = 2): string {
  const safe = Math.trunc(Number.isFinite(minor) ? minor : 0);
  return `${safe < 0 ? "-" : ""}${formatNumber(safe, Math.max(0, Math.trunc(decimals)))}`;
}

/** "R$ 1.234,56" */
export const brl = (cents: number) => currencyFormatter.format((Number.isFinite(cents) ? cents : 0) / 100);

export interface FormatMoneyOptions {
  /** "+US$ 1,00" / "−US$ 1,00"; zero has no sign. */
  signed?: boolean;
  /** "R$ 1,2 mil", "US$ 3,4 mi" (one fraction digit). */
  compact?: boolean;
}

/**
 * Money for display in its own currency: BRL "R$ 1.234,56" (same as `brl`), USD "US$ 1.234,56", JPY "¥ 1.234",
 * BTC "₿ 0,005" (crypto trimmed to significant decimals, min 2, max 8). Unknown codes use the code as symbol.
 */
export function formatMoney(minor: number, currency: string = BASE_CURRENCY, options: FormatMoneyOptions = {}): string {
  const info = currencyOf(currency);
  const safe = Math.trunc(Number.isFinite(minor) ? minor : 0);
  let body: string;
  if (options.compact) {
    body = `${info.symbol}${NBSP}${compactFormatter.format(Math.abs(safe) / 10 ** info.decimals)}`;
  } else if (info.code === BASE_CURRENCY) {
    body = brl(Math.abs(safe));
  } else {
    body = `${info.symbol}${NBSP}${formatNumber(safe, info.decimals)}`;
  }
  if (options.signed) return safe === 0 ? body : `${safe > 0 ? "+" : MINUS}${body}`;
  return safe < 0 ? `-${body}` : body;
}

/** Masked value for privacy mode ("ocultar valores"): "R$ •••••", "US$ •••••". */
export const hiddenMoney = (currency: string = BASE_CURRENCY): string => `${currencyOf(currency).symbol}${NBSP}•••••`;

/** Exchange rates: BRL per 1 unit of each currency, as decimal strings ("5.1234") or numbers. BRL is implicit (1). */
export type ExchangeRates = Record<string, string | number | null | undefined>;

/** Decimal text → [numerator, denominator] BigInts ("5.1234" → [51234n, 10000n]); null when not a positive decimal. */
function decimalFraction(value: string | number): [bigint, bigint] | null {
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value.trim().replace(",", ".");
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) return null;
  const fraction = match[2] ?? "";
  let numerator = BigInt(`${match[1]}${fraction}`);
  let denominator = 10n ** BigInt(fraction.length);
  const exponent = Number(match[3] ?? 0);
  if (exponent > 0) numerator *= 10n ** BigInt(exponent);
  else if (exponent < 0) denominator *= 10n ** BigInt(-exponent);
  return numerator > 0n ? [numerator, denominator] : null;
}

/** Integer division rounding half away from zero (C# MidpointRounding.AwayFromZero). */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = (absolute * 2n + denominator) / (denominator * 2n);
  return negative ? -quotient : quotient;
}

/**
 * Converts `minor` units of `currency` into BRL cents: round(minor / 10^decimals × rate × 100), half away from zero.
 * BRL returns `minor`. Returns null when the rate of a non-BRL currency is unknown or invalid.
 */
export function toBaseCents(minor: number, currency: string, rates: ExchangeRates | null | undefined): number | null {
  const info = currencyOf(currency);
  const safe = Math.trunc(Number.isFinite(minor) ? minor : 0);
  if (info.code === BASE_CURRENCY) return safe;
  const rate = rates?.[info.code];
  if (rate === null || rate === undefined) return null;
  const parsed = decimalFraction(rate);
  if (!parsed) return null;
  const [numerator, denominator] = parsed;
  const result = divideRounded(BigInt(safe) * numerator * 100n, denominator * 10n ** BigInt(info.decimals));
  const value = Number(result);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Parses a typed exchange rate ("5,1234", "5.1234", "350.000,50") into a normalized decimal string ("5.1234"),
 * up to 8 fraction digits; null when blank, invalid or not > 0.
 */
export function parseRate(text: string): string | null {
  const value = String(text ?? "").replace(/\s/g, "").replace(/^R\$/i, "");
  if (!value) return null;
  let integer: string;
  let fraction = "";
  const lastDot = value.lastIndexOf(".");
  const lastComma = value.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const index = value.lastIndexOf(decimalSeparator);
    const grouped = splitThousands(value.slice(0, index), decimalSeparator === "." ? "," : ".");
    if (grouped === null) return null;
    integer = grouped;
    fraction = value.slice(index + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const parts = value.split(lastComma >= 0 ? "," : ".");
    if (parts.length !== 2) return null;
    integer = parts[0] ?? "";
    fraction = parts[1] ?? "";
  } else {
    integer = value;
  }
  if (!/^\d*$/.test(integer) || !/^\d{0,8}$/.test(fraction) || (!integer && !fraction)) return null;
  const normalizedInteger = (integer || "0").replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  if (!/[1-9]/.test(normalizedInteger + normalizedFraction)) return null;
  return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger;
}

/** Rate for display/inputs: "5.1234" → "5,1234". */
export const formatRate = (rate: string | number | null | undefined): string =>
  rate === null || rate === undefined ? "" : String(rate).replace(".", ",");
