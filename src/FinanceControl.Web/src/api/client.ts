import type {
  AboutInfo, AutoDebitRunResult, CurrencyDto, SettingsUpdate, BankStatementItem, CardInvoice, CardInvoiceDetail, CardLinks, CategoryLinks, ChecklistCommand, ChecklistItem, CloseMonthResult, EntriesPage, FinanceState, GoalEntry,
  InvestmentEntry, InvoicePayCommand, InvoicePayResult, MonthClosing, MonthlySummary, PageRequest, ReassignResult, RecordModule, RestoreBackupResult, SubscriptionChargeCommand,
  SubscriptionChargeResult, Transaction, PlanCommand, CardInvoiceRow, ImportCommand, ImportPreview, ImportResult, ResetAccountResult,
} from "../types";
import { isGatewayFailure, reportRequestFailure, reportRequestSuccess } from "./connectivity";
import { reportUnauthorized } from "./session";

interface ProblemDetails { title?: string; detail?: string; errors?: Record<string, string[] | string>; }

export const DEFAULT_ERROR_MESSAGE = "Não foi possível concluir a operação.";
export const NETWORK_ERROR_MESSAGE = "Não foi possível conectar ao servidor local. Verifique se a aplicação está em execução.";

export class ApiError extends Error {
  readonly status: number;
  /** First message per API field (snake_case keys from ProblemDetails.errors). */
  readonly fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

function firstMessages(errors: ProblemDetails["errors"]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(errors ?? {})) {
    const message = Array.isArray(value) ? value.find(item => typeof item === "string" && item.trim()) : value;
    if (typeof message === "string" && message.trim()) fields[key] = message;
  }
  return fields;
}

async function readProblem(response: Response): Promise<ProblemDetails | undefined> {
  try {
    const text = await response.text();
    const parsed: unknown = text ? JSON.parse(text) : undefined;
    return parsed && typeof parsed === "object" ? parsed as ProblemDetails : undefined;
  } catch {
    return undefined;
  }
}

const isProblemDetails = (problem: ProblemDetails | undefined): boolean =>
  Boolean(problem && (typeof problem.title === "string" || typeof problem.detail === "string" || problem.errors));

/** Fetch + error mapping: throws ApiError with pt-BR messages; returns the successful response. */
async function send(url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try { response = await fetch(url, init); }
  catch { reportRequestFailure(); throw new ApiError(NETWORK_ERROR_MESSAGE, 0); }
  // R1 decision 4: every answer feeds the global offline banner (a dev-proxy gateway error means the API is down).
  if (isGatewayFailure(response.status)) { reportRequestFailure(); throw new ApiError(NETWORK_ERROR_MESSAGE, 0); }
  // A 500 without a ProblemDetails body is the dev proxy (ECONNREFUSED), not the API: confirm with /api/health like a
  // network failure (the API itself always answers its 500s with ProblemDetails JSON).
  const problem = response.ok ? undefined : await readProblem(response);
  if (response.status === 500 && !isProblemDetails(problem)) { reportRequestFailure(); throw new ApiError(NETWORK_ERROR_MESSAGE, 0); }
  reportRequestSuccess();
  if (response.status === 401) reportUnauthorized();

  if (!response.ok) {
    const fields = firstMessages(problem?.errors);
    const firstField = Object.values(fields)[0];
    throw new ApiError(firstField ?? problem?.detail ?? problem?.title ?? DEFAULT_ERROR_MESSAGE, response.status, fields);
  }
  return response;
}

async function readBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Shared fetch wrapper: throws ApiError with pt-BR messages; 204 → undefined. Exported for feature API modules (e.g. api/insights.ts). */
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  return readBody<T>(await send(url, init));
}

/** Paged entry listing (MEL-14): `limit`/`offset` query + total from the `X-Total-Count` header (null when absent). */
async function requestPage<T>(url: string, page: PageRequest): Promise<EntriesPage<T>> {
  const response = await send(`${url}?limit=${page.limit}&offset=${page.offset}`);
  const items = (await readBody<T[]>(response)) ?? [];
  const header = response.headers.get("X-Total-Count");
  const total = header !== null && /^\d+$/.test(header.trim()) ? Number(header) : null;
  return { items, total };
}

/**
 * JSON request init for every call that changes data (exported for feature API modules). The server rejects changes
 * without `X-Requested-With` (anti-CSRF: forms and scripts from other sites cannot send it).
 */
export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json", "X-Requested-With": "FinanceControl" },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const monthQuery = (month: string) => `month=${encodeURIComponent(month)}`;

export interface OkResult { ok: boolean; }
export interface CreatedResult { ok: boolean; id: number; }
export interface EmergencyGoalResult { ok: boolean; id?: number | null; }
export interface ChecklistResult { ok: boolean; transaction_id: number | null; }

export const api = {
  state: () => request<FinanceState>("/api/state"),
  summary: (month: string) => request<MonthlySummary>(`/api/summary?${monthQuery(month)}`),
  transactions: (month: string) => request<Transaction[]>(`/api/transactions?${monthQuery(month)}`),
  checklist: (month: string) => request<ChecklistItem[]>(`/api/checklist?${monthQuery(month)}`),
  setChecklist: (body: ChecklistCommand) => request<ChecklistResult>("/api/checklist", json("POST", body)),

  settings: (body: SettingsUpdate) => request<OkResult>("/api/settings", json("PUT", body)),
  /** MEL-43: creates (or relinks) the emergency reserve goal now ("Criar novamente"). */
  createEmergencyGoal: () => request<EmergencyGoalResult>("/api/settings/emergency-goal", json("POST")),
  setup: (body: unknown) => request<OkResult>("/api/setup", json("POST", body)),
  skipSetup: () => request<OkResult>("/api/setup/skip", json("POST")),
  /** MEL-45: saves the 70-20-10 plan (limit, reserve and "Número da liberdade" goals; optional bucket categories). */
  plan: (body: PlanCommand) => request<OkResult>("/api/plan", json("POST", body)),
  /** MEL-45: clears the plan (linked goals are kept). */
  clearPlan: () => request<void>("/api/plan", json("DELETE")),
  /** MEL-45: creates (or relinks) the "Número da liberdade" goal now ("Criar novamente"). */
  createFreedomGoal: () => request<EmergencyGoalResult>("/api/settings/freedom-goal", json("POST")),

  create: (module: RecordModule, body: unknown) => request<CreatedResult>(`/api/${module}`, json("POST", body)),
  update: (module: RecordModule, id: number, body: unknown) => request<OkResult>(`/api/${module}/${id}`, json("PUT", body)),
  remove: (module: RecordModule, id: number) => request<void>(`/api/${module}/${id}`, json("DELETE")),
  restore: (module: RecordModule, id: number) => request<OkResult>(`/api/${module}/${id}/restore`, json("POST")),

  addGoalEntry: (id: number, body: unknown) => request<CreatedResult>(`/api/goals/${id}/entries`, json("POST", body)),
  addInvestmentEntry: (id: number, body: unknown) => request<CreatedResult>(`/api/investments/${id}/entries`, json("POST", body)),
  addBankEntry: (id: number, body: unknown) => request<CreatedResult>(`/api/bank-accounts/${id}/entries`, json("POST", body)),
  removeGoalEntry: (goalId: number, entryId: number) => request<void>(`/api/goals/${goalId}/entries/${entryId}`, json("DELETE")),
  removeInvestmentEntry: (investmentId: number, entryId: number) => request<void>(`/api/investments/${investmentId}/entries/${entryId}`, json("DELETE")),
  removeBankEntry: (accountId: number, entryId: number) => request<void>(`/api/bank-accounts/${accountId}/entries/${entryId}`, json("DELETE")),
  /** Undo an estorno (MEL-13). */
  restoreGoalEntry: (goalId: number, entryId: number) => request<OkResult>(`/api/goals/${goalId}/entries/${entryId}/restore`, json("POST")),
  restoreInvestmentEntry: (investmentId: number, entryId: number) => request<OkResult>(`/api/investments/${investmentId}/entries/${entryId}/restore`, json("POST")),
  restoreBankEntry: (accountId: number, entryId: number) => request<OkResult>(`/api/bank-accounts/${accountId}/entries/${entryId}/restore`, json("POST")),
  /** Paged listings (MEL-14). */
  goalEntriesPage: (id: number, page: PageRequest) => requestPage<GoalEntry>(`/api/goals/${id}/entries`, page),
  investmentEntriesPage: (id: number, page: PageRequest) => requestPage<InvestmentEntry>(`/api/investments/${id}/entries`, page),
  bankEntriesPage: (id: number, page: PageRequest) => requestPage<BankStatementItem>(`/api/bank-accounts/${id}/entries`, page),

  /** Monthly closing (MEL-22). */
  closings: () => request<MonthClosing[]>("/api/months/closings"),
  closeMonth: (month: string, notes: string | null) => request<CloseMonthResult>(`/api/months/${encodeURIComponent(month)}/close`, json("POST", notes ? { notes } : {})),
  reopenMonth: (month: string) => request<OkResult>(`/api/months/${encodeURIComponent(month)}/reopen`, json("POST")),

  /** Card invoices (MEL-23). */
  cardInvoices: (cardId: number, range?: { from: string; to: string }) => request<CardInvoice[]>(`/api/cards/${cardId}/invoices${range ? `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : ""}`),
  cardInvoice: (cardId: number, month: string) => request<CardInvoiceDetail>(`/api/cards/${cardId}/invoices/${encodeURIComponent(month)}`),
  payInvoice: (cardId: number, month: string, body: InvoicePayCommand) => request<InvoicePayResult>(`/api/cards/${cardId}/invoices/${encodeURIComponent(month)}/pay`, json("POST", body)),
  undoInvoicePayment: (cardId: number, month: string) => request<void>(`/api/cards/${cardId}/invoices/${encodeURIComponent(month)}/pay`, json("DELETE")),

  /** Exact link counts for the removal dialog (MEL-41). */
  categoryLinks: (id: number) => request<CategoryLinks>(`/api/categories/${id}/links`),
  cardLinks: (id: number) => request<CardLinks>(`/api/cards/${id}/links`),

  chargeSubscription: (id: number, body: SubscriptionChargeCommand) => request<SubscriptionChargeResult>(`/api/subscriptions/${id}/charge`, json("POST", body)),
  undoSubscriptionCharge: (id: number, date: string) => request<void>(`/api/subscriptions/${id}/charge?date=${encodeURIComponent(date)}`, json("DELETE")),
  reassignCategory: (id: number, targetId: number | null) => request<ReassignResult>(`/api/categories/${id}/reassign`, json("POST", { target_id: targetId })),
  reassignCard: (id: number, targetId: number | null) => request<ReassignResult>(`/api/cards/${id}/reassign`, json("POST", { target_id: targetId })),

  /** Currency catalog (MEL-26); the frontend mirror lives in lib/currencies.ts. */
  currencies: () => request<CurrencyDto[]>("/api/currencies"),
  /** Runs due auto-debits (MEL-29); idempotent. */
  runAutoDebits: () => request<AutoDebitRunResult>("/api/auto-debits/run", json("POST")),

  /** v1.4: lê a fatura ou o extrato enviado sem gravar nada, e grava as linhas escolhidas. */
  importPreview: (body: ImportCommand) => request<ImportPreview>("/api/imports/preview", json("POST", body)),
  importCommit: (body: ImportCommand) => request<ImportResult>("/api/imports/commit", json("POST", body)),

  about: () => request<AboutInfo>("/api/about"),
  /** R1 decision 4: liveness probe of the local server (offline banner retries). */
  health: () => request<unknown>("/api/health"),
  restoreBackup: (document: unknown) => request<RestoreBackupResult>("/api/backup/restore", json("POST", document)),
  /** v1.4: apaga todos os dados da conta e volta ao primeiro acesso (exige o texto de confirmação). */
  resetAccount: (body: { confirmation: string }) => request<ResetAccountResult>("/api/reset", json("POST", body)),
  backupUrl: "/api/backup",
  databaseBackupUrl: "/api/backup/database",
  /** R1-BILLS-2: card invoices due in `month` plus earlier unpaid closed ones (every active card). */
  cardInvoicesDue: (month: string) => request<CardInvoiceRow[]>(`/api/card-invoices?month=${encodeURIComponent(month)}`),
};

/** Human message for any thrown value. */
export const errorMessage = (reason: unknown, fallback = DEFAULT_ERROR_MESSAGE) => reason instanceof Error && reason.message ? reason.message : fallback;

/**
 * R3 decision 1: true for a failure to reach the local server (network error, dev-proxy gateway error) — the global
 * offline banner owns that message, so pages show no error toast, retry button or error block for it. Accepts the thrown
 * value, an Error rebuilt from its message, or the message string itself (pages that keep `errorMessage(reason)`).
 */
export function isConnectivityError(reason: unknown): boolean {
  if (reason instanceof ApiError) return reason.status === 0;
  if (reason instanceof Error) return reason.message === NETWORK_ERROR_MESSAGE;
  return reason === NETWORK_ERROR_MESSAGE;
}
