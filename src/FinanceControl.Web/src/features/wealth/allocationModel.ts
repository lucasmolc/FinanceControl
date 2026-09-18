import { currencyOf } from "../../lib/currencies";
import { investmentTypeLabels, labelFor } from "../../lib/labels";
import { toBaseCents, type ExchangeRates } from "../../lib/money";
import type { Investment } from "../../types";

// CR-25: how the portfolio is split — by type or by liquidity — in BRL at today's rates.

export type AllocationBy = "type" | "liquidity";

export interface AllocationSlice { key: string; label: string; cents: number; /** 0–100, rounded to one decimal. */ percent: number; count: number; }

export interface Allocation { slices: AllocationSlice[]; totalCents: number; /** Currencies without a rate, left out. */ missing: string[]; }

const NO_LIQUIDITY = "Não informada";

/** Liquidity bucket from free text ("D+0", "diária" → "Diária (D+0)"; "D+30" stays; blank → "Não informada"). */
export function liquidityLabel(text: string | null | undefined): string {
  const value = String(text ?? "").trim();
  if (!value) return NO_LIQUIDITY;
  if (/^d\s*\+\s*0$/i.test(value) || /di[áa]ria|imediata/i.test(value)) return "Diária (D+0)";
  const match = /^d\s*\+\s*(\d+)$/i.exec(value);
  if (match) return `D+${Number(match[1])}`;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/** Slices by current value (largest first), with the percentage of the converted total. Empty/negative values are skipped. */
export function allocation(items: Investment[], rates: ExchangeRates | null | undefined, by: AllocationBy): Allocation {
  const groups = new Map<string, { label: string; cents: number; count: number }>();
  const missing = new Set<string>();
  for (const item of items) {
    const code = currencyOf(item.currency).code;
    const cents = toBaseCents(item.current_cents, code, rates);
    if (cents === null) { missing.add(code); continue; }
    if (cents <= 0) continue;
    const label = by === "type" ? labelFor(investmentTypeLabels, item.type, "Outro") : liquidityLabel(item.liquidity);
    const key = by === "type" ? item.type : label.toLowerCase();
    const group = groups.get(key) ?? { label, cents: 0, count: 0 };
    group.cents += cents;
    group.count += 1;
    groups.set(key, group);
  }
  const totalCents = [...groups.values()].reduce((sum, group) => sum + group.cents, 0);
  const slices = [...groups.entries()]
    .map(([key, group]) => ({ key, label: group.label, cents: group.cents, count: group.count, percent: totalCents > 0 ? Math.round(group.cents / totalCents * 1000) / 10 : 0 }))
    .sort((left, right) => right.cents - left.cents || left.label.localeCompare(right.label, "pt-BR"));
  return { slices, totalCents, missing: [...missing].sort() };
}
