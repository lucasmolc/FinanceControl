import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { ChecklistItem, FinanceState, MonthlySummary } from "../types";

export interface FinanceData {
  state: FinanceState | null;
  checklist: ChecklistItem[];
  summary: MonthlySummary | null;
  /** Month the loaded checklist/summary belong to (null before the first load). R1-PAINEL-3: the App keeps this month
   *  selected when loading another one fails (offline), so a month label never shows another month's numbers. */
  dataMonth: string | null;
  /** Increments after every successful refresh; pages that fetch their own data depend on it. */
  version: number;
  /** True only until the first load settles. */
  loading: boolean;
  /** True while any refresh is in flight (`aria-busy` on main, MEL-07). */
  refreshing: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  refresh: () => Promise<void>;
}

/**
 * Loads state + checklist(month) + summary(month) in parallel. Stale responses (older month or older refresh) are ignored.
 * A failing summary does not block the app (summary becomes null); state/checklist failures set `error`.
 */
export function useFinanceData(month: string): FinanceData {
  const [state, setState] = useState<FinanceState | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [dataMonth, setDataMonth] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(true);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    setRefreshing(true);
    try {
      const [nextState, nextChecklist, nextSummary] = await Promise.all([
        api.state(),
        api.checklist(month),
        api.summary(month).catch(() => null),
      ]);
      if (request !== requestRef.current) return;
      setState(nextState);
      setChecklist(nextChecklist);
      setSummary(nextSummary);
      setDataMonth(month);
      setError(null);
      setVersion(value => value + 1);
    } catch (reason) {
      if (request === requestRef.current) setError(errorMessage(reason, "Falha ao carregar os dados."));
    } finally {
      if (request === requestRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, [month]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { state, checklist, summary, dataMonth, version, loading, refreshing, error, setError, refresh };
}
