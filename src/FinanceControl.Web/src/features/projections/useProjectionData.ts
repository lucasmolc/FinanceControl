import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../../api/client";
import { insightsApi, type ProjectionBase, type ReportNetWorth } from "../../api/insights";
import { shiftMonth } from "../../lib/date";

export interface ProjectionData {
  base: ProjectionBase | null;
  /** Net-worth snapshots of the last months (optional context for the chart). */
  history: ReportNetWorth[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const HISTORY_MONTHS = 6;

export function useProjectionData(version: number): ProjectionData {
  const [base, setBase] = useState<ProjectionBase | null>(null);
  const [history, setHistory] = useState<ReportNetWorth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setLoading(true);
    insightsApi.projectionBase()
      .then(async next => {
        const month = next.as_of.slice(0, 7);
        const report = await insightsApi.reports(shiftMonth(month, -(HISTORY_MONTHS - 1)), month).catch(() => null);
        if (id !== request.current) return;
        setBase(next);
        setHistory(report?.net_worth.filter(item => item.month <= month) ?? []);
        setError(null);
      })
      .catch(reason => { if (id === request.current) setError(errorMessage(reason, "Não foi possível carregar a base da projeção.")); })
      .finally(() => { if (id === request.current) setLoading(false); });
  }, [version, attempt]);

  const reload = useCallback(() => setAttempt(value => value + 1), []);
  return { base, history, loading, error, reload };
}
