import { vi } from "vitest";
import type { FinanceState, PageProps } from "../types";

export const emptyState: FinanceState = {
  settings: { id: 1, setup_completed: true, display_name: "", currency: "BRL", monthly_net_income_cents: 0, monthly_spending_limit_cents: 0, emergency_months_target: 6, tour_completed: true },
  categories: [], transactions: [], bills: [], goals: [], investments: [], cards: [], bank_accounts: [], subscriptions: [],
};

export function makePageProps(overrides: Partial<PageProps> = {}): PageProps {
  return {
    state: emptyState,
    month: "2026-09",
    checklist: [],
    summary: null,
    version: 1,
    openModal: vi.fn(),
    openEdit: vi.fn(),
    onRemove: vi.fn(),
    notify: vi.fn(),
    refresh: vi.fn(async () => undefined),
    ...overrides,
  };
}
