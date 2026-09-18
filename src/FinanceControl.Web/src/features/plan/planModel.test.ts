import { describe, expect, it } from "vitest";
import type { Settings } from "../../types";
import { bucketDescriptions, bucketFormValue, bucketLabel, bucketPayload } from "./bucketModel";
import { ceilingState, DEFAULT_PLAN, draftFromPlan, fixedSurplusCents, floorState, freedomProgress, limitChangeText, mapPlanApiFields, planApplyPreview, planBars, planCommand, planFigures, planFromSettings, planInvitation, readPlanDraft, withdrawalRates, withPlanWidget } from "./planModel";

describe("MEL-45 · plano 70-20-10", () => {
  it.each([
    [1_300_000, { fixedCents: 910_000, funCents: 260_000, investCents: 130_000, limitCents: 1_170_000, reserveCents: 7_800_000, freedomCents: 195_000_000 }],
    [1_100_000, { fixedCents: 770_000, funCents: 220_000, investCents: 110_000, limitCents: 990_000, reserveCents: 6_600_000, freedomCents: 165_000_000 }],
  ])("calcula os cinco valores com salário de %i centavos", (salary, expected) => {
    expect(planFigures(salary, DEFAULT_PLAN)).toEqual(expected);
  });

  it("valida inteiros e a soma de 100%", () => {
    expect(readPlanDraft(draftFromPlan(DEFAULT_PLAN))).toEqual({ values: DEFAULT_PLAN, errors: {} });
    expect(readPlanDraft({ ...draftFromPlan(DEFAULT_PLAN), fixed: "65" }).errors.sum).toBe("Os percentuais devem somar 100%. Agora somam 95%.");
    const invalid = readPlanDraft({ fixed: "abc", fun: "20", invest: "101", months: "0", multiplier: "601" });
    expect(invalid.values).toBeNull();
    expect(Object.keys(invalid.errors).sort()).toEqual(["fixed", "invest", "months", "multiplier"]);
  });

  it("lê o plano das configurações e monta o comando", () => {
    const settings = { emergency_months_target: 4, freedom_multiplier: 200, plan_fixed_pct: 60, plan_fun_pct: 30, plan_invest_pct: 10 } as Settings;
    expect(planFromSettings(settings)).toEqual({ fixedPct: 60, funPct: 30, investPct: 10, emergencyMonths: 4, freedomMultiplier: 200 });
    expect(planFromSettings({ ...settings, plan_fixed_pct: null })).toBeNull();
    expect(planCommand(DEFAULT_PLAN, true)).toEqual({ fixed_pct: 70, fun_pct: 20, invest_pct: 10, emergency_months: 6, freedom_multiplier: 150, create_buckets: true });
    expect(mapPlanApiFields({ fixed_pct: "Os percentuais devem somar 100%.", freedom_multiplier: "x" })).toEqual({ sum: "Os percentuais devem somar 100%.", multiplier: "x" });
  });

  it("explica a premissa de 150 salários (8% e 5,6% ao ano)", () => {
    const rates = withdrawalRates(DEFAULT_PLAN);
    expect(rates.salaryPct).toBeCloseTo(8);
    expect(rates.fixedPct).toBeCloseTo(5.6);
  });

  it("classifica as barras do painel", () => {
    expect(ceilingState(500, 1000)).toBe("ok");
    expect(ceilingState(950, 1000)).toBe("near");
    expect(ceilingState(1001, 1000)).toBe("over");
    expect(floorState(100, 100)).toBe("reached");
    expect(floorState(99, 100)).toBe("pending");
    const plan = { fixed_limit_cents: 910_000, fun_limit_cents: 260_000, invest_min_cents: 130_000, fixed_spent_cents: 770_000, fun_spent_cents: 300_000, invested_cents: 130_000, unbucketed_expense_cents: 0 };
    expect(planBars(plan).map(bar => [bar.id, bar.state, bar.pct])).toEqual([["fixo", "ok", 85], ["lazer", "over", 115], ["investimento", "reached", 100]]);
    expect(fixedSurplusCents(plan)).toBe(140_000);
  });

  it("R1 · decisão 2: mostra o teto antes → depois e o que acontece com as metas vinculadas", () => {
    const figures = planFigures(1_100_000, DEFAULT_PLAN);
    const settings = { monthly_spending_limit_cents: 700_000, emergency_goal_status: "linked" as const, emergency_goal_id: 3, emergency_goal_auto: true, freedom_goal_status: "removed" as const, freedom_goal_id: 8, freedom_goal_auto: true };
    expect(planApplyPreview(settings, figures)).toEqual({ limitBeforeCents: 700_000, limitAfterCents: 990_000, reserve: { targetCents: 6_600_000, effect: "update" }, freedom: { targetCents: 165_000_000, effect: "removed" } });
    expect(planApplyPreview({ ...settings, emergency_goal_auto: false, freedom_goal_status: "none", freedom_goal_id: null }, figures).reserve.effect).toBe("manual");
    expect(planApplyPreview({ ...settings, freedom_goal_status: "none", freedom_goal_id: null }, figures).freedom.effect).toBe("create");
    expect(planApplyPreview(null, figures).reserve.effect).toBe("create");
    const fmt = (cents: number) => `R$ ${cents / 100}`;
    expect(limitChangeText(700_000, 990_000, fmt)).toBe("Teto de gastos: R$ 7000 → R$ 9900");
    expect(limitChangeText(0, 990_000, fmt)).toBe("Teto de gastos: sem teto → R$ 9900");
    expect(limitChangeText(990_000, 990_000, fmt)).toBe("Teto de gastos: R$ 9900 (sem mudança)");
  });

  it("R1 · decisão 3: o progresso do número da liberdade é o patrimônio investido", () => {
    expect(freedomProgress({ freedom_progress_cents: 7_100_000, freedom_target_cents: 165_000_000 })).toEqual({ currentCents: 7_100_000, targetCents: 165_000_000, pct: 4.3 });
    expect(freedomProgress({ freedom_target_cents: 100_000 }, { current_cents: 50_000, target_cents: 100_000 })?.pct).toBe(50);
    expect(freedomProgress({})).toBeNull();
  });

  it("R1-PAINEL-4: só convida a investir quando é verdade", () => {
    const plan = { fixed_limit_cents: 910_000, fun_limit_cents: 260_000, invest_min_cents: 130_000, fixed_spent_cents: 770_000, fun_spent_cents: 0, invested_cents: 0, unbucketed_expense_cents: 0 };
    expect(planInvitation(plan, { timing: "past" })).toBe("past");
    expect(planInvitation(plan, { timing: "current", forecastStatus: "ok" })).toBe("current");
    expect(planInvitation(plan, { timing: "current", forecastStatus: "danger" })).toBeNull();
    expect(planInvitation(plan, { timing: "current", forecastStatus: "none" })).toBeNull();
    expect(planInvitation(plan, { timing: "future", forecastStatus: "ok" })).toBeNull();
    expect(planInvitation({ ...plan, fixed_spent_cents: 950_000 }, { timing: "past" })).toBeNull();
  });

  it("R4-SET-3: mês sem nenhuma despesa não convida a investir", () => {
    const empty = { fixed_limit_cents: 910_000, fun_limit_cents: 260_000, invest_min_cents: 130_000, fixed_spent_cents: 0, fun_spent_cents: 0, invested_cents: 0, unbucketed_expense_cents: 0 };
    expect(planInvitation(empty, { timing: "current", forecastStatus: "ok" })).toBeNull();
    expect(planInvitation(empty, { timing: "past" })).toBeNull();
    expect(planInvitation({ ...empty, unbucketed_expense_cents: 5_000 }, { timing: "past" })).toBe("past");
  });

  it("mostra o widget do plano logo após o primeiro", () => {
    expect(withPlanWidget(["saldo", "contas"])).toEqual(["saldo", "plano", "contas"]);
    expect(withPlanWidget(["contas", "plano"])).toEqual(["contas", "plano"]);
    expect(withPlanWidget([])).toEqual(["plano"]);
  });

  it("converte o balde da categoria entre formulário e API", () => {
    expect(bucketPayload({ bucket: "lazer" })).toBe("lazer");
    expect(bucketPayload({ bucket: "" })).toBeNull();
    expect(bucketPayload({ bucket: "qualquer" })).toBeNull();
    expect(bucketFormValue({ bucket: "fora" })).toBe("fora");
    expect(bucketFormValue({ bucket: null })).toBe("");
    expect(bucketLabel("fora")).toBe("Fora do plano");
    expect(bucketLabel(undefined)).toBe("Sem balde");
    // Decision 1: bucket hints speak of limits, never "teto".
    expect(Object.values(bucketDescriptions).join(" ")).not.toMatch(/teto/);
  });
});
