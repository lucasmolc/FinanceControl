import { useEffect, useState } from "react";
import { market, type MarketIndicator } from "../../api/insights";

let cache: MarketIndicator[] | null = null;

/** Market indicators (CDI, Selic, IPCA) for investment references; one request per session, silent on failure. */
export function useIndicators(enabled: boolean): MarketIndicator[] {
  const [indicators, setIndicators] = useState<MarketIndicator[]>(() => cache ?? []);
  useEffect(() => {
    if (!enabled || cache) return;
    let active = true;
    Promise.resolve()
      .then(() => market())
      .then(data => { cache = data?.indicators ?? []; if (active) setIndicators(cache); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [enabled]);
  return indicators;
}
