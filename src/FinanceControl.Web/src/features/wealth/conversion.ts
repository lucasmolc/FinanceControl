import type { MarketIndicator } from "../../api/insights";
import { currencyOf, isBaseCurrency } from "../../lib/currencies";
import { toBaseCents, type ExchangeRates } from "../../lib/money";

// MEL-26/36: native amounts converted to BRL with the latest market rates (patrimônio, totals, cards).

export interface Amount { minor: number; currency?: string | null; }

export interface BaseTotal {
  /** Sum in BRL cents of every amount whose rate is known. */
  cents: number;
  /** Currency codes without a known rate (left out of `cents`). */
  missing: string[];
  /** True when some amount is not in BRL. */
  converted: boolean;
}

/** Sums amounts of mixed currencies in BRL cents (latest rates); currencies without a rate are reported in `missing`. */
export function baseTotal(amounts: Amount[], rates: ExchangeRates | null | undefined): BaseTotal {
  let cents = 0;
  const missing = new Set<string>();
  let converted = false;
  for (const amount of amounts) {
    const code = currencyOf(amount.currency).code;
    if (!isBaseCurrency(code)) converted = true;
    const base = toBaseCents(amount.minor, code, rates);
    if (base === null) missing.add(code);
    else cents += base;
  }
  return { cents, missing: [...missing].sort(), converted };
}

/** True when some record is not in BRL (the page then loads the market rates). */
export const hasForeignCurrency = (items: Array<{ currency?: string | null }>): boolean => items.some(item => !isBaseCurrency(item.currency));

/** "Sem cotação para USD e BTC; fora do total." — or null when every currency has a rate. */
export function missingRatesNote(missing: string[]): string | null {
  if (!missing.length) return null;
  const list = missing.length === 1 ? missing[0]! : `${missing.slice(0, -1).join(", ")} e ${missing[missing.length - 1]}`;
  return `Sem cotação para ${list}; ${missing.length === 1 ? "fica" : "ficam"} fora do total em reais.`;
}

const percent = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * Share of the CDI in a benchmark text ("110% do CDI" → 110, "CDI + 2%" → null, "CDI" → 100); null when it does not
 * reference the CDI as a percentage.
 */
export function cdiShare(benchmark: string | null | undefined): number | null {
  const text = String(benchmark ?? "").toLowerCase();
  if (!/\bcdi\b/.test(text)) return null;
  if (/cdi\s*\+/.test(text)) return null;
  const match = /(\d+(?:[.,]\d+)?)\s*%\s*(?:do\s+)?cdi/.exec(text);
  if (match) return Number(match[1]!.replace(",", "."));
  return /^\s*(100\s*%\s*)?cdi\s*$/.test(text) ? 100 : null;
}

/**
 * What a CDI benchmark means today (MEL-31/33, CR-25 copy): "110% do CDI" with CDI 10,65% a.a. →
 * "Rende 110% do CDI (≈ 11,72% ao ano hoje)". Null without a CDI indicator or a CDI-based benchmark.
 */
/**
 * R1-INV-1: the share of an investment — an explicit percentage in the benchmark wins; a plain "CDI" benchmark takes the
 * percentage written in the name ("CDB Nubank 110% CDI" → 110); otherwise the benchmark alone decides.
 */
export function investmentCdiShare(benchmark: string | null | undefined, name?: string | null): number | null {
  const fromBenchmark = cdiShare(benchmark);
  const explicit = /\d\s*%/.test(String(benchmark ?? ""));
  if (fromBenchmark !== null && explicit) return fromBenchmark;
  const fromName = /(\d+(?:[.,]\d+)?)\s*%\s*(?:do\s+)?cdi\b/i.exec(String(name ?? ""));
  if (fromName && (fromBenchmark !== null || !benchmark)) return Number(fromName[1]!.replace(",", "."));
  return fromBenchmark;
}

export function cdiReference(benchmark: string | null | undefined, indicators: MarketIndicator[] | null | undefined, name?: string | null): string | null {
  const share = investmentCdiShare(benchmark, name);
  const cdi = indicators?.find(item => item.code === "cdi");
  if (share === null || !cdi || !Number.isFinite(cdi.value)) return null;
  const yearly = cdi.value * share / 100;
  return `Rende ${percent.format(share)}% do CDI (≈ ${percent.format(yearly)}% ao ano hoje)`;
}

/** Tooltip for "CDI" (plain-language, CR-25). */
export const CDI_HINT = "CDI: taxa que os bancos usam entre si, a referência da renda fixa no Brasil (anda junto com a Selic).";
export const SELIC_HINT = "Selic: taxa básica de juros do Brasil, definida pelo Banco Central; o Tesouro Selic rende perto dela.";
export const IPCA_HINT = "IPCA: a inflação oficial do Brasil; \"IPCA + 6%\" rende a inflação dos últimos 12 meses mais 6% ao ano.";

export interface BenchmarkReference { text: string; hint: string; }

/**
 * R2-INV-1: the same yield line for every indexed investment — CDI ("Rende 110% do CDI (≈ 15,29% ao ano hoje)"), Selic
 * ("Rende 100% da Selic (≈ 13,75% ao ano hoje)") and IPCA + x% ("Rende IPCA + 6% (≈ 10,47% ao ano hoje)"). Null when the
 * benchmark is not a rate (e.g. "S&P 500") or the indicator is unknown.
 */
export function benchmarkReference(benchmark: string | null | undefined, indicators: MarketIndicator[] | null | undefined, name?: string | null): BenchmarkReference | null {
  const cdi = cdiReference(benchmark, indicators, name);
  if (cdi) return { text: cdi, hint: CDI_HINT };
  const text = String(benchmark ?? "").toLowerCase();
  const find = (code: string) => { const item = indicators?.find(entry => entry.code === code); return item && Number.isFinite(item.value) ? item.value : null; };
  const ipca = /ipca\s*\+\s*(\d+(?:[.,]\d+)?)\s*%/.exec(text);
  if (ipca) {
    const inflation = find("ipca_12m");
    if (inflation === null) return null;
    const spread = Number(ipca[1]!.replace(",", "."));
    const yearly = ((1 + inflation / 100) * (1 + spread / 100) - 1) * 100;
    return { text: `Rende IPCA + ${percent.format(spread)}% (≈ ${percent.format(yearly)}% ao ano hoje)`, hint: IPCA_HINT };
  }
  const selicText = /\bselic\b/.test(text) || (!text && /\bselic\b/i.test(String(name ?? "")));
  if (!selicText || /selic\s*\+/.test(text)) return null;
  const selic = find("selic");
  if (selic === null) return null;
  const match = /(\d+(?:[.,]\d+)?)\s*%\s*(?:da\s+)?selic/.exec(text);
  const share = match ? Number(match[1]!.replace(",", ".")) : 100;
  return { text: `Rende ${percent.format(share)}% da Selic (≈ ${percent.format(selic * share / 100)}% ao ano hoje)`, hint: SELIC_HINT };
}

/**
 * R3-INV-1: the yield line for an index that is not a rate (e.g. IVVB11 → "S&P 500"), so every card has one. Null for
 * blank or rate-like benchmarks (those are handled by `benchmarkReference`, or unknown).
 */
export function benchmarkFallback(benchmark: string | null | undefined): BenchmarkReference | null {
  const text = String(benchmark ?? "").trim();
  if (!text || /\d\s*%/.test(text) || /\b(cdi|selic|ipca)\b/i.test(text)) return null;
  return { text: `Segue o índice ${text} · sem rendimento garantido`, hint: "Um investimento atrelado a um índice sobe e desce com ele; não há taxa fixa." };
}

/** Daily variation of a currency ("+0,4% hoje"), or null when unknown. */
export function rateChangeLabel(changePct: number | null | undefined): string | null {
  if (changePct === null || changePct === undefined || !Number.isFinite(changePct)) return null;
  const rounded = Math.round(changePct * 100) / 100;
  const text = percent.format(Math.abs(rounded));
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${text}% hoje`;
}
