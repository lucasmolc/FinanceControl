import { describe, expect, it } from "vitest";
import type { MonthlySummary, Subscription, Transaction } from "../../types";
import { emptyState } from "../../test/fixtures";
import type { Category } from "../../types";
import { advanceToToday, annualCents, bestPurchaseDay, budgetStatus, cardSubscriptions, categorySpending, chargedLabel, limitUsage, nextBillingDate } from "./catalogMetrics";
import { linkCounts, linksMessage, reassignTargets } from "./reassign";

const subscription = (overrides: Partial<Subscription>): Subscription => ({
  id: 1, name: "Streaming", amount_cents: 6_000, billing_day: 10, category_id: null, category_name: null, card_id: null, card_name: null,
  frequency: "monthly", next_billing_date: null, active: true, ...overrides,
});

describe("cards", () => {
  it("suggests the day after closing, wrapping at 31", () => {
    expect(bestPurchaseDay(5)).toBe(6);
    expect(bestPurchaseDay(30)).toBe(31);
    expect(bestPurchaseDay(31)).toBe(1);
  });

  it("sums the monthly equivalent of the card subscriptions and rates the usage", () => {
    const items = [subscription({ id: 1, card_id: 3, amount_cents: 12_000, frequency: "yearly" }), subscription({ id: 2, card_id: 3, amount_cents: 3_000, frequency: "weekly" }), subscription({ id: 3, card_id: 4 })];
    expect(cardSubscriptions(items, 3).monthlyCents).toBe(1_000 + 13_000);
    // MEL-46: other currencies are converted to BRL; without a rate they stay out of the total.
    const mixed = [...items, subscription({ id: 5, card_id: 3, amount_cents: 1_000, currency: "USD" }), subscription({ id: 6, card_id: 3, amount_cents: 500, currency: "EUR" })];
    expect(cardSubscriptions(mixed, 3, { USD: "5.2" })).toMatchObject({ monthlyCents: 14_000 + 5_200, missing: ["EUR"] });
    expect(limitUsage(7_000, 10_000)).toMatchObject({ tone: undefined, label: "Dentro do limite" });
    expect(limitUsage(8_000, 10_000)).toMatchObject({ tone: "warning", label: "Perto do limite" });
    expect(limitUsage(10_001, 10_000)).toMatchObject({ tone: "negative", label: "Acima do limite" });
    expect(limitUsage(1_000, 0)).toBeNull();
  });
});

describe("categories", () => {
  it("rates budget use: inside < 80%, near ≥ 80%, exceeded > 100%", () => {
    expect(budgetStatus(79_00, 100_00)).toMatchObject({ label: "Dentro do limite", tone: "positive", remainingCents: 21_00 });
    expect(budgetStatus(80_00, 100_00)).toMatchObject({ label: "Perto do limite", tone: "warning" });
    expect(budgetStatus(100_00, 100_00)).toMatchObject({ label: "Perto do limite", tone: "warning", remainingCents: 0 });
    expect(budgetStatus(130_00, 100_00)).toMatchObject({ label: "Excedido", tone: "negative", percent: 130, remainingCents: -30_00 });
    expect(budgetStatus(10_00, 0)).toBeNull();
  });

  it("uses the summary spend and falls back to the loaded transactions of the month", () => {
    const summary = { month: "2026-09", categories: [{ category_id: 1, name: "Mercado", monthly_budget_cents: 0, spent_cents: 500, active: true }] } as MonthlySummary;
    expect(categorySpending(summary, [], "2026-09").get(1)).toBe(500);
    const transactions = [
      { id: 1, date: "2026-09-02", kind: "expense", category_id: 1, amount_cents: 300 },
      { id: 2, date: "2026-09-03", kind: "expense", category_id: 1, amount_cents: 200 },
      { id: 3, date: "2026-08-30", kind: "expense", category_id: 1, amount_cents: 999 },
      { id: 4, date: "2026-09-04", kind: "income", category_id: 1, amount_cents: 999 },
    ] as Transaction[];
    expect(categorySpending(null, transactions, "2026-09").get(1)).toBe(500);
    expect(categorySpending(summary, transactions, "2026-10").get(1)).toBeUndefined();
  });
});

describe("subscriptions", () => {
  it("computes the annual cost by frequency", () => {
    expect(annualCents(5_000, "monthly")).toBe(60_000);
    expect(annualCents(120_000, "yearly")).toBe(120_000);
    expect(annualCents(1_000, "weekly")).toBe(52_000);
  });

  it("computes the next billing date", () => {
    const today = "2026-09-17";
    expect(nextBillingDate(subscription({ next_billing_date: "2027-01-05" }), today)).toBe("2027-01-05");
    expect(nextBillingDate(subscription({ billing_day: 20 }), today)).toBe("2026-09-20");
    expect(nextBillingDate(subscription({ billing_day: 17 }), today)).toBe("2026-09-17");
    expect(nextBillingDate(subscription({ billing_day: 10 }), today)).toBe("2026-10-10");
    expect(nextBillingDate(subscription({ billing_day: 31 }), "2027-01-31")).toBe("2027-01-31");
    expect(nextBillingDate(subscription({ billing_day: 31 }), "2027-02-01")).toBe("2027-02-28");
    expect(nextBillingDate(subscription({ frequency: "yearly" }), today)).toBeNull();
  });
});

describe("subscriptions (MEL-05/MEL-12)", () => {
  it("advances the anchor date to today or later: yearly +1 year, weekly +7 days", () => {
    const today = "2026-09-17";
    expect(nextBillingDate(subscription({ frequency: "yearly", next_billing_date: "2025-03-01" }), today)).toBe("2027-03-01");
    expect(nextBillingDate(subscription({ frequency: "yearly", next_billing_date: "2024-09-17" }), today)).toBe("2026-09-17");
    expect(nextBillingDate(subscription({ frequency: "weekly", next_billing_date: "2026-09-01" }), today)).toBe("2026-09-22");
    expect(nextBillingDate(subscription({ frequency: "weekly", next_billing_date: "2026-09-10" }), today)).toBe("2026-09-17");
    expect(nextBillingDate(subscription({ frequency: "monthly", next_billing_date: "2026-01-31" }), today)).toBe("2026-09-30");
    expect(advanceToToday("2024-02-29", "yearly", "2026-01-01")).toBe("2026-02-28");
    expect(nextBillingDate(subscription({ frequency: "weekly" }), today)).toBeNull();
  });

  it("labels a charge only in the current month", () => {
    expect(chargedLabel(subscription({ last_charge_date: "2026-09-05" }), "2026-09-17")).toBe("Cobrada em 05/09");
    expect(chargedLabel(subscription({ last_charge_date: "2026-08-30" }), "2026-09-17")).toBeNull();
    expect(chargedLabel(subscription({ last_charge_date: null }), "2026-09-17")).toBeNull();
  });
});

describe("realized per category (MEL-11)", () => {
  const cats: Category[] = [
    { id: 1, name: "Mercado", kind: "expense", monthly_budget_cents: 0, active: true },
    { id: 2, name: "Salário", kind: "income", monthly_budget_cents: 0, active: true },
    { id: 3, name: "Tesouro", kind: "investment", monthly_budget_cents: 0, active: true },
  ];

  it("merges expense, income and investment categories of the summary", () => {
    const summary = {
      month: "2026-09", categories: [{ category_id: 1, name: "Mercado", monthly_budget_cents: 0, spent_cents: 500, active: true }],
      income_categories: [{ category_id: 2, name: "Salário", monthly_budget_cents: 0, spent_cents: 800_000, active: true }],
      investment_categories: [{ category_id: 3, name: "Tesouro", monthly_budget_cents: 0, spent_cents: 100_000, active: true }],
    } as MonthlySummary;
    const map = categorySpending(summary, [], "2026-09", cats);
    expect([map.get(1), map.get(2), map.get(3)]).toEqual([500, 800_000, 100_000]);
  });

  it("falls back to transactions of the category kind", () => {
    const transactions = [
      { id: 1, date: "2026-09-05", kind: "income", category_id: 2, amount_cents: 700 },
      { id: 2, date: "2026-09-06", kind: "investment", category_id: 3, amount_cents: 300 },
      { id: 3, date: "2026-09-06", kind: "expense", category_id: 2, amount_cents: 999 },
    ] as Transaction[];
    const map = categorySpending(null, transactions, "2026-09", cats);
    expect([map.get(2), map.get(3)]).toEqual([700, 300]);
  });
});

describe("reassign helpers (MEL-09)", () => {
  const state = {
    ...emptyState,
    categories: [
      { id: 1, name: "Mercado", kind: "expense", monthly_budget_cents: 0, active: true },
      { id: 2, name: "Feira", kind: "expense", monthly_budget_cents: 0, active: true },
      { id: 3, name: "Salário", kind: "income", monthly_budget_cents: 0, active: true },
    ] as Category[],
    transactions: [{ id: 1, category_id: 1 }, { id: 2, category_id: 1 }, { id: 3, category_id: 2 }] as Transaction[],
    bills: [{ id: 1, name: "Feira mensal", amount_cents: 1, due_day: 1, category_id: 1, recurring: true, active: true }],
    subscriptions: [subscription({ category_id: 1, card_id: 7 })],
    cards: [{ id: 7, name: "Visa", closing_day: 1, due_day: 8, real_limit_cents: 0, personal_limit_cents: 0, active: true }, { id: 8, name: "Master", closing_day: 1, due_day: 8, real_limit_cents: 0, personal_limit_cents: 0, active: true }],
  };

  it("counts links and describes them in pt-BR", () => {
    expect(linkCounts(state, "categories", 1)).toEqual({ transactions: 2, bills: 1, subscriptions: 1 });
    expect(linksMessage("categories", linkCounts(state, "categories", 1))).toBe("Usada em 2 lançamentos, 1 conta e 1 assinatura.");
    expect(linksMessage("cards", linkCounts(state, "cards", 7))).toBe("Usado em 1 assinatura.");
  });

  it("offers same-kind categories and other cards as destinations", () => {
    expect(reassignTargets(state, "categories", 1)).toEqual([["2", "Feira"]]);
    expect(reassignTargets(state, "cards", 7)).toEqual([["8", "Master"]]);
  });
});
