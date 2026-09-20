export type PageId = "dashboard" | "transactions" | "bills" | "goals" | "investments" | "cards" | "accounts" | "categories" | "subscriptions" | "settings"
  | "reports" | "projections" | "market"
  /** Dev-only component gallery (`#/componentes`, MEL-42). */
  | "components";
/** Hash query parameters of the current route (`#/lancamentos?categoria=3&tipo=expense` → { categoria: "3", tipo: "expense" }). */
export type RouteParams = Record<string, string>;
export type RecordModule = "transactions" | "bills" | "goals" | "investments" | "cards" | "bank-accounts" | "categories" | "subscriptions";
export type ModalKind = "transaction" | "bill" | "bill-payment" | "goal" | "goal-entry" | "investment" | "investment-entry" | "card" | "bank-account" | "bank-entry" | "category" | "subscription" | "subscription-charge" | "invoice-payment" | "month-close";
export type FormState = Record<string, string | number | boolean | null | undefined>;

/** Appearance preferences (MEL-30), stored in settings.ui_preferences. */
export type ThemeId = "noite" | "esmeralda" | "ouro" | "grafite" | "claro" | "sistema";
export type AccentId = "indigo" | "esmeralda" | "ouro" | "violeta" | "ciano" | "rosa";
export type DensityId = "confortavel" | "compacto";
export interface UiPreferences {
  theme: ThemeId; accent: AccentId; density: DensityId; animations: boolean; hide_values: boolean; show_market_ticker: boolean;
  /** Ordered subset of the dashboard widget ids. */
  dashboard_widgets: string[];
}
export type EmergencyGoalStatus = "linked" | "removed" | "none";

export interface Settings {
  id: number; setup_completed: boolean; display_name: string; currency: string; monthly_net_income_cents: number; monthly_spending_limit_cents: number; emergency_months_target: number; tour_completed: boolean;
  /** v1.2 fields; optional so older servers still work. */
  ui_preferences?: Partial<UiPreferences> | null; market_auto_refresh?: boolean;
  /** MEL-43: reserve = monthly_net_income_cents × emergency_months_target, kept in one linked goal. */
  emergency_reserve_target_cents?: number; emergency_goal_id?: number | null; emergency_goal_auto?: boolean; emergency_goal_status?: EmergencyGoalStatus;
  /** MEL-45: 70-20-10 plan (null pcts = no plan) and the linked "Número da liberdade" goal (salary × freedom_multiplier). */
  plan_fixed_pct?: number | null; plan_fun_pct?: number | null; plan_invest_pct?: number | null; freedom_multiplier?: number;
  freedom_target_cents?: number; freedom_goal_id?: number | null; freedom_goal_auto?: boolean; freedom_goal_status?: EmergencyGoalStatus;
}
export interface Category { id: number; name: string; kind: "income" | "expense" | "investment"; monthly_budget_cents: number; active: boolean; /** MEL-39: glyph id (lib/icons) and #rrggbb. */ icon?: string | null; color?: string | null; /** MEL-45: plan bucket (null = not assigned). */ bucket?: CategoryBucket | null; }
export interface Transaction { id: number; date: string; description: string; category_id: number | null; category_name: string | null; kind: Category["kind"]; amount_cents: number; payment_method: string; account_id: number | null; account_name: string | null; notes?: string | null; /** Credit card of a card purchase (MEL-23); optional for older servers. */ card_id?: number | null; card_name?: string | null;
  /** MEL-26: currency of the amount (minor units) + BRL cents at save time and the rate used ("1" for BRL). */
  currency?: string; base_amount_cents?: number | null; exchange_rate?: string | null;
  /** MEL-39: service/merchant brand id (lib/brands). */
  brand?: string | null;
  /** v1.4: posição e total de parcelas da compra ("6/10") e o grupo que une a série. */
  installment_number?: number | null; installment_count?: number | null; installment_group?: string | null;
  /** v1.4: veio de uma importação de fatura ou extrato. */
  imported?: boolean;
}
/** Auto-debit fields shared by bills and subscriptions (MEL-29). */
export interface AutoDebitFields { auto_debit?: boolean; auto_debit_since?: string | null; account_id?: number | null; account_name?: string | null; currency?: string; }
export interface Bill extends AutoDebitFields { id: number; name: string; amount_cents: number; due_day: number; category_id: number | null; category_name?: string | null; recurring: boolean; active: boolean; icon?: string | null; brand?: string | null; }
export interface ChecklistItem extends Bill { paid: boolean; paid_at: string | null; transaction_id: number | null; }
export interface Goal { id: number; name: string; type: string; target_cents: number; current_cents: number; target_date: string | null; currency: string; active: boolean; notes?: string | null; }
export interface Investment { id: number; name: string; institution: string | null; type: string; invested_cents: number; current_cents: number; liquidity: string | null; benchmark: string | null; active: boolean; currency?: string; brand?: string | null; logo_data?: string | null; }
export interface Card {
  id: number; name: string; closing_day: number; due_day: number; real_limit_cents: number; personal_limit_cents: number; active: boolean;
  /** Invoice figures from /api/state (MEL-23); optional for older servers. */
  open_invoice_cents?: number; unpaid_invoices_cents?: number; available_limit_cents?: number | null;
  /** MEL-35: issuer brand id, network and card color (#rrggbb). Cards are always BRL. */
  brand?: string | null; network?: CardNetwork | string | null; color?: string | null;
  /** v1.4: últimos 4 dígitos, usados para saber de qual cartão é cada compra da fatura importada. */
  last_digits?: string | null;
}
export type CardNetwork = "visa" | "mastercard" | "elo" | "amex" | "hipercard" | "other";
export interface BankAccount { id: number; name: string; institution: string; account_type: string; current_balance_cents: number; color_label: string | null; active: boolean; /** Latest movement date (MEL-14); optional for older servers. */ last_movement_date?: string | null; currency?: string; brand?: string | null; logo_data?: string | null; }
export interface Subscription extends AutoDebitFields { id: number; name: string; amount_cents: number; billing_day: number; category_id: number | null; category_name: string | null; card_id: number | null; card_name: string | null; frequency: string; next_billing_date: string | null; active: boolean; notes?: string | null; /** Latest charge date whose transaction still exists (MEL-05). */ last_charge_date?: string | null; icon?: string | null; brand?: string | null; }
export interface FinanceState { settings: Settings; categories: Category[]; transactions: Transaction[]; bills: Bill[]; goals: Goal[]; investments: Investment[]; cards: Card[]; bank_accounts: BankAccount[]; subscriptions: Subscription[];
  /** MEL-46: currencies in use without a saved rate (left out of the BRL totals); optional for older servers. */
  missing_rate_currencies?: string[]; }

export interface CategorySpend { category_id: number; name: string; monthly_budget_cents: number; spent_cents: number; active: boolean; }
export interface MonthlySummary {
  month: string; income_cents: number; expense_cents: number; investment_cents: number; transactions_count: number; uncategorized_expense_cents: number; categories: CategorySpend[];
  bills: { total_count: number; paid_count: number; total_cents: number; paid_cents: number };
  /** Realized income/investment per category (MEL-11); optional so older servers still work. */
  income_categories?: CategorySpend[]; investment_categories?: CategorySpend[]; uncategorized_income_cents?: number; uncategorized_investment_cents?: number;
  /** Monthly closing (MEL-22); optional so older servers still work. */
  closed?: boolean; closed_at?: string | null;
  /** MEL-38: 10 largest expenses (BRL) and the daily spend of the month; optional for older servers. */
  top_expenses?: TopExpense[]; daily_expenses?: DailyExpense[];
  /** MEL-45: month figures of the 70-20-10 plan (null without a plan; absent on older servers). */
  plan?: PlanSummary | null;
}
/** Largest expense item (same shape as /api/reports `top_expenses`). */
export interface TopExpense { id: number; date: string; description: string; category_name: string | null; amount_cents: number; currency: string; base_amount_cents: number; }
export interface DailyExpense { date: string; total_cents: number; }
export type GoalEntryKind = "contribution" | "withdrawal";
export interface GoalEntry { id: number; goal_id: number; date: string; amount_cents: number; notes: string | null; kind?: GoalEntryKind | string; }
export interface InvestmentEntry { id: number; investment_id: number; date: string; kind: string; amount_cents: number; notes: string | null; }
export interface BankStatementItem { id: number; source: "entry" | "transaction"; date: string; description: string; kind: string; amount_cents: number; delta_cents: number | null; related_account_id: number | null; related_account_name: string | null; notes: string | null; }
export interface AboutInfo { database_path: string; schema_version: string; }
export interface ChecklistCommand { bill_id: number; month: string; paid: boolean; register_transaction?: boolean; date?: string; amount_cents?: number; account_id?: number | null; payment_method?: string; }
export interface SubscriptionChargeCommand { date?: string; amount_cents?: number; account_id?: number | null; payment_method?: string; }
export interface SubscriptionChargeResult { ok: boolean; transaction_id: number; charge_date: string; }
/** POST /api/auto-debits/run (MEL-29). */
export interface AutoDebitCreated { kind: "bill" | "subscription"; id: number; name: string; date: string; amount_cents: number; currency: string; transaction_id: number; }
export interface AutoDebitRunResult { created: AutoDebitCreated[]; }
/** GET /api/currencies (MEL-26). */
export interface CurrencyDto { code: string; name: string; symbol: string; decimals: number; kind: "fiat" | "crypto" | string; }
/** PUT /api/settings body (every field optional; only sent fields change). */
export interface SettingsUpdate {
  display_name?: string; monthly_net_income_cents?: number; monthly_spending_limit_cents?: number; emergency_months_target?: number; tour_completed?: boolean;
  ui_preferences?: Partial<UiPreferences>; market_auto_refresh?: boolean;
  /** MEL-43: automatic reserve target (salary × months) on/off. */
  emergency_goal_auto?: boolean;
  /** MEL-45: freedom number multiplier (1–600) and its automatic target switch. */
  freedom_multiplier?: number; freedom_goal_auto?: boolean;
}
export interface ReassignResult { ok: boolean; updated: { transactions?: number; bills?: number; subscriptions?: number }; }
/** A closed month (MEL-22): `summary` is the /api/summary document stored at closing. */
export interface MonthClosing { month: string; closed_at: string; notes: string | null; summary: MonthlySummary | null; }
export interface CloseMonthResult { ok: boolean; month: string; closed_at: string; }

export type InvoiceStatus = "aberta" | "fechada" | "vencida" | "paga";
export interface InvoicePayment { amount_cents: number; date: string; account_id: number | null; account_name: string | null; bank_entry_id: number | null; }
/** Card invoice identified by its due month (MEL-23). */
export interface CardInvoice {
  month: string; period_start: string; period_end: string; closing_date: string; due_date: string;
  total_cents: number; items_count: number; status: InvoiceStatus | string; paid: InvoicePayment | null;
  /** v1.4: cobranças de assinatura esperadas neste ciclo e ainda não lançadas (fora do total realizado). */
  projected_cents?: number; projected_count?: number;
}
/** v1.4: cobrança de assinatura prevista em uma fatura que ainda não fechou. */
export interface ProjectedInvoiceItem {
  subscription_id: number; name: string; date: string; amount_cents: number; currency: string;
  base_amount_cents: number; brand: string | null; category_id: number | null; category_name: string | null;
}
export interface CardInvoiceDetail extends CardInvoice { items: Transaction[]; projected?: ProjectedInvoiceItem[]; }

/** Importação de fatura ou extrato (v1.4). */
export interface ImportCommand {
  card_id?: number | null; account_id?: number | null; file_name?: string | null; content_base64: string;
  positive_is_expense?: boolean | null; category_id?: number | null; fingerprints?: string[] | null;
}
export type ImportLineStatus = "novo" | "duplicado" | "importado" | "pagamento" | "mes_fechado";
export interface ImportLine {
  fingerprint: string; date: string; description: string; kind: Category["kind"]; amount_cents: number; currency: string;
  card_id: number | null; card_name: string | null; account_id: number | null; invoice_month: string | null;
  installment_number: number | null; installment_count: number | null; purchase_date: string | null;
  notes: string | null; status: ImportLineStatus | string;
  /** Lançamento já existente que a linha parece repetir (cobrança de assinatura, por exemplo). */
  duplicate_of: string | null; duplicate_date: string | null;
}
export interface ImportTotals {
  lines: number; new: number; duplicate: number; imported: number; payment: number; closed_month: number;
  expense_cents: number; income_cents: number;
}
export interface ImportPreview {
  format: string; target_kind: "card" | "account" | string; target_id: number; target_name: string; currency: string;
  positive_is_expense: boolean; lines: ImportLine[]; totals: ImportTotals;
}
export interface ImportResult { created: number; skipped: number; ids: number[]; }
export interface InvoicePayCommand { account_id: number; date?: string; amount_cents?: number; }
export interface InvoicePayResult { ok: boolean; bank_entry_id: number; }

/** Exact link counts (MEL-41). */
export interface CategoryLinks { transactions: number; bills: number; subscriptions: number; }
export interface CardLinks { transactions: number; subscriptions: number; }

/** One page of an entry listing (MEL-14); `total` from X-Total-Count (null when the server does not send it). */
export interface EntriesPage<T> { items: T[]; total: number | null; }
export interface PageRequest { limit: number; offset: number; }

export interface RestoreBackupResult { ok: boolean; safety_copy: string; restored: Record<string, number>; }
/** v1.4: zerar a conta devolve onde ficou a cópia automática feita antes de apagar. */
export interface ResetAccountResult { ok: boolean; safety_copy: string; }

/** Opens a record form in create mode (`initial` pre-fills/overrides the form defaults). */
export type OpenModal = (kind: ModalKind, initial?: FormState) => void;
/** Opens a record form in edit mode; the definition's `fromRecord` builds the form from `record` (must carry `id`). */
export type OpenEdit = (kind: ModalKind, record: object) => void;
/** Confirm + soft delete + notice with "Desfazer". */
export type RemoveRecord = (module: RecordModule, id: number, label: string) => void;

export interface NoticeAction { label: string; run: () => void | Promise<void>; }
export interface Notice { message: string; action?: NoticeAction; }
export type Notify = (message: string, action?: NoticeAction) => void;

/** Record whose soft delete is in flight (row shows "Removendo…"). */
export interface RemovingRecord { module: RecordModule; id: number; }

export interface PageProps {
  state: FinanceState;
  month: string;
  checklist: ChecklistItem[];
  summary: MonthlySummary | null;
  version: number;
  openModal: OpenModal;
  openEdit: OpenEdit;
  onRemove: RemoveRecord;
  notify: Notify;
  refresh: () => Promise<void>;
  /** Set while a removal is in flight (MEL-07). */
  removing?: RemovingRecord | null;
  /** Opens the month closing dialog for `month` (MEL-22). */
  onCloseMonth?: () => void;
  /** Confirms and reopens a closed month (MEL-22); resolves when done (false when cancelled or failed). */
  onReopenMonth?: (month: string) => Promise<boolean>;
  /** Parsed hash query of the current route (e.g. `#/lancamentos?categoria=3&tipo=expense`); empty object when none. */
  routeParams?: RouteParams;
  /** Navigates to a page, optionally with hash query parameters (drill-down links). */
  navigate?: (page: PageId, params?: RouteParams) => void;
  /** Shows an action failure as an error toast (MEL-28; replaces in-page error banners). */
  notifyError?: (reason: unknown) => void;
}

/** MEL-45: category bucket of the 70-20-10 plan ("fora" = outside the plan). */
export type CategoryBucket = "fixo" | "lazer" | "investimento" | "fora";
/** MEL-45: `/api/summary` `plan` (month, BRL cents; spend by category bucket). */
export interface PlanSummary {
  fixed_limit_cents: number; fun_limit_cents: number; invest_min_cents: number;
  fixed_spent_cents: number; fun_spent_cents: number; invested_cents: number; unbucketed_expense_cents: number;
  /** Plan percentages and the spend in "fora do plano" categories (optional: older servers). */
  fixed_pct?: number; fun_pct?: number; invest_pct?: number; out_of_plan_expense_cents?: number;
}
/** MEL-45: POST /api/plan body. */
export interface PlanCommand { fixed_pct: number; fun_pct: number; invest_pct: number; emergency_months: number; freedom_multiplier: number; create_buckets?: boolean; }
/** MEL-46: `/api/summary` `payment_methods` — expenses of the month (BRL cents) per payment method. */
export interface SummaryPaymentMethod { method: string; total_cents: number; count: number; }
/** MEL-46 (declaration merge, append-only): optional so older servers still work (the widget then falls back to 6 months). */
export interface MonthlySummary { payment_methods?: SummaryPaymentMethod[]; }
/**
 * R1 decision 4 (declaration merge, append-only): true while the local server is unreachable (global offline banner in
 * the App shell). Pages that save disable their save buttons with it (reason: "Sem conexão com o servidor local.").
 */
export interface PageProps { offline?: boolean; }
/**
 * R1 decision 3 (declaration merge, append-only): progress of the "Número da liberdade" = invested wealth (current
 * investment positions in BRL, missing-rate currencies excluded). Optional: older servers do not send it.
 */
export interface Settings { freedom_progress_cents?: number; }
/** R1-BILLS-1 (declaration merge, append-only): first day the bill exists (null = always existed); checklist/summary skip earlier months. */
export interface Bill { active_since?: string | null; }
/** R1-BILLS-2: `GET /api/card-invoices?month=` row — a card invoice due in the month (or earlier and still unpaid) with its card. */
export interface CardInvoiceRow extends CardInvoice { card_id: number; card_name: string; brand: string | null; network: string | null; color: string | null; }
/** R1 decision 3: invested wealth in BRL; the linked freedom goal's `current_cents` equals it ("Patrimônio investido"). */
export interface Settings { freedom_progress_cents?: number; }
