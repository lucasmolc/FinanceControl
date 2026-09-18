import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../api/client";
import type { EntriesPage, PageRequest } from "../types";

export const PAGE_SIZE = 50;
/** Largest `limit` the API accepts (MEL-14). */
const MAX_PAGE = 200;

export interface PagedList<T> {
  items: T[];
  /** Total rows on the server (X-Total-Count); null when unknown. */
  total: number | null;
  /** True while the first page (or a refresh) loads. */
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
}

/**
 * Paged listing (MEL-14): loads `pageSize` rows for `recordKey` (null skips loading), appends the next page on `loadMore`
 * and, when `version` changes, reloads the rows already shown (up to MAX_PAGE) so the list follows app refreshes.
 * Rows of another record are never returned while the new one loads.
 */
export function usePagedList<T>(load: (page: PageRequest) => Promise<EntriesPage<T>>, recordKey: string | null, version: number, pageSize = PAGE_SIZE): PagedList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [lastPageFull, setLastPageFull] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(recordKey !== null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  const keyRef = useRef(recordKey);
  const countRef = useRef(0);
  const loadedKeyRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { keyRef.current = recordKey; }, [recordKey]);

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    const key = keyRef.current;
    const sameRecord = key !== null && key === loadedKeyRef.current;
    const limit = Math.min(MAX_PAGE, Math.max(pageSize, sameRecord ? countRef.current : 0));
    setLoading(true);
    try {
      const page = await loadRef.current({ limit, offset: 0 });
      if (request !== requestRef.current) return;
      countRef.current = page.items.length;
      loadedKeyRef.current = key;
      setItems(page.items);
      setTotal(page.total);
      setLastPageFull(page.items.length >= limit);
      setLoadedKey(key);
      setError(null);
    } catch (reason) {
      if (request === requestRef.current) setError(errorMessage(reason, "Falha ao carregar os dados."));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    const key = keyRef.current;
    if (key === null || key !== loadedKeyRef.current) return;
    const request = ++requestRef.current;
    const offset = countRef.current;
    setLoadingMore(true);
    try {
      const page = await loadRef.current({ limit: pageSize, offset });
      if (request !== requestRef.current) return;
      countRef.current = offset + page.items.length;
      setItems(current => [...current.slice(0, offset), ...page.items]);
      setTotal(page.total);
      setLastPageFull(page.items.length >= pageSize);
      setError(null);
    } catch (reason) {
      if (request === requestRef.current) setError(errorMessage(reason, "Falha ao carregar os dados."));
    } finally {
      if (request === requestRef.current) setLoadingMore(false);
    }
  }, [pageSize]);

  useEffect(() => {
    if (recordKey === null) return;
    void reload();
  }, [recordKey, version, reload]);

  const current = recordKey !== null && loadedKey === recordKey;
  const shown = current ? items : [];
  const hasMore = current && (total !== null ? shown.length < total : lastPageFull);
  return { items: shown, total: current ? total : null, loading, loadingMore, error, hasMore, reload, loadMore };
}
