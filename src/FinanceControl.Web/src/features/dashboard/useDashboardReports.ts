import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../../api/client";
import { insightsApi, type ReportsData } from "../../api/insights";
import { shiftMonth } from "../../lib/date";

export interface DashboardReports {
  /** Last loaded report (kept while the next month loads, for the crossfade). */
  data: ReportsData | null;
  /** Month the data belongs to (the report's `to`). */
  month: string | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * MEL-38: the one extra request per month switch — GET /api/reports for the 6 months ending at `month`
 * (flow, payment methods, net worth). The month summary comes from the app data (the second request).
 */
export function useDashboardReports(month: string, version: number, enabled = true): DashboardReports {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  const last = useRef<{ month: string; attempt: number; skipVersion: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // A month switch refetches right away; the app refresh that follows it (version + 1) must not fetch again.
    const previous = last.current;
    const monthChanged = !previous || previous.month !== month;
    if (!monthChanged && previous.attempt === attempt && previous.skipVersion) {
      last.current = { ...previous, skipVersion: false };
      return;
    }
    last.current = { month, attempt, skipVersion: monthChanged && previous !== null };
    const id = ++request.current;
    setLoading(true);
    insightsApi.reports(shiftMonth(month, -5), month)
      .then(result => { if (id === request.current) { setData(result); setError(null); } })
      .catch(reason => { if (id === request.current) setError(errorMessage(reason, "Não foi possível carregar os gráficos do painel.")); })
      .finally(() => { if (id === request.current) setLoading(false); });
  }, [month, version, attempt, enabled]);

  const reload = useCallback(() => setAttempt(value => value + 1), []);
  return { data, month: data?.to ?? null, loading, error, reload };
}
