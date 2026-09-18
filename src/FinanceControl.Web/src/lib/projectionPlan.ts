/**
 * MEL-45 + CR-04 on top of the MEL-32 projection: the "Plano 70-20-10" preset scenario, the freedom-number milestone
 * (searched beyond the chart horizon) and the single emergency-reserve milestone.
 */
import type { ProjectionBase } from "../api/insights";
import { projectMonths, reachTarget, type ProjectionScenario, type ReachResult } from "./projection";

export interface PlanRule { fixedPct: number; funPct: number; investPct: number; freedomMultiplier: number; }

/** The saved plan of the base, else the 70-20-10 suggestion (150 salaries). */
export function planRuleOf(base: ProjectionBase): PlanRule {
  const plan = base.plan;
  return plan
    ? { fixedPct: plan.fixed_pct, funPct: plan.fun_pct, investPct: plan.invest_pct, freedomMultiplier: plan.freedom_multiplier || 150 }
    : { fixedPct: 70, funPct: 20, investPct: 10, freedomMultiplier: 150 };
}

export interface PlanPreset { incomeCents: number; expenseCents: number; contributionCents: number; }

/**
 * "Plano 70-20-10" scenario: income = planned salary; expenses = the 3-month average (or the plan ceiling
 * fixed + leisure when there is no history); contribution = the minimum invested + what stays below the ceiling
 * (the average surplus of fixed and leisure). Null without a planned salary.
 */
export function planPreset(base: ProjectionBase): PlanPreset | null {
  const salary = base.income.planned_monthly_cents;
  if (salary <= 0) return null;
  const rule = planRuleOf(base);
  const ceiling = Math.round((salary * (rule.fixedPct + rule.funPct)) / 100);
  const minimum = Math.round((salary * rule.investPct) / 100);
  const average = base.expenses.avg_3m_cents;
  const expenseCents = average > 0 ? average : ceiling;
  return { incomeCents: salary, expenseCents, contributionCents: minimum + Math.max(0, ceiling - expenseCents) };
}

/** The freedom number: server figure, else planned salary × multiplier (0 without salary). */
export function freedomTargetCents(base: ProjectionBase): number {
  if (typeof base.freedom_target_cents === "number" && base.freedom_target_cents > 0) return base.freedom_target_cents;
  return Math.max(0, base.income.planned_monthly_cents) * planRuleOf(base).freedomMultiplier;
}

/** Longest search for the freedom milestone (50 years). */
export const FREEDOM_SEARCH_MONTHS = 600;

/** When the projected total reaches `targetCents`, searching up to 50 years (the chart horizon is only 6–36 months). */
export function longReach(scenario: ProjectionScenario, startingTotalCents: number, targetCents: number): ReachResult {
  return reachTarget(projectMonths({ ...scenario, months: FREEDOM_SEARCH_MONTHS }), startingTotalCents, targetCents);
}

/**
 * R1 decision 3: the freedom number is measured on the invested wealth, so its milestone is the first month whose projected
 * investments reach the target (searched up to 50 years).
 */
export function longReachInvested(scenario: ProjectionScenario, targetCents: number): ReachResult {
  if (targetCents <= 0 || scenario.startingInvestmentsCents >= targetCents) return { status: "already", index: 0, month: null };
  const row = projectMonths({ ...scenario, months: FREEDOM_SEARCH_MONTHS }).find(item => item.investmentsCents >= targetCents);
  return row ? { status: "reached", index: row.index, month: row.month } : { status: "beyond", index: null, month: null };
}

/** "14 anos e 6 meses" / "8 meses" / "1 ano". */
export function durationText(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years ? `${years} ${years === 1 ? "ano" : "anos"}` : "";
  const m = rest ? `${rest} ${rest === 1 ? "mês" : "meses"}` : "";
  return [y, m].filter(Boolean).join(" e ") || "0 meses";
}

/** "03/2041" from "2041-03". */
export const monthYear = (month: string): string => `${month.slice(5, 7)}/${month.slice(0, 4)}`;

/** Goal ids that must not appear as ordinary goal milestones (the linked reserve and freedom goals have their own). */
export function linkedGoalIds(settings: { emergency_goal_id?: number | null; freedom_goal_id?: number | null }): Set<number> {
  return new Set([settings.emergency_goal_id, settings.freedom_goal_id].filter((id): id is number => typeof id === "number"));
}
