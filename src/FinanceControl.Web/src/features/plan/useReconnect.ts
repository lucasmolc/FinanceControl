import { useEffect, useRef } from "react";

/**
 * Decision 1 (R3): pages with their own fetches (Relatórios, Projeções, Mercado) reload once when the global `offline`
 * flag goes back to false. A brief "checking" state never flips `offline`, so this runs only after a real outage.
 */
export function useReconnect(offline: boolean, reload: () => unknown): void {
  const previous = useRef(offline);
  const latest = useRef(reload);
  useEffect(() => { latest.current = reload; }, [reload]);
  useEffect(() => {
    const was = previous.current;
    previous.current = offline;
    if (was && !offline) void latest.current();
  }, [offline]);
}
