/** Reports, projections and market endpoints (v1.2 §2 and §4). Money is BRL cents unless noted. */
import { json, request } from "./client";

export interface ReportMonth {
  month: string; income_cents: number; expense_cents: number; investment_cents: number; net_cents: number;
  /** v1.3 (MEL-45): realized per plan bucket, same rules as `/api/summary` `plan` (absent on older servers). */
  fixed_spent_cents?: number; fun_spent_cents?: number; invested_cents?: number; unbucketed_expense_cents?: number; out_of_plan_expense_cents?: number;
}
export interface ReportTotals {
  income_cents: number; expense_cents: number; investment_cents: number; net_cents: number;
  avg_monthly_income_cents: number; avg_monthly_expense_cents: number; savings_rate_pct: number | null;
}
export interface ReportCategory { category_id: number | null; name: string; total_cents: number; share_pct: number }
export interface ReportPaymentMethod { method: string; total_cents: number; count: number }
/** Top expense (also the shape of `/api/summary` `top_expenses`, MEL-38). `amount_cents` is in `currency` minor units. */
export interface ReportTopExpense { id: number; date: string; description: string; category_name: string | null; amount_cents: number; currency: string; base_amount_cents: number }
export interface ReportNetWorth { month: string; total_cents: number; bank_cents: number; investments_cents: number }
/** `native_cents` is in the currency's minor units; `base_cents` in BRL cents. */
export interface ReportCurrencyExposure { currency: string; native_cents: number; base_cents: number; share_pct: number }

export interface ReportsData {
  from: string;
  to: string;
  months: ReportMonth[];
  totals: ReportTotals;
  expense_categories: ReportCategory[];
  income_categories: ReportCategory[];
  payment_methods: ReportPaymentMethod[];
  top_expenses: ReportTopExpense[];
  net_worth: ReportNetWorth[];
  currency_exposure: ReportCurrencyExposure[];
}

export interface ProjectionGoal { id: number; name: string; target_cents: number; current_cents: number; currency: string; base_target_cents: number; base_current_cents: number; target_date: string | null }
export interface ProjectionBase {
  as_of: string;
  currency: string;
  starting: { bank_cents: number; investments_cents: number; total_cents: number };
  income: { planned_monthly_cents: number; avg_3m_cents: number; avg_6m_cents: number };
  expenses: { planned_limit_cents: number; bills_monthly_cents: number; subscriptions_monthly_cents: number; avg_3m_cents: number; avg_6m_cents: number };
  investment_contribution_avg_3m_cents: number;
  indicators: { selic_pct: number | null; cdi_pct: number | null; ipca_12m_pct: number | null };
  goals: ProjectionGoal[];
  emergency: { months_target: number; monthly_limit_cents: number; reserve_target_cents: number };
  /** MEL-45: saved 70-20-10 plan (null without a plan; absent on older servers). */
  plan?: ProjectionPlan | null;
  /** MEL-45: salary × freedom multiplier (the "Número da liberdade"). */
  freedom_target_cents?: number;
  /** R1 decision 3: progress of the freedom number = invested wealth in BRL (same as `starting.investments_cents`). */
  freedom_progress_cents?: number;
}
export interface ProjectionPlan { fixed_pct: number; fun_pct: number; invest_pct: number; freedom_multiplier: number }

export type IndicatorCode = "selic" | "cdi" | "ipca_12m" | "ipca_month";
export interface MarketRate { currency: string; rate_brl: string; change_pct: number | null; source: string; fetched_at: string; manual: boolean; stale: boolean }
export interface MarketIndicator { code: IndicatorCode | string; label: string; value: number; unit: string; reference_date: string | null; source: string; fetched_at: string; stale: boolean }
export interface MarketData {
  base: string;
  auto_refresh: boolean;
  last_refresh_at: string | null;
  last_error: string | null;
  rates: MarketRate[];
  indicators: MarketIndicator[];
}
export interface MarketRefreshResult extends MarketData { refreshed?: { rates: number; indicators: number } }

// R2-X-1: the insights endpoints use the shared `request` of api/client, so every answer or network failure feeds the
// global connectivity state (offline banner, retries, refetch of the page on recovery) like the rest of the app.

const range = (from: string, to: string) => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

export const insightsApi = {
  reports: (from: string, to: string) => request<ReportsData>(`/api/reports?${range(from, to)}`),
  /** Download URL of the period's transactions as CSV (Excel pt-BR). */
  reportsCsvUrl: (from: string, to: string) => `/api/reports/transactions.csv?${range(from, to)}`,
  projectionBase: () => request<ProjectionBase>("/api/projections/base"),
  market: () => request<MarketData>("/api/market"),
  refreshMarket: () => request<MarketRefreshResult>("/api/market/refresh", json("POST")),
  /** Manual override (BRL per 1 unit, decimal string with "." as separator). */
  setManualRate: (currency: string, rateBrl: string) => request<unknown>(`/api/market/rates/${encodeURIComponent(currency)}`, json("PUT", { rate_brl: rateBrl })),
  clearManualRate: (currency: string) => request<unknown>(`/api/market/rates/${encodeURIComponent(currency)}`, json("DELETE")),
};

export const { reports, reportsCsvUrl, projectionBase, market, refreshMarket, setManualRate, clearManualRate } = insightsApi;

/** R1 decision 4: why save buttons are disabled while the local server is unreachable (`PageProps.offline`). */
export const OFFLINE_REASON = "Sem conexão com o servidor local.";
