// Currency catalog (MEL-26): mirror of the backend catalog served by GET /api/currencies.
// Every `*_cents` value is an integer amount in MINOR UNITS of the record's own currency (10^decimals).

export type CurrencyKind = "fiat" | "crypto";

export interface CurrencyInfo {
  code: string;
  /** pt-BR name, e.g. "Dólar americano". */
  name: string;
  symbol: string;
  /** Fraction digits of the minor unit (JPY 0, BTC 8). */
  decimals: number;
  kind: CurrencyKind;
}

/** Base currency (fixed in v1.2). */
export const BASE_CURRENCY = "BRL";

export const currencies: readonly CurrencyInfo[] = [
  { code: "BRL", name: "Real brasileiro", symbol: "R$", decimals: 2, kind: "fiat" },
  { code: "USD", name: "Dólar americano", symbol: "US$", decimals: 2, kind: "fiat" },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2, kind: "fiat" },
  { code: "GBP", name: "Libra esterlina", symbol: "£", decimals: 2, kind: "fiat" },
  { code: "JPY", name: "Iene japonês", symbol: "¥", decimals: 0, kind: "fiat" },
  { code: "CHF", name: "Franco suíço", symbol: "CHF", decimals: 2, kind: "fiat" },
  { code: "CAD", name: "Dólar canadense", symbol: "C$", decimals: 2, kind: "fiat" },
  { code: "AUD", name: "Dólar australiano", symbol: "A$", decimals: 2, kind: "fiat" },
  { code: "ARS", name: "Peso argentino", symbol: "ARS", decimals: 2, kind: "fiat" },
  { code: "BTC", name: "Bitcoin", symbol: "₿", decimals: 8, kind: "crypto" },
  { code: "ETH", name: "Ethereum", symbol: "Ξ", decimals: 8, kind: "crypto" },
  { code: "SOL", name: "Solana", symbol: "SOL", decimals: 8, kind: "crypto" },
  { code: "USDT", name: "Tether (USDT)", symbol: "USDT", decimals: 2, kind: "crypto" },
];

const byCode = new Map(currencies.map(currency => [currency.code, currency]));

/**
 * Catalog entry for `code`; blank → BRL; unknown codes still work (symbol = code, 2 decimals, fiat)
 * so stored values never break the UI.
 */
export function currencyOf(code: string | null | undefined): CurrencyInfo {
  const normalized = String(code ?? "").trim().toUpperCase() || BASE_CURRENCY;
  return byCode.get(normalized) ?? { code: normalized, name: normalized, symbol: normalized, decimals: 2, kind: "fiat" };
}

/** "USD · Dólar americano" */
export const currencyLabel = (code: string | null | undefined): string => {
  const currency = currencyOf(code);
  return currency.name === currency.code ? currency.code : `${currency.code} · ${currency.name}`;
};

/** `[code, label]` options for a plain select: all catalog currencies (fiat first, then crypto). */
export const currencyOptions = (): [string, string][] => currencies.map(currency => [currency.code, currencyLabel(currency.code)]);

/** Options grouped for a select with optgroups: "Moedas" (fiat) and "Cripto". */
export const currencyGroups = (): { label: string; options: [string, string][] }[] => [
  { label: "Moedas", options: currencies.filter(currency => currency.kind === "fiat").map(currency => [currency.code, currencyLabel(currency.code)]) },
  { label: "Cripto", options: currencies.filter(currency => currency.kind === "crypto").map(currency => [currency.code, currencyLabel(currency.code)]) },
];

export const isBaseCurrency = (code: string | null | undefined): boolean => currencyOf(code).code === BASE_CURRENCY;
