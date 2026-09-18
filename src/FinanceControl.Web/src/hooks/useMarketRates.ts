import { useEffect, useState } from "react";
import { market, type MarketRate } from "../api/insights";
import type { ExchangeRates } from "../lib/money";

export interface MarketRatesState {
  /** BRL per 1 unit by currency code (decimal strings, "." separator); BRL is implicit. */
  rates: ExchangeRates;
  /** Full rate rows (source, freshness) by currency code. */
  details: Record<string, MarketRate>;
  loading: boolean;
  /** pt-BR message when the rates could not be loaded (forms then ask for the rate). */
  error: string | null;
}

interface Snapshot { rates: ExchangeRates; details: Record<string, MarketRate>; }

/** Session cache: one GET /api/market per app load, shared by every form. */
let cache: Snapshot | null = null;
let pending: Promise<Snapshot> | null = null;

function load(): Promise<Snapshot> {
  if (cache) return Promise.resolve(cache);
  pending ??= Promise.resolve()
    .then(() => market())
    .then(data => {
      const rates: ExchangeRates = {};
      const details: Record<string, MarketRate> = {};
      for (const rate of data?.rates ?? []) {
        rates[rate.currency] = rate.rate_brl;
        details[rate.currency] = rate;
      }
      cache = { rates, details };
      return cache;
    })
    .finally(() => { pending = null; });
  return pending;
}

/** Forgets the cached rates (after a manual refresh or rate override). */
export function invalidateMarketRates(): void { cache = null; }

/**
 * Latest exchange rates from GET /api/market (MEL-26/27), e.g. to prefill "Cotação usada" in forms.
 * `enabled = false` skips the request (BRL-only forms).
 */
export function useMarketRates(enabled = true): MarketRatesState {
  const [state, setState] = useState<MarketRatesState>(() => cache
    ? { ...cache, loading: false, error: null }
    : { rates: {}, details: {}, loading: enabled, error: null });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    load()
      .then(snapshot => { if (active) setState({ ...snapshot, loading: false, error: null }); })
      .catch(() => { if (active) setState(current => ({ ...current, loading: false, error: "Não foi possível carregar as cotações." })); });
    return () => { active = false; };
  }, [enabled]);

  return state;
}
