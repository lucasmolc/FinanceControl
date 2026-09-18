import { api } from "../api/client";
import type { BankStatementItem, GoalEntry, InvestmentEntry } from "../types";
import { usePagedList, type PagedList } from "./usePagedList";

/**
 * Movement histories, 50 rows at a time with "Carregar mais" (MEL-14); pass `id = null` to skip loading.
 * Reloads the rows already shown when `version` changes; rows of another record are hidden while the new one loads (MEL-07).
 */
export function useGoalEntries(id: number | null, version: number): PagedList<GoalEntry> {
  return usePagedList(page => api.goalEntriesPage(id!, page), id === null ? null : `goal:${id}`, version);
}

export function useInvestmentEntries(id: number | null, version: number): PagedList<InvestmentEntry> {
  return usePagedList(page => api.investmentEntriesPage(id!, page), id === null ? null : `investment:${id}`, version);
}

export function useBankStatement(id: number | null, version: number): PagedList<BankStatementItem> {
  return usePagedList(page => api.bankEntriesPage(id!, page), id === null ? null : `bank:${id}`, version);
}
