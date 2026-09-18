import { describe, expect, it } from "vitest";
import type { ProjectionBase, ProjectionGoal } from "../api/insights";
import { annualReturnPct, DEFAULT_CDI_PCT, DEFAULT_IPCA_PCT, defaultBases, expenseFor, goalMilestones, incomeFor, monthlyRate, projectionBand, projectionTotals, projectMonths, reachTarget, scenarioFromBase, type ProjectionScenario } from "./projection";

const scenario = (overrides: Partial<ProjectionScenario> = {}): ProjectionScenario => ({
  months: 12, startMonth: "2026-10", startingBankCents: 100_000, startingInvestmentsCents: 0,
  monthlyIncomeCents: 500_000, monthlyExpenseCents: 400_000, monthlyContributionCents: 0,
  cdiAnnualPct: 0, returnPctOfCdi: 100, inflationAnnualPct: 0, ...overrides,
});

const base = (overrides: Partial<ProjectionBase> = {}): ProjectionBase => ({
  as_of: "2026-09-17", currency: "BRL",
  starting: { bank_cents: 1_000_000, investments_cents: 2_000_000, total_cents: 3_000_000 },
  income: { planned_monthly_cents: 800_000, avg_3m_cents: 750_000, avg_6m_cents: 700_000 },
  expenses: { planned_limit_cents: 500_000, bills_monthly_cents: 200_000, subscriptions_monthly_cents: 10_000, avg_3m_cents: 550_000, avg_6m_cents: 520_000 },
  investment_contribution_avg_3m_cents: 100_000,
  indicators: { selic_pct: 15, cdi_pct: 14.9, ipca_12m_pct: 5.1 },
  goals: [],
  emergency: { months_target: 6, monthly_limit_cents: 500_000, reserve_target_cents: 4_800_000 },
  ...overrides,
});

const goal = (id: number, remaining: number, target_date: string | null = null): ProjectionGoal => ({
  id, name: `Meta ${id}`, target_cents: remaining + 1000, current_cents: 1000, currency: "BRL", base_target_cents: remaining + 1000, base_current_cents: 1000, target_date,
});

describe("projection math", () => {
  it("converte taxas anuais em mensais equivalentes", () => {
    expect(monthlyRate(0)).toBe(0);
    expect((1 + monthlyRate(12)) ** 12).toBeCloseTo(1.12, 10);
    expect(monthlyRate(-200)).toBe(-1);
    expect(annualReturnPct(10, 110)).toBeCloseTo(11);
    expect(annualReturnPct(10, -5)).toBe(0);
  });

  it("acumula a sobra mensal sem rendimento quando a taxa é zero", () => {
    const rows = projectMonths(scenario());
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ index: 1, month: "2026-10", bankCents: 200_000, investmentsCents: 0, totalCents: 200_000, realTotalCents: 200_000, yieldCents: 0 });
    expect(rows[11]).toMatchObject({ month: "2027-09", totalCents: 1_300_000 });
  });

  it("aplica rendimento composto sobre investimentos e move o aporte do banco para a carteira", () => {
    const rows = projectMonths(scenario({ startingInvestmentsCents: 1_000_000, cdiAnnualPct: 12, returnPctOfCdi: 100, monthlyContributionCents: 50_000, months: 2 }));
    const rate = monthlyRate(12);
    const first = Math.round(1_000_000 * rate);
    expect(rows[0]?.yieldCents).toBe(first);
    expect(rows[0]?.investmentsCents).toBe(1_000_000 + first + 50_000);
    expect(rows[0]?.bankCents).toBe(100_000 + 100_000 - 50_000);
    const second = Math.round((1_000_000 + first + 50_000) * rate);
    expect(rows[1]?.investmentsCents).toBe(1_000_000 + first + 50_000 + second + 50_000);
    expect(rows.every(row => Number.isInteger(row.totalCents))).toBe(true);
  });

  it("deflaciona o patrimônio pelo IPCA (valor real)", () => {
    const rows = projectMonths(scenario({ inflationAnnualPct: 12, monthlyIncomeCents: 0, monthlyExpenseCents: 0, months: 12 }));
    expect(rows[11]?.totalCents).toBe(100_000);
    expect(rows[11]?.realTotalCents).toBe(Math.round(100_000 / 1.12));
  });

  it("permite saldo negativo quando os gastos superam a renda e não rende sobre carteira negativa", () => {
    const rows = projectMonths(scenario({ startingBankCents: 0, monthlyIncomeCents: 100_000, monthlyExpenseCents: 300_000, cdiAnnualPct: 10, months: 3 }));
    expect(rows.map(row => row.totalCents)).toEqual([-200_000, -400_000, -600_000]);
    expect(rows.every(row => row.yieldCents === 0)).toBe(true);
  });

  it("ignora horizontes inválidos e entradas não finitas", () => {
    expect(projectMonths(scenario({ months: -3 }))).toEqual([]);
    expect(projectMonths(scenario({ months: 2, monthlyIncomeCents: Number.NaN }))[0]?.totalCents).toBe(100_000 - 400_000);
  });

  it("encontra o mês em que a reserva é atingida", () => {
    const rows = projectMonths(scenario());
    expect(reachTarget(rows, 100_000, 50_000)).toEqual({ status: "already", index: 0, month: null });
    expect(reachTarget(rows, 100_000, 650_000)).toEqual({ status: "reached", index: 6, month: "2027-03" });
    expect(reachTarget(rows, 100_000, 5_000_000)).toEqual({ status: "beyond", index: null, month: null });
    expect(reachTarget(rows, 100_000, 0).status).toBe("already");
  });

  it("financia as metas em ordem de prazo usando o crescimento do patrimônio", () => {
    const rows = projectMonths(scenario()); // +100_000 per month
    const milestones = goalMilestones([goal(1, 300_000), goal(2, 200_000, "2026-11-30"), goal(3, 0), goal(4, 200_000, "2027-12-31")], rows, 100_000);
    expect(milestones.map(item => item.id)).toEqual([2, 4, 1, 3]);
    expect(milestones[0]).toMatchObject({ id: 2, status: "on_time", index: 2, month: "2026-11" });
    expect(milestones[1]).toMatchObject({ id: 4, status: "on_time", index: 4, month: "2027-01" });
    expect(milestones[2]).toMatchObject({ id: 1, status: "on_time", index: 7, month: "2027-04" });
    expect(milestones[3]).toMatchObject({ id: 3, status: "done", remainingCents: 0 });
  });

  it("marca metas atrasadas e fora do horizonte", () => {
    const rows = projectMonths(scenario({ months: 6 }));
    const [late, beyond] = goalMilestones([goal(1, 300_000, "2026-10-15"), goal(2, 900_000)], rows, 100_000);
    expect(late).toMatchObject({ status: "late", month: "2026-12" });
    expect(beyond).toMatchObject({ status: "beyond", index: null });
  });

  it("gera a faixa de rentabilidade com limite inferior e superior", () => {
    const s = scenario({ startingInvestmentsCents: 1_000_000, cdiAnnualPct: 12, returnPctOfCdi: 10, months: 6 });
    const band = projectionBand(s, 20);
    const central = projectMonths(s).map(row => row.totalCents);
    expect(band.lower).toHaveLength(6);
    band.lower.forEach((value, index) => expect(value).toBeLessThanOrEqual(central[index] ?? 0));
    band.upper.forEach((value, index) => expect(value).toBeGreaterThanOrEqual(central[index] ?? 0));
    expect(band.lower).toEqual(projectMonths({ ...s, returnPctOfCdi: 0 }).map(row => row.totalCents));
  });

  it("resume totais do período", () => {
    const rows = projectMonths(scenario({ months: 3 }));
    expect(projectionTotals(rows, 100_000)).toEqual({ finalTotalCents: 400_000, finalRealCents: 400_000, yieldCents: 0, savedCents: 300_000, growthCents: 300_000 });
    expect(projectionTotals([], 100_000).finalTotalCents).toBe(100_000);
  });

  it("monta o cenário a partir da base do servidor", () => {
    const s = scenarioFromBase(base(), 24);
    expect(s).toMatchObject({ months: 24, startMonth: "2026-10", startingBankCents: 1_000_000, startingInvestmentsCents: 2_000_000, monthlyIncomeCents: 800_000, monthlyExpenseCents: 500_000, monthlyContributionCents: 100_000, cdiAnnualPct: 14.9, returnPctOfCdi: 100, inflationAnnualPct: 5.1 });
    const noPlan = base({ income: { planned_monthly_cents: 0, avg_3m_cents: 750_000, avg_6m_cents: 1 }, expenses: { planned_limit_cents: 0, bills_monthly_cents: 1, subscriptions_monthly_cents: 2, avg_3m_cents: 0, avg_6m_cents: 0 }, indicators: { selic_pct: null, cdi_pct: null, ipca_12m_pct: null } });
    expect(defaultBases(noPlan)).toEqual({ income: "avg3", expense: "commitments" });
    const fallback = scenarioFromBase(noPlan);
    expect(fallback.cdiAnnualPct).toBe(DEFAULT_CDI_PCT);
    expect(fallback.inflationAnnualPct).toBe(DEFAULT_IPCA_PCT);
    expect(fallback.monthlyExpenseCents).toBe(3);
    expect(incomeFor(base(), "avg6")).toBe(700_000);
    expect(expenseFor(base(), "avg6")).toBe(520_000);
    expect(expenseFor(base(), "commitments")).toBe(210_000);
  });
});
