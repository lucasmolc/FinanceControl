/**
 * MEL-45 · plano 70-20-10: pure rules shared by the setup step, Configurações, the dashboard widget,
 * Relatórios and Projeções. Money is BRL cents; percentages and multipliers are integers.
 */
import type { PlanCommand, PlanSummary, Settings } from "../../types";

export interface PlanValues { fixedPct: number; funPct: number; investPct: number; emergencyMonths: number; freedomMultiplier: number; }

/** The suggestion: 70% fixed (ceiling), 20% leisure, 10% invested (floor), 6 salaries of reserve, 150 salaries of freedom number. */
export const DEFAULT_PLAN: PlanValues = { fixedPct: 70, funPct: 20, investPct: 10, emergencyMonths: 6, freedomMultiplier: 150 };

/** Editable text of the plan fields. */
export interface PlanDraft { fixed: string; fun: string; invest: string; months: string; multiplier: string; }
export type PlanErrors = Partial<Record<keyof PlanDraft | "sum", string>>;

export const PLAN_SUM_ERROR = "Os percentuais devem somar 100%.";
const PCT_ERROR = "Informe um número inteiro de 0 a 100.";
const MONTHS_ERROR = "Informe um número inteiro de 1 a 120 meses.";
const MULTIPLIER_ERROR = "Informe um número inteiro de 1 a 600 salários.";

export const draftFromPlan = (plan: PlanValues): PlanDraft => ({
  fixed: String(plan.fixedPct), fun: String(plan.funPct), invest: String(plan.investPct), months: String(plan.emergencyMonths), multiplier: String(plan.freedomMultiplier),
});

/** Integer within [min, max], or null. */
export function intIn(text: string, min: number, max: number): number | null {
  const trimmed = String(text ?? "").trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : null;
}

/** Sum of the three percentages as typed (invalid fields count as 0). */
export const pctSum = (draft: PlanDraft): number => [draft.fixed, draft.fun, draft.invest].reduce((sum, text) => sum + (intIn(text, 0, 100) ?? 0), 0);

/** Validates the draft; `values` is null while any field is invalid. */
export function readPlanDraft(draft: PlanDraft): { values: PlanValues | null; errors: PlanErrors } {
  const fixedPct = intIn(draft.fixed, 0, 100);
  const funPct = intIn(draft.fun, 0, 100);
  const investPct = intIn(draft.invest, 0, 100);
  const emergencyMonths = intIn(draft.months, 1, 120);
  const freedomMultiplier = intIn(draft.multiplier, 1, 600);
  const errors: PlanErrors = {};
  if (fixedPct === null) errors.fixed = PCT_ERROR;
  if (funPct === null) errors.fun = PCT_ERROR;
  if (investPct === null) errors.invest = PCT_ERROR;
  if (emergencyMonths === null) errors.months = MONTHS_ERROR;
  if (freedomMultiplier === null) errors.multiplier = MULTIPLIER_ERROR;
  if (fixedPct !== null && funPct !== null && investPct !== null && fixedPct + funPct + investPct !== 100) {
    errors.sum = `${PLAN_SUM_ERROR} Agora somam ${fixedPct + funPct + investPct}%.`;
  }
  if (Object.keys(errors).length || fixedPct === null || funPct === null || investPct === null || emergencyMonths === null || freedomMultiplier === null) return { values: null, errors };
  return { values: { fixedPct, funPct, investPct, emergencyMonths, freedomMultiplier }, errors };
}

export interface PlanFigures { fixedCents: number; funCents: number; investCents: number; limitCents: number; reserveCents: number; freedomCents: number; }

/** The five numbers of the plan for a monthly net salary (S = 13.000 → 9.100 / 2.600 / 1.300 / 78.000 / 1.950.000). */
export function planFigures(salaryCents: number, plan: PlanValues): PlanFigures {
  const salary = Math.max(0, Math.round(salaryCents));
  const share = (pct: number) => Math.round((salary * pct) / 100);
  return {
    fixedCents: share(plan.fixedPct),
    funCents: share(plan.funPct),
    investCents: share(plan.investPct),
    limitCents: share(plan.fixedPct + plan.funPct),
    reserveCents: salary * plan.emergencyMonths,
    freedomCents: salary * plan.freedomMultiplier,
  };
}

/** Saved plan, or null when the settings have none (older servers or never applied). */
export function planFromSettings(settings: Settings): PlanValues | null {
  const { plan_fixed_pct: fixed, plan_fun_pct: fun, plan_invest_pct: invest } = settings;
  if (typeof fixed !== "number" || typeof fun !== "number" || typeof invest !== "number") return null;
  return { fixedPct: fixed, funPct: fun, investPct: invest, emergencyMonths: settings.emergency_months_target || DEFAULT_PLAN.emergencyMonths, freedomMultiplier: settings.freedom_multiplier || DEFAULT_PLAN.freedomMultiplier };
}

export const planCommand = (plan: PlanValues, createBuckets = false): PlanCommand => ({
  fixed_pct: plan.fixedPct, fun_pct: plan.funPct, invest_pct: plan.investPct, emergency_months: plan.emergencyMonths, freedom_multiplier: plan.freedomMultiplier,
  ...(createBuckets ? { create_buckets: true } : {}),
});

/** API field → plan draft key (POST /api/plan validation). */
export function mapPlanApiFields(fields: Record<string, string>): PlanErrors {
  const map: Record<string, keyof PlanErrors> = { fixed_pct: "sum", fun_pct: "sum", invest_pct: "sum", emergency_months: "months", freedom_multiplier: "multiplier" };
  const errors: PlanErrors = {};
  for (const [field, message] of Object.entries(fields)) {
    const key = map[field];
    if (key && !errors[key]) errors[key] = message;
  }
  return errors;
}

/**
 * Yearly withdrawal needed to live off the freedom number: 12 ÷ multiplier of the salary (150× → 8%),
 * and only the fixed share (70% → 5,6%). Compare with the 4% rule (25× the yearly spending).
 */
export function withdrawalRates(plan: Pick<PlanValues, "fixedPct" | "freedomMultiplier">): { salaryPct: number; fixedPct: number } {
  const multiplier = Math.max(1, plan.freedomMultiplier);
  return { salaryPct: 1200 / multiplier, fixedPct: (12 * plan.fixedPct) / multiplier };
}

/** "5,6%" (one decimal at most). */
export const formatRatePct = (value: number): string => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** "12,5 anos de salário" for the multiplier. */
export const salaryYears = (multiplier: number): string => `${(multiplier / 12).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos de salário`;

/** "70-20-10" of a plan (the name follows the draft: "Seu plano 75-20-10"). */
export const planName = (plan: Pick<PlanValues, "fixedPct" | "funPct" | "investPct">): string => `${plan.fixedPct}-${plan.funPct}-${plan.investPct}`;

/**
 * R1 decision 1: "teto" means ONE thing, the monthly spending cap (`monthly_spending_limit_cents` = fixos + lazer with a plan).
 * The plan rows are limits and a minimum, never "teto".
 */
export const PLAN_ROW_LABELS = { fixed: "Limite de gastos fixos", fun: "Limite de lazer", invest: "Investimento mínimo", months: "Reserva de emergência", multiplier: "Número da liberdade" } as const;

/** What applying the plan does to a linked goal: update its target, create/relink it, nothing (removed) or nothing (manual target). */
export type PlanGoalEffect = "update" | "create" | "removed" | "manual";

export interface PlanApplyPreview {
  /** Monthly spending cap before and after (fixos + lazer). */
  limitBeforeCents: number;
  limitAfterCents: number;
  reserve: { targetCents: number; effect: PlanGoalEffect };
  freedom: { targetCents: number; effect: PlanGoalEffect };
}

type LinkSettings = Pick<Settings, "monthly_spending_limit_cents" | "emergency_goal_status" | "emergency_goal_id" | "emergency_goal_auto" | "freedom_goal_status" | "freedom_goal_id" | "freedom_goal_auto">;

function goalEffect(status: Settings["emergency_goal_status"], id: number | null | undefined, auto: boolean | undefined): PlanGoalEffect {
  if (auto === false) return "manual";
  const current = status ?? (id ? "linked" : "none");
  return current === "linked" ? "update" : current === "removed" ? "removed" : "create";
}

/**
 * R1 decision 2: applying the plan never changes the teto silently. The before → after cap and what happens to the two
 * linked goals (same rules as the server: linked → target updated; none → created or relinked; removed → not recreated;
 * automatic calculation off → untouched). `settings` is null on the first run (nothing exists yet).
 */
export function planApplyPreview(settings: LinkSettings | null, figures: PlanFigures): PlanApplyPreview {
  return {
    limitBeforeCents: settings?.monthly_spending_limit_cents ?? 0,
    limitAfterCents: figures.limitCents,
    reserve: { targetCents: figures.reserveCents, effect: settings ? goalEffect(settings.emergency_goal_status, settings.emergency_goal_id, settings.emergency_goal_auto) : "create" },
    freedom: { targetCents: figures.freedomCents, effect: settings ? goalEffect(settings.freedom_goal_status, settings.freedom_goal_id, settings.freedom_goal_auto) : "create" },
  };
}

/** "Teto de gastos: R$ 7.000,00 → R$ 9.900,00" (also for the success toast). */
export function limitChangeText(beforeCents: number, afterCents: number, fmt: (cents: number) => string): string {
  if (beforeCents === afterCents) return `Teto de gastos: ${fmt(afterCents)} (sem mudança)`;
  if (beforeCents <= 0) return `Teto de gastos: sem teto → ${fmt(afterCents)}`;
  return `Teto de gastos: ${fmt(beforeCents)} → ${fmt(afterCents)}`;
}

/** R1 decision 3: caption of the freedom-number progress everywhere (Metas, Painel, Configurações, Projeções). */
export const FREEDOM_PROGRESS_LABEL = "Patrimônio investido";

export interface FreedomProgress { currentCents: number; targetCents: number; pct: number; }

/**
 * Progress of the "Número da liberdade": the invested wealth sent by the server (`freedom_progress_cents`), else the linked
 * goal's current amount (older servers). Null without a target.
 */
export function freedomProgress(settings: Pick<Settings, "freedom_progress_cents" | "freedom_target_cents">, goal?: { current_cents: number; target_cents: number }): FreedomProgress | null {
  const targetCents = goal?.target_cents || settings.freedom_target_cents || 0;
  if (targetCents <= 0) return null;
  const currentCents = Math.max(0, typeof settings.freedom_progress_cents === "number" ? settings.freedom_progress_cents : goal?.current_cents ?? 0);
  return { currentCents, targetCents, pct: Math.min(100, Math.floor((currentCents / targetCents) * 1000) / 10) };
}

// ---------- Dashboard widget ----------

export type PlanBarState = "ok" | "near" | "over" | "reached" | "pending" | "empty";
export interface PlanBar { id: "fixo" | "lazer" | "investimento"; label: string; kind: "ceiling" | "floor"; realizedCents: number; limitCents: number; pct: number; state: PlanBarState; }

const NEAR_RATIO = 0.9;

/** Ceiling (fixed, leisure): over above 100%, near from 90%. */
export function ceilingState(spent: number, limit: number): PlanBarState {
  if (limit <= 0) return spent > 0 ? "over" : "empty";
  if (spent > limit) return "over";
  return spent >= limit * NEAR_RATIO ? "near" : "ok";
}

/** Floor (investment): reached at 100% of the minimum. */
export const floorState = (invested: number, minimum: number): PlanBarState => (minimum <= 0 ? "empty" : invested >= minimum ? "reached" : "pending");

const ratio = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

export function planBars(plan: PlanSummary): PlanBar[] {
  return [
    { id: "fixo", label: "Gastos fixos", kind: "ceiling", realizedCents: plan.fixed_spent_cents, limitCents: plan.fixed_limit_cents, pct: ratio(plan.fixed_spent_cents, plan.fixed_limit_cents), state: ceilingState(plan.fixed_spent_cents, plan.fixed_limit_cents) },
    { id: "lazer", label: "Lazer", kind: "ceiling", realizedCents: plan.fun_spent_cents, limitCents: plan.fun_limit_cents, pct: ratio(plan.fun_spent_cents, plan.fun_limit_cents), state: ceilingState(plan.fun_spent_cents, plan.fun_limit_cents) },
    { id: "investimento", label: "Investimento", kind: "floor", realizedCents: plan.invested_cents, limitCents: plan.invest_min_cents, pct: ratio(plan.invested_cents, plan.invest_min_cents), state: floorState(plan.invested_cents, plan.invest_min_cents) },
  ];
}

/** What stayed below the fixed-expenses ceiling (the suggestion to invest it). */
export const fixedSurplusCents = (plan: PlanSummary): number => Math.max(0, plan.fixed_limit_cents - plan.fixed_spent_cents);

/**
 * R1-PAINEL-4: when the widget invites to invest what stayed below the fixed-expenses limit. Past months: whenever there is
 * a surplus. Current month: only when the month-end forecast fits the teto ("ok"); never for future months.
 */
export function planInvitation(plan: PlanSummary, context: { timing: "past" | "current" | "future"; forecastStatus?: "none" | "ok" | "warning" | "danger" }): "past" | "current" | null {
  if (plan.fixed_limit_cents <= 0 || fixedSurplusCents(plan) <= 0) return null;
  // R4-SET-3: an empty month (no expense recorded yet) has no real difference to invest.
  if (plan.fixed_spent_cents + plan.fun_spent_cents + plan.unbucketed_expense_cents + (plan.out_of_plan_expense_cents ?? 0) <= 0) return null;
  if (context.timing === "past") return "past";
  if (context.timing === "current" && context.forecastStatus === "ok") return "current";
  return null;
}

/** Dashboard widget id of the plan (registered in lib/preferences). */
export const PLAN_WIDGET_ID = "plano";

/** Saved widget list with the plan widget shown right after the first one (unchanged when already there). */
export function withPlanWidget(saved: readonly string[]): string[] {
  if (saved.includes(PLAN_WIDGET_ID)) return [...saved];
  const next = [...saved];
  next.splice(Math.min(1, next.length), 0, PLAN_WIDGET_ID);
  return next;
}
