import { describe, expect, it } from "vitest";
import { goalProgress } from "./goalProgress";

const today = "2026-09-17";

describe("goalProgress", () => {
  it("computes remaining amount and the monthly contribution needed until the target date", () => {
    const progress = goalProgress({ target_cents: 1_000_000, current_cents: 400_000, target_date: "2026-12-31" }, today);
    expect(progress).toMatchObject({ percent: 40, remainingCents: 600_000, reached: false, overdue: false, monthsLeft: 3, monthlyNeededCents: 200_000 });
  });

  it("rounds the monthly amount up so the goal is reached on time", () => {
    expect(goalProgress({ target_cents: 100_000, current_cents: 0, target_date: "2026-12-01" }, today).monthlyNeededCents).toBe(33_334);
  });

  it("asks for everything this month when the target date is in the current month", () => {
    expect(goalProgress({ target_cents: 50_000, current_cents: 10_000, target_date: "2026-09-30" }, today)).toMatchObject({ monthsLeft: 1, monthlyNeededCents: 40_000 });
  });

  it("flags overdue goals and skips the monthly amount", () => {
    expect(goalProgress({ target_cents: 50_000, current_cents: 10_000, target_date: "2026-09-01" }, today)).toMatchObject({ overdue: true, monthsLeft: null, monthlyNeededCents: null });
  });

  it("marks reached goals and caps the bar at 100%", () => {
    expect(goalProgress({ target_cents: 50_000, current_cents: 60_000, target_date: "2026-01-01" }, today)).toMatchObject({ percent: 100, remainingCents: 0, reached: true, overdue: false });
  });

  it("works without a target date or target", () => {
    expect(goalProgress({ target_cents: 50_000, current_cents: 0, target_date: null }, today)).toMatchObject({ monthsLeft: null, monthlyNeededCents: null, overdue: false });
    expect(goalProgress({ target_cents: 0, current_cents: 0, target_date: null }, today)).toMatchObject({ percent: 0, reached: false });
  });
});
