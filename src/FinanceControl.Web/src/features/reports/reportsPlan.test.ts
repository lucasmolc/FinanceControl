import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN } from "../plan/planModel";
import { bucketOnPlan, planDistribution } from "./reportsPlan";

const month = (fixed: number, fun: number, invested: number) => ({ month: "2026-09", income_cents: 0, expense_cents: 0, investment_cents: 0, net_cents: 0, fixed_spent_cents: fixed, fun_spent_cents: fun, invested_cents: invested, unbucketed_expense_cents: 1_000, out_of_plan_expense_cents: 500 });

describe("MEL-45 · distribuição por balde no período", () => {
  it("usa os valores mensais do servidor e compara com salário × meses", () => {
    const result = planDistribution([], 99_999, [], DEFAULT_PLAN, 1_000_000, 2, [month(800_000, 100_000, 50_000), month(600_000, 300_000, 150_000)]);
    expect(result.rows.map(row => [row.id, row.realizedCents, row.plannedCents, row.realizedPct])).toEqual([
      ["fixo", 1_400_000, 1_400_000, 70], ["lazer", 400_000, 400_000, 20], ["investimento", 200_000, 200_000, 10],
    ]);
    expect(result.rows.every(bucketOnPlan)).toBe(true);
    expect([result.unbucketedCents, result.outsideCents]).toEqual([2_000, 1_000]);
  });

  it("sem os campos mensais soma as categorias pelo balde atual", () => {
    const result = planDistribution([{ category_id: 1, name: "Casa", total_cents: 900_000, share_pct: 90 }, { category_id: null, name: "Sem categoria", total_cents: 100_000, share_pct: 10 }], 50_000,
      [{ id: 1, name: "Casa", kind: "expense", monthly_budget_cents: 0, active: true, bucket: "fixo" }], DEFAULT_PLAN, 1_000_000, 1);
    expect(result.rows[0]!.realizedCents).toBe(900_000);
    expect(bucketOnPlan(result.rows[0]!)).toBe(false);
    expect(result.rows[2]!.realizedCents).toBe(50_000);
    expect(result.unbucketedCents).toBe(100_000);
  });

  it("R2-REL-2: divide pelo salário × meses com renda registrada, não por todos os meses do período", () => {
    const withIncome = (income: number) => ({ ...month(200_000, 50_000, 30_000), income_cents: income });
    const result = planDistribution([], 0, [], DEFAULT_PLAN, 1_000_000, 6, [withIncome(1_000_000), withIncome(1_000_000), withIncome(1_000_000), withIncome(0), withIncome(0), withIncome(0)]);
    expect([result.months, result.periodMonths]).toEqual([3, 6]);
    expect(result.rows[0]!.plannedCents).toBe(2_100_000);
    expect(result.rows[2]!.realizedPct).toBe(6);
  });
});
