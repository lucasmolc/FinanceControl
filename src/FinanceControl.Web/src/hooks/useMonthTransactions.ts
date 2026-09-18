import { api } from "../api/client";
import type { Transaction } from "../types";
import { useAsyncList, type AsyncList } from "./useAsyncList";

/**
 * All non-deleted transactions of `month` (GET /api/transactions?month=), reloaded when `version` changes.
 * Rows of another month are never returned while the new month loads (MEL-07): `items` is empty until it arrives.
 */
export function useMonthTransactions(month: string, version: number): AsyncList<Transaction> {
  const list = useAsyncList(() => api.transactions(month), `${month}:${version}`);
  const current = list.loadedKey?.startsWith(`${month}:`) ?? false;
  return current ? list : { ...list, items: [] };
}
