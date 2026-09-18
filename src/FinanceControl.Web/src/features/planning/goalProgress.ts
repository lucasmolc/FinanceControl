import type { Goal } from "../../types";
import { daysBetween, monthsBetween } from "../../lib/date";

export interface GoalProgress {
  /** 0–100, for the progress bar. */
  percent: number;
  remainingCents: number;
  reached: boolean;
  /** Target date is set, in the past and the goal is not reached. */
  overdue: boolean;
  /** Monthly contributions left until the target date (≥ 1), null without a future target date. */
  monthsLeft: number | null;
  /** Amount to contribute per month to reach the target on time (rounded up), null when not applicable. */
  monthlyNeededCents: number | null;
}

export function goalProgress(goal: Pick<Goal, "target_cents" | "current_cents" | "target_date">, today: string): GoalProgress {
  const target = Math.max(0, goal.target_cents);
  const current = Math.max(0, goal.current_cents);
  const percent = target > 0 ? Math.min(100, current / target * 100) : 0;
  const remainingCents = Math.max(0, target - current);
  const reached = target > 0 && remainingCents === 0;
  const hasDate = Boolean(goal.target_date && /^\d{4}-\d{2}-\d{2}/.test(goal.target_date));
  const overdue = hasDate && !reached && daysBetween(today, goal.target_date!) < 0;
  if (!hasDate || reached || overdue) return { percent, remainingCents, reached, overdue, monthsLeft: null, monthlyNeededCents: null };
  const monthsLeft = Math.max(1, monthsBetween(today, goal.target_date!));
  return { percent, remainingCents, reached, overdue, monthsLeft, monthlyNeededCents: Math.ceil(remainingCents / monthsLeft) };
}
