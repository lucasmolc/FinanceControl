import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../api/client";

export interface AsyncList<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Key the current `items` were loaded for (null before the first success); lets callers hide stale rows. */
  loadedKey: string | null;
}

/**
 * Loads a list with `load` whenever `key` changes (include `version` in the key to follow app refreshes).
 * `load` may be an inline function: it is read from a ref, only `key` triggers reloads. `key === null` skips loading.
 */
export function useAsyncList<T>(load: () => Promise<T[]>, key: string | null): AsyncList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(key !== null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loadRef = useRef(load);
  const keyRef = useRef(key);
  const requestRef = useRef(0);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { keyRef.current = key; }, [key]);

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    const requestKey = keyRef.current;
    setLoading(true);
    try {
      const next = await loadRef.current();
      if (request === requestRef.current) { setItems(next); setLoadedKey(requestKey); setError(null); }
    } catch (reason) {
      if (request === requestRef.current) setError(errorMessage(reason, "Falha ao carregar os dados."));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (key === null) return;
    void reload();
  }, [key, reload]);

  return { items, loading, error, reload, loadedKey };
}
