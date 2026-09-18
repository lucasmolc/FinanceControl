import { describe, expect, it } from "vitest";
import { brl } from "../../lib/money";
import { emptyState } from "../../test/fixtures";
import type { ChecklistItem } from "../../types";
import { daysBetween } from "../../lib/date";
import { availableKpi, billStatus, budgetLevel, changeRatio, forecastText, incomeKpi, monthForecast, monthTotals, paceLine, previousSnapshot, shortDate, wealthFigures } from "./dashboardModel";

const bill = (overrides: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id: 1, name: "Luz", amount_cents: 12000, due_day: 10, category_id: null, recurring: true, active: true, paid: false, paid_at: null, transaction_id: null, ...overrides,
});

describe("status das contas do mês", () => {
  it("mostra a data de pagamento", () => {
    expect(billStatus(bill({ paid: true, paid_at: "2026-09-08T14:30:00" }), "2026-09", "2026-09-15")).toEqual({ label: "Paga em 08/09", tone: "positive" });
    expect(billStatus(bill({ paid: true, paid_at: null }), "2026-09", "2026-09-15").label).toBe("Paga");
  });

  it("diferencia vencida, hoje e próximos dias", () => {
    expect(billStatus(bill({ due_day: 10 }), "2026-09", "2026-09-15")).toEqual({ label: "Vencida há 5 dias", tone: "negative" });
    expect(billStatus(bill({ due_day: 14 }), "2026-09", "2026-09-15").label).toBe("Vencida há 1 dia");
    expect(billStatus(bill({ due_day: 15 }), "2026-09", "2026-09-15")).toEqual({ label: "Vence hoje", tone: "warning" });
    expect(billStatus(bill({ due_day: 16 }), "2026-09", "2026-09-15").label).toBe("Vence amanhã");
    expect(billStatus(bill({ due_day: 18 }), "2026-09", "2026-09-15")).toEqual({ label: "Vence em 18/09 (3 dias)", tone: "warning" });
    expect(billStatus(bill({ due_day: 20 }), "2026-09", "2026-09-15")).toEqual({ label: "Vence em 20/09 (5 dias)", tone: "neutral" });
    expect(billStatus(bill({ due_day: 28 }), "2026-09", "2026-09-15").label).toBe("Vence em 28/09 (13 dias)");
  });

  it("limita o vencimento ao último dia do mês", () => {
    expect(billStatus(bill({ due_day: 31 }), "2026-02", "2026-02-28").label).toBe("Vence hoje");
    expect(billStatus(bill({ due_day: 31 }), "2026-08", "2026-09-15").label).toBe("Vencida há 15 dias");
  });

  it("calcula dias sem depender do fuso", () => {
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(shortDate("2026-09-08 10:00:00")).toBe("08/09");
  });
});

describe("indicadores do painel", () => {
  it("não limita o disponível a zero quando o teto é excedido", () => {
    expect(availableKpi(300000, 350000)).toMatchObject({ value: `Excedido em ${brl(50000)}`, tone: "negative" });
    expect(availableKpi(300000, 250000)).toMatchObject({ value: brl(50000), tone: "warning" });
    expect(availableKpi(300000, 100000)).toMatchObject({ value: brl(200000), tone: "positive" });
    expect(availableKpi(0, 100000).value).toBe("Sem teto");
  });

  it("identifica renda planejada quando não há receita registrada", () => {
    expect(incomeKpi(0, 500000)).toMatchObject({ value: brl(500000), hint: expect.stringContaining("Planejada") });
    expect(incomeKpi(10000, 500000)).toMatchObject({ value: brl(10000), hint: expect.stringContaining("Registrada") });
  });

  it("classifica o consumo do orçamento", () => {
    expect(budgetLevel(100, 0)).toBe("none");
    expect(budgetLevel(79, 100)).toBe("ok");
    expect(budgetLevel(80, 100)).toBe("near");
    expect(budgetLevel(100, 100)).toBe("near");
    expect(budgetLevel(101, 100)).toBe("over");
  });

  it("calcula os totais do mês sem o resumo do servidor", () => {
    const state = {
      ...emptyState,
      categories: [{ id: 1, name: "Mercado", kind: "expense" as const, monthly_budget_cents: 50000, active: true }],
      transactions: [
        { id: 1, date: "2026-09-02", description: "Feira", category_id: 1, category_name: "Mercado", kind: "expense" as const, amount_cents: 20000, payment_method: "pix", account_id: null, account_name: null },
        { id: 2, date: "2026-09-03", description: "Farmácia", category_id: null, category_name: null, kind: "expense" as const, amount_cents: 5000, payment_method: "pix", account_id: null, account_name: null },
        { id: 3, date: "2026-08-30", description: "Salário", category_id: null, category_name: null, kind: "income" as const, amount_cents: 900000, payment_method: "transfer", account_id: null, account_name: null },
      ],
    };
    const totals = monthTotals(state, "2026-09", null);
    expect(totals).toMatchObject({ income: 0, expenses: 25000, uncategorized: 5000, estimated: true });
    expect(totals.categories[0]).toMatchObject({ name: "Mercado", spent: 20000, budget: 50000 });
  });
});

describe("MEL-38 · ritmo do mês e patrimônio", () => {
  const daily = [{ date: "2026-09-01", total_cents: 10_000 }, { date: "2026-09-05", total_cents: 20_000 }, { date: "2026-09-10", total_cents: 30_000 }, { date: "2026-08-31", total_cents: 99_999 }];

  it("acumula o gasto diário e projeta o fim do mês pelo ritmo atual", () => {
    const result = monthForecast(daily, "2026-09", 150_000, "2026-09-10");
    expect(result.days).toBe(30);
    expect(result.elapsed).toBe(10);
    expect(result.cumulative.slice(0, 5)).toEqual([10_000, 10_000, 10_000, 10_000, 30_000]);
    expect(result.cumulative[9]).toBe(60_000);
    expect(result.cumulative[10]).toBeNull();
    expect(result.forecast).toBe(180_000); // 60.000 / 10 × 30
    expect(result.status).toBe("danger");
    expect(forecastText(result, 150_000)).toBe(`No ritmo atual, o mês fecha em ${brl(180_000)} (120% do teto de ${brl(150_000)}).`);
  });

  it("mês passado usa o total final; mês futuro não projeta", () => {
    const past = monthForecast(daily, "2026-09", 0, "2026-10-02");
    expect(past.timing).toBe("past");
    expect(past.forecast).toBe(60_000);
    expect(past.status).toBe("none");
    expect(forecastText(past, 0)).toBe(`O mês fechou com ${brl(60_000)} em gastos.`);
    const future = monthForecast([], "2026-11", 100_000, "2026-09-10");
    expect(future.forecast).toBeNull();
    expect(forecastText(future, 100_000)).toBe("O mês ainda não começou.");
    expect(monthForecast([{ date: "2026-09-02", total_cents: 95_000 }], "2026-09", 200_000, "2026-09-15").status).toBe("warning");
  });

  it("linha de ritmo ideal, variação e patrimônio convertido", () => {
    expect(paceLine(30_000, 3)).toEqual([10_000, 20_000, 30_000]);
    expect(changeRatio(110, 100)).toBeCloseTo(0.1);
    expect(changeRatio(10, 0)).toBeNull();
    expect(previousSnapshot([{ month: "2026-08", total_cents: 5 }, { month: "2026-09", total_cents: 7 }], "2026-09")?.total_cents).toBe(5);
    const wealth = wealthFigures({
      bank_accounts: [
        { id: 1, name: "C", institution: "B", account_type: "checking", current_balance_cents: 100_000, color_label: null, active: true },
        { id: 2, name: "Wise", institution: "Wise", account_type: "checking", current_balance_cents: 10_000, color_label: null, active: true, currency: "USD" },
        { id: 3, name: "Libra", institution: "Wise", account_type: "checking", current_balance_cents: 500, color_label: null, active: true, currency: "GBP" },
      ],
      investments: [{ id: 1, name: "BTC", institution: null, type: "crypto", invested_cents: 0, current_cents: 1_000_000, liquidity: null, benchmark: null, active: true, currency: "BTC" }],
    }, { USD: "5", BTC: "300000" });
    expect(wealth.bank).toBe(150_000);
    expect(wealth.investments).toBe(300_000); // 0,01 BTC × R$ 300.000
    expect(wealth.missing).toEqual(["GBP"]);
    expect(wealth.foreign.map(item => item.currency)).toEqual(["BTC", "USD", "GBP"]);
  });
});

describe("R4-PAINEL-4 · percentual logo acima do teto", () => {
  it("usa uma casa decimal entre 100% e 110% (nunca \"100%\" ao lado de \"Acima do teto\")", async () => {
    const { limitPercent } = await import("./dashboardModel");
    expect(limitPercent(100_700, 100_000)).toBe("100,7%");
    expect(limitPercent(100_001, 100_000)).toBe("100,1%");
    expect(limitPercent(112_000, 100_000)).toBe("112%");
    expect(limitPercent(100_000, 100_000)).toBe("100%");
    expect(limitPercent(85_000, 100_000)).toBe("85%");
  });
});
