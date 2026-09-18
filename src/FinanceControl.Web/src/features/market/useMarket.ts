import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../../api/client";
import { insightsApi, type MarketData } from "../../api/insights";

export interface MarketState {
  data: MarketData | null;
  loading: boolean;
  error: string | null;
  /** R1-MKT-3: `data` is the last payload saved in this browser (the server could not be reached). */
  fromCache: boolean;
  reload: () => Promise<void>;
  /** Replaces the data (after a refresh that already returns the GET shape). */
  replace: (next: MarketData) => void;
}

/** Last `/api/market` payload, kept in this browser so an offline visit still shows the saved values. */
const CACHE_KEY = "lmm.market.last";

function readCache(): MarketData | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) as MarketData : null;
    return parsed && Array.isArray(parsed.rates) && Array.isArray(parsed.indicators) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(data: MarketData) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage full or blocked: the cache is optional */ }
}

export function useMarket(version: number): MarketState {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const request = useRef(0);
  const loaded = useRef(false);

  const reload = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    try {
      const next = await insightsApi.market();
      if (id === request.current) { loaded.current = true; setData(next); setError(null); setFromCache(false); writeCache(next); }
    } catch (reason) {
      if (id === request.current) {
        setError(errorMessage(reason, "Não foi possível carregar as cotações."));
        // Keep what is on screen; on a first visit fall back to the values saved in this browser.
        const cached = loaded.current ? null : readCache();
        if (cached) { setData(cached); setFromCache(true); }
      }
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload, version]);

  const replace = useCallback((next: MarketData) => { request.current += 1; loaded.current = true; setData(next); setError(null); setFromCache(false); setLoading(false); writeCache(next); }, []);
  return { data, loading, error, fromCache, reload, replace };
}
