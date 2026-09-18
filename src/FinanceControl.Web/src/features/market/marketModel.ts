import type { MarketData, MarketRate } from "../../api/insights";
import { currencies, currencyOf, type CurrencyInfo } from "../../lib/currencies";
import { toBaseCents, type ExchangeRates } from "../../lib/money";

export interface RateRow { info: CurrencyInfo; rate: MarketRate | null }

/** Catalog currencies (except BRL) split into fiat and crypto, in catalog order, each with its rate (null when never fetched). */
export function rateGroups(rates: MarketRate[]): { fiat: RateRow[]; crypto: RateRow[] } {
  const byCode = new Map(rates.map(rate => [rate.currency.toUpperCase(), rate]));
  const rows = currencies.filter(info => info.code !== "BRL").map(info => ({ info, rate: byCode.get(info.code) ?? null }));
  const extra = rates.filter(rate => !currencies.some(info => info.code === rate.currency.toUpperCase()) && rate.currency.toUpperCase() !== "BRL")
    .map(rate => ({ info: currencyOf(rate.currency), rate }));
  const all = [...rows, ...extra];
  return { fiat: all.filter(row => row.info.kind === "fiat"), crypto: all.filter(row => row.info.kind === "crypto") };
}

/** `{ USD: "5.12", … }` for lib/money conversions (BRL implicit). */
export function ratesMap(market: MarketData | null): ExchangeRates {
  const map: ExchangeRates = {};
  for (const rate of market?.rates ?? []) map[rate.currency.toUpperCase()] = rate.rate_brl;
  return map;
}

/** Converts `amountMinor` of `from` into minor units of `to` through BRL; null when a rate is missing. */
export function convertMinor(amountMinor: number, from: string, to: string, rates: ExchangeRates): number | null {
  const fromInfo = currencyOf(from);
  const toInfo = currencyOf(to);
  if (fromInfo.code === toInfo.code) return Math.trunc(amountMinor);
  const brlCents = toBaseCents(amountMinor, fromInfo.code, rates);
  if (brlCents === null) return null;
  if (toInfo.code === "BRL") return brlCents;
  const rate = Number(String(rates[toInfo.code] ?? "").replace(",", "."));
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const result = Math.round((brlCents * 10 ** toInfo.decimals) / (100 * rate));
  return Number.isSafeInteger(result) ? result : null;
}

/** Rate of 1 unit of `from` expressed in `to` (e.g. 1 USD = 0,92 EUR); null when unknown. */
export function unitRate(from: string, to: string, rates: ExchangeRates): number | null {
  const rateOf = (code: string) => (currencyOf(code).code === "BRL" ? 1 : Number(String(rates[currencyOf(code).code] ?? "").replace(",", ".")));
  const a = rateOf(from);
  const b = rateOf(to);
  return Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 ? a / b : null;
}

/** BRL value of one unit, with precision that suits the magnitude: "R$ 5,1234", "R$ 352.110,00", "R$ 0,012345". */
export function formatUnitRate(value: string | number | null | undefined, symbol = "R$"): string {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(number) || number <= 0) return "—";
  const digits = number >= 1000 ? 2 : number >= 1 ? 4 : 6;
  return `${symbol} ${number.toLocaleString("pt-BR", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits })}`;
}

/** "+1,25%" / "−0,4%" / "0%" (U+2212 minus). */
export function formatChange(pct: number): string {
  const text = Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return pct > 0 ? `+${text}%` : pct < 0 ? `−${text}%` : "0%";
}

/** "18/09/2026 às 14:30" from an ISO date-time (local time); "—" when invalid. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const day = date.toLocaleDateString("pt-BR");
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${day} às ${time}`;
}

/** "10,5% a.a." */
export function formatIndicator(value: number, unit: string): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${unit.startsWith("%") ? "" : " "}${unit}`;
}

const sourceLabels: Record<string, string> = {
  awesomeapi: "AwesomeAPI", coingecko: "CoinGecko", bcb: "Banco Central (SGS)", "bcb-sgs": "Banco Central (SGS)", manual: "Manual",
};

/** Human source name (the API already sends pt-BR names; ids are mapped as a fallback). */
export const sourceLabel = (source: string): string => sourceLabels[source.toLowerCase()] ?? source;

// ---------- CR-23: "Suas moedas" first, one source/date line ----------

/** Foreign currencies the person holds (accounts, investments, goals, bills, subscriptions), catalog order. */
export function heldCurrencies(state: { bank_accounts: { currency?: string }[]; investments: { currency?: string }[]; goals: { currency: string }[]; bills?: { currency?: string }[]; subscriptions?: { currency?: string }[] }): string[] {
  const used = new Set(
    [...state.bank_accounts, ...state.investments, ...state.goals, ...(state.bills ?? []), ...(state.subscriptions ?? [])]
      .map(item => (item.currency ?? "BRL").toUpperCase())
      .filter(code => code !== "BRL"),
  );
  const ordered = currencies.map(info => info.code).filter(code => used.has(code));
  return [...ordered, ...[...used].filter(code => !ordered.includes(code)).sort()];
}

/** Reference currencies shown first when the person holds no foreign currency. */
export const REFERENCE_CURRENCIES = ["USD", "EUR", "BTC"];

/** Rows split into the person's currencies (or the references) and the rest of the catalog (fiat + crypto). */
export function splitRates(rates: MarketRate[], held: string[]): { yours: RateRow[]; others: { fiat: RateRow[]; crypto: RateRow[] }; referencesOnly: boolean } {
  const groups = rateGroups(rates);
  const all = [...groups.fiat, ...groups.crypto];
  const referencesOnly = held.length === 0;
  const pick = new Set(referencesOnly ? REFERENCE_CURRENCIES : held);
  const yours = [...(referencesOnly ? REFERENCE_CURRENCIES : held)].map(code => all.find(row => row.info.code === code) ?? { info: currencyOf(code), rate: null });
  return { yours, others: { fiat: groups.fiat.filter(row => !pick.has(row.info.code)), crypto: groups.crypto.filter(row => !pick.has(row.info.code)) }, referencesOnly };
}

/** "AwesomeAPI (moedas) · CoinGecko (cripto)" from the automatic rates; manual ones are flagged on their cards. */
export function sourcesText(rates: MarketRate[]): string {
  const byKind = new Map<string, Set<string>>();
  for (const rate of rates) {
    if (rate.manual) continue;
    const kind = currencyOf(rate.currency).kind === "crypto" ? "cripto" : "moedas";
    byKind.set(kind, new Set([...(byKind.get(kind) ?? []), sourceLabel(rate.source)]));
  }
  return ["moedas", "cripto"].filter(kind => byKind.has(kind)).map(kind => `${[...byKind.get(kind)!].join(", ")} (${kind})`).join(" · ");
}

/** Reference date text that never shows a future date (CR-23): future → null (the caller shows the fetch date). */
export function referenceDate(reference: string | null, today: string): string | null {
  if (!reference) return null;
  const day = reference.slice(0, 10);
  return day > today ? null : day;
}

/** "% em 12 meses" when the label already says "12 meses" → "%" (no repeated period). */
export function indicatorUnit(label: string, unit: string): string {
  return /12 meses/i.test(label) && /em 12 meses/i.test(unit) ? unit.replace(/\s*em 12 meses/i, "").trim() || "%" : unit;
}
