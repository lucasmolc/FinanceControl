/**
 * Net-worth projection (MEL-32): pure month-by-month math in BRL cents.
 * Model per month: investments earn `returnPctOfCdi`% of the CDI (compounded monthly) and receive the contribution;
 * the bank balance receives income − expenses − contribution (no yield). Real values deflate by IPCA.
 */
import type { ProjectionBase, ProjectionGoal } from "../api/insights";
import { shiftMonth } from "./date";

export interface ProjectionScenario {
  /** Horizon in months (6, 12, 24 or 36 in the UI). */
  months: number;
  /** First projected month ("YYYY-MM"). */
  startMonth: string;
  startingBankCents: number;
  startingInvestmentsCents: number;
  monthlyIncomeCents: number;
  monthlyExpenseCents: number;
  monthlyContributionCents: number;
  /** CDI in % a.a. (e.g. 10.4). */
  cdiAnnualPct: number;
  /** Investment return as % of the CDI (e.g. 100). */
  returnPctOfCdi: number;
  /** Inflation (IPCA) in % a.a. */
  inflationAnnualPct: number;
}

export interface ProjectionMonth {
  /** 1-based month index. */
  index: number;
  month: string;
  incomeCents: number;
  expenseCents: number;
  contributionCents: number;
  yieldCents: number;
  bankCents: number;
  investmentsCents: number;
  totalCents: number;
  /** Total in today's money (deflated by IPCA). */
  realTotalCents: number;
}

export const HORIZONS = [6, 12, 24, 36] as const;
export const DEFAULT_CDI_PCT = 10.4;
export const DEFAULT_IPCA_PCT = 4.5;

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);

/** Equivalent monthly rate of an annual percentage: (1 + a)^(1/12) − 1. Negative rates below −100% clamp to −100%. */
export function monthlyRate(annualPct: number): number {
  const annual = Math.max(-100, finite(annualPct)) / 100;
  return (1 + annual) ** (1 / 12) - 1;
}

/** Annual investment return in % a.a. for a % of the CDI. */
export function annualReturnPct(cdiAnnualPct: number, returnPctOfCdi: number): number {
  return (finite(cdiAnnualPct) * Math.max(0, finite(returnPctOfCdi))) / 100;
}

export function projectMonths(scenario: ProjectionScenario): ProjectionMonth[] {
  const months = Math.max(0, Math.min(600, Math.floor(finite(scenario.months))));
  const rate = monthlyRate(annualReturnPct(scenario.cdiAnnualPct, scenario.returnPctOfCdi));
  const inflation = monthlyRate(scenario.inflationAnnualPct);
  const income = Math.round(finite(scenario.monthlyIncomeCents));
  const expense = Math.round(finite(scenario.monthlyExpenseCents));
  const contribution = Math.round(finite(scenario.monthlyContributionCents));
  let bank = Math.round(finite(scenario.startingBankCents));
  let investments = Math.round(finite(scenario.startingInvestmentsCents));
  const rows: ProjectionMonth[] = [];
  for (let index = 1; index <= months; index += 1) {
    const yieldCents = investments > 0 ? Math.round(investments * rate) : 0;
    investments += yieldCents + contribution;
    bank += income - expense - contribution;
    const totalCents = bank + investments;
    rows.push({
      index,
      month: shiftMonth(scenario.startMonth, index - 1),
      incomeCents: income,
      expenseCents: expense,
      contributionCents: contribution,
      yieldCents,
      bankCents: bank,
      investmentsCents: investments,
      totalCents,
      realTotalCents: Math.round(totalCents / (1 + inflation) ** index),
    });
  }
  return rows;
}

export interface ReachResult {
  /** "already": the starting total already covers the target; "reached": first month in the horizon; "beyond": not within the horizon. */
  status: "already" | "reached" | "beyond";
  index: number | null;
  month: string | null;
}

/** First projected month whose total reaches `targetCents`. */
export function reachTarget(rows: ProjectionMonth[], startingTotalCents: number, targetCents: number): ReachResult {
  if (targetCents <= 0 || startingTotalCents >= targetCents) return { status: "already", index: 0, month: null };
  const row = rows.find(item => item.totalCents >= targetCents);
  return row ? { status: "reached", index: row.index, month: row.month } : { status: "beyond", index: null, month: null };
}

export interface GoalMilestone {
  id: number;
  name: string;
  remainingCents: number;
  targetDate: string | null;
  /** "done": already funded; "on_time"/"late": reached before/after its target date (or "on_time" with no date); "beyond": not within the horizon. */
  status: "done" | "on_time" | "late" | "beyond";
  index: number | null;
  month: string | null;
}

/**
 * Goals are funded in order of target date (undated last, then by id) from the patrimony growth
 * (projected total − starting total). A goal is reached when the growth covers its remaining amount
 * plus the remaining amounts of the goals before it.
 */
export function goalMilestones(goals: ProjectionGoal[], rows: ProjectionMonth[], startingTotalCents: number): GoalMilestone[] {
  const ordered = [...goals].sort((left, right) => {
    if (left.target_date && right.target_date) return left.target_date.localeCompare(right.target_date) || left.id - right.id;
    if (left.target_date) return -1;
    if (right.target_date) return 1;
    return left.id - right.id;
  });
  let needed = 0;
  return ordered.map(goal => {
    const remainingCents = Math.max(0, goal.base_target_cents - goal.base_current_cents);
    const base = { id: goal.id, name: goal.name, remainingCents, targetDate: goal.target_date };
    if (!remainingCents) return { ...base, status: "done" as const, index: 0, month: null };
    needed += remainingCents;
    const row = rows.find(item => item.totalCents - startingTotalCents >= needed);
    if (!row) return { ...base, status: "beyond" as const, index: null, month: null };
    const late = goal.target_date !== null && row.month > goal.target_date.slice(0, 7);
    return { ...base, status: late ? "late" as const : "on_time" as const, index: row.index, month: row.month };
  });
}

/** Range of outcomes when the return varies by ±`deltaPctOfCdi` points of the CDI (lower bound never below 0%). */
export function projectionBand(scenario: ProjectionScenario, deltaPctOfCdi = 20): { lower: number[]; upper: number[] } {
  const lower = projectMonths({ ...scenario, returnPctOfCdi: Math.max(0, scenario.returnPctOfCdi - deltaPctOfCdi) });
  const upper = projectMonths({ ...scenario, returnPctOfCdi: scenario.returnPctOfCdi + deltaPctOfCdi });
  return { lower: lower.map(row => row.totalCents), upper: upper.map(row => row.totalCents) };
}

export interface ProjectionTotals { finalTotalCents: number; finalRealCents: number; yieldCents: number; savedCents: number; growthCents: number }

export function projectionTotals(rows: ProjectionMonth[], startingTotalCents: number): ProjectionTotals {
  const last = rows[rows.length - 1];
  const yieldCents = rows.reduce((sum, row) => sum + row.yieldCents, 0);
  const savedCents = rows.reduce((sum, row) => sum + row.incomeCents - row.expenseCents, 0);
  const finalTotalCents = last?.totalCents ?? startingTotalCents;
  return { finalTotalCents, finalRealCents: last?.realTotalCents ?? startingTotalCents, yieldCents, savedCents, growthCents: finalTotalCents - startingTotalCents };
}

export type IncomeBasis = "planned" | "avg3" | "avg6";
export type ExpenseBasis = "planned" | "commitments" | "avg3" | "avg6";

export function incomeFor(base: ProjectionBase, basis: IncomeBasis): number {
  if (basis === "avg3") return base.income.avg_3m_cents;
  if (basis === "avg6") return base.income.avg_6m_cents;
  return base.income.planned_monthly_cents;
}

export function expenseFor(base: ProjectionBase, basis: ExpenseBasis): number {
  if (basis === "avg3") return base.expenses.avg_3m_cents;
  if (basis === "avg6") return base.expenses.avg_6m_cents;
  if (basis === "commitments") return base.expenses.bills_monthly_cents + base.expenses.subscriptions_monthly_cents;
  return base.expenses.planned_limit_cents;
}

/** Default bases: planned figures when configured, else the 3-month averages. */
export function defaultBases(base: ProjectionBase): { income: IncomeBasis; expense: ExpenseBasis } {
  return {
    income: base.income.planned_monthly_cents > 0 ? "planned" : "avg3",
    expense: base.expenses.planned_limit_cents > 0 ? "planned" : base.expenses.avg_3m_cents > 0 ? "avg3" : "commitments",
  };
}

/** Scenario pre-filled from the server base (month after `as_of`, market indicators or conservative defaults). */
export function scenarioFromBase(base: ProjectionBase, months = 12): ProjectionScenario {
  const bases = defaultBases(base);
  return {
    months,
    startMonth: shiftMonth(base.as_of.slice(0, 7), 1),
    startingBankCents: base.starting.bank_cents,
    startingInvestmentsCents: base.starting.investments_cents,
    monthlyIncomeCents: incomeFor(base, bases.income),
    monthlyExpenseCents: expenseFor(base, bases.expense),
    monthlyContributionCents: Math.max(0, base.investment_contribution_avg_3m_cents),
    cdiAnnualPct: base.indicators.cdi_pct ?? base.indicators.selic_pct ?? DEFAULT_CDI_PCT,
    returnPctOfCdi: 100,
    inflationAnnualPct: base.indicators.ipca_12m_pct ?? DEFAULT_IPCA_PCT,
  };
}
