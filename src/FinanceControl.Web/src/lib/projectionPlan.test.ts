import { describe, expect, it } from "vitest";
import type { ProjectionBase } from "../api/insights";
import { scenarioFromBase } from "./projection";
import { durationText, freedomTargetCents, linkedGoalIds, longReach, monthYear, planPreset } from "./projectionPlan";

const base: ProjectionBase = {
  as_of: "2026-09-18", currency: "BRL",
  starting: { bank_cents: 0, investments_cents: 0, total_cents: 0 },
  income: { planned_monthly_cents: 1_000_000, avg_3m_cents: 0, avg_6m_cents: 0 },
  expenses: { planned_limit_cents: 900_000, bills_monthly_cents: 0, subscriptions_monthly_cents: 0, avg_3m_cents: 600_000, avg_6m_cents: 0 },
  investment_contribution_avg_3m_cents: 0,
  indicators: { selic_pct: null, cdi_pct: 0, ipca_12m_pct: 0 },
  goals: [],
  emergency: { months_target: 6, monthly_limit_cents: 900_000, reserve_target_cents: 6_000_000 },
  plan: { fixed_pct: 70, fun_pct: 20, invest_pct: 10, freedom_multiplier: 150 },
};

describe("MEL-45 · projeção do plano", () => {
  it("aporta 10% + a sobra abaixo do teto de fixos e lazer", () => {
    expect(planPreset(base)).toEqual({ incomeCents: 1_000_000, expenseCents: 600_000, contributionCents: 100_000 + 300_000 });
    expect(planPreset({ ...base, expenses: { ...base.expenses, avg_3m_cents: 0 } })).toEqual({ incomeCents: 1_000_000, expenseCents: 900_000, contributionCents: 100_000 });
    expect(planPreset({ ...base, expenses: { ...base.expenses, avg_3m_cents: 950_000 } })?.contributionCents).toBe(100_000);
    expect(planPreset({ ...base, income: { ...base.income, planned_monthly_cents: 0 } })).toBeNull();
  });

  it("usa o número da liberdade do servidor ou salário × multiplicador", () => {
    expect(freedomTargetCents(base)).toBe(150_000_000);
    expect(freedomTargetCents({ ...base, freedom_target_cents: 42 })).toBe(42);
  });

  it("procura o marco além do horizonte do gráfico", () => {
    const scenario = { ...scenarioFromBase(base), monthlyIncomeCents: 1_000_000, monthlyExpenseCents: 0, monthlyContributionCents: 0 };
    const reach = longReach(scenario, 0, 150_000_000);
    expect(reach).toEqual({ status: "reached", index: 150, month: "2039-03" });
    expect(monthYear(reach.month!)).toBe("03/2039");
    expect(durationText(150)).toBe("12 anos e 6 meses");
    expect(durationText(12)).toBe("1 ano");
    expect(longReach({ ...scenario, monthlyIncomeCents: 1 }, 0, 150_000_000).status).toBe("beyond");
  });

  it("separa as metas vinculadas (reserva e liberdade)", () => {
    expect([...linkedGoalIds({ emergency_goal_id: 3, freedom_goal_id: null })]).toEqual([3]);
  });
});
