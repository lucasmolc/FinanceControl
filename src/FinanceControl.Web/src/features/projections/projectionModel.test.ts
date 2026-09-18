import { describe, expect, it } from "vitest";
import type { ProjectionBase } from "../../api/insights";
import { projectMonths } from "../../lib/projection";
import { formFromBase, parsePercent, scenarioFromForm } from "./projectionForm";
import { projectionChartData, reachText } from "./projectionModel";

const base: ProjectionBase = {
  as_of: "2026-09-17", currency: "BRL",
  starting: { bank_cents: 100_000, investments_cents: 0, total_cents: 100_000 },
  income: { planned_monthly_cents: 500_000, avg_3m_cents: 0, avg_6m_cents: 0 },
  expenses: { planned_limit_cents: 400_000, bills_monthly_cents: 0, subscriptions_monthly_cents: 0, avg_3m_cents: 0, avg_6m_cents: 0 },
  investment_contribution_avg_3m_cents: 0,
  indicators: { selic_pct: null, cdi_pct: 10.5, ipca_12m_pct: 4 },
  goals: [], emergency: { months_target: 6, monthly_limit_cents: 400_000, reserve_target_cents: 3_000_000 },
};

describe("projection page model", () => {
  it("lê percentuais com vírgula ou ponto", () => {
    expect(parsePercent("10,5")).toBe(10.5);
    expect(parsePercent(" 4.25 % ")).toBe(4.25);
    expect(parsePercent("abc")).toBeNull();
    expect(parsePercent("")).toBeNull();
  });

  it("preenche o formulário da base e valida os campos", () => {
    const form = formFromBase(base);
    expect(form).toMatchObject({ income: "5.000,00", expense: "4.000,00", contribution: "0,00", returnPct: 100, cdi: "10,5", ipca: "4", incomeBasis: "planned", expenseBasis: "planned" });
    const ok = scenarioFromForm(base, form, 6);
    expect(ok.errors).toEqual({});
    expect(ok.scenario).toMatchObject({ months: 6, monthlyIncomeCents: 500_000, cdiAnnualPct: 10.5 });
    const bad = scenarioFromForm(base, { ...form, income: "abc", cdi: "200", ipca: "x" }, 6);
    expect(Object.keys(bad.errors).sort()).toEqual(["cdi", "income", "ipca"]);
    expect(bad.scenario.monthlyIncomeCents).toBe(500_000);
  });

  it("alinha histórico, hoje e projeção no mesmo eixo", () => {
    const rows = projectMonths({ months: 2, startMonth: "2026-10", startingBankCents: 100_000, startingInvestmentsCents: 0, monthlyIncomeCents: 10, monthlyExpenseCents: 0, monthlyContributionCents: 0, cdiAnnualPct: 0, returnPctOfCdi: 100, inflationAnnualPct: 0 });
    const data = projectionChartData([
      { month: "2026-09", total_cents: 99, bank_cents: 0, investments_cents: 0 },
      { month: "2026-08", total_cents: 80, bank_cents: 0, investments_cents: 0 },
    ], "2026-09", 100_000, rows, { lower: [1, 2], upper: [3, 4] });
    expect(data.labels).toEqual(["ago/26", "Hoje", "out/26", "nov/26"]);
    expect(data.projectFrom).toBe(1);
    expect(data.nominal).toEqual([80, 100_000, 100_010, 100_020]);
    expect(data.real).toEqual([null, 100_000, 100_010, 100_020]);
    expect(data.lower).toEqual([null, 100_000, 1, 2]);
    expect(data.tooltipLabels[3]).toBe("novembro de 2026 (projeção)");
  });

  it("descreve quando a reserva é atingida", () => {
    expect(reachText({ status: "already", index: 0, month: null }, 12)).toBe("Já atingida");
    expect(reachText({ status: "beyond", index: null, month: null }, 12)).toBe("Não atingida em 12 meses");
    expect(reachText({ status: "reached", index: 1, month: "2026-10" }, 12)).toBe("Em outubro de 2026 (1 mês)");
  });
});

describe("R2-PRJ-3 · eixo y ajustado aos dados", () => {
  it("sem incluir o zero, o domínio acompanha os valores", async () => {
    const { niceTicks } = await import("../../components/charts/chartMath");
    const fitted = niceTicks(7_126_790 - 170_000, 8_864_216, 4, 100, false);
    expect(fitted.min).toBeGreaterThan(0);
    expect(fitted.min).toBeLessThanOrEqual(7_126_790);
    expect(fitted.max).toBeGreaterThanOrEqual(8_864_216);
    expect(niceTicks(7_126_790, 8_864_216, 4, 100).min).toBe(0);
  });
});
