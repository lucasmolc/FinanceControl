import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../../api/client";
import { insightsApi, type ReportsData } from "../../api/insights";
import { previousPeriod, type Period } from "./reportsModel";

export interface ReportsState {
  data: ReportsData | null;
  /** Period the shown `data` was requested for (R3-REL-2: differs from the chosen one while the new period has not loaded). */
  dataPeriod: Period | null;
  /** Same-length previous period (for deltas); null when unavailable. */
  previous: ReportsData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Loads the period report and the previous period in parallel; keeps the last data while refetching. */
export function useReports(period: Period | null, version: number): ReportsState {
  const [data, setData] = useState<ReportsData | null>(null);
  const [dataPeriod, setDataPeriod] = useState<Period | null>(null);
  const [previous, setPrevious] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(period !== null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  const from = period?.from;
  const to = period?.to;

  useEffect(() => {
    if (!from || !to) return;
    const id = ++request.current;
    const before = previousPeriod({ from, to });
    setLoading(true);
    Promise.all([insightsApi.reports(from, to), insightsApi.reports(before.from, before.to).catch(() => null)])
      .then(([current, prior]) => {
        if (id !== request.current) return;
        setData(current);
        setDataPeriod({ from, to });
        setPrevious(prior);
        setError(null);
      })
      .catch(reason => { if (id === request.current) setError(errorMessage(reason, "Não foi possível carregar o relatório.")); })
      .finally(() => { if (id === request.current) setLoading(false); });
  }, [from, to, version, attempt]);

  const reload = useCallback(() => setAttempt(value => value + 1), []);
  return { data, dataPeriod, previous, loading, error, reload };
}
