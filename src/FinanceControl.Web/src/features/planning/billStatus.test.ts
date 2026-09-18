import { describe, expect, it } from "vitest";
import type { Bill, ChecklistItem } from "../../types";
import { billStatus, billTotals, buildBillRows, sortBillsForAction, paidDate } from "./billStatus";
import { daysBetween, monthsBetween } from "../../lib/date";
import { dueDateInMonth } from "./dueDates";

const bill = (id: number, name: string, due_day: number, amount_cents = 10000, category_id: number | null = null): Bill =>
  ({ id, name, amount_cents, due_day, category_id, recurring: true, active: true });
const paidItem = (source: Bill, paid_at: string | null, transaction_id: number | null = null): ChecklistItem =>
  ({ ...source, paid: true, paid_at, transaction_id });

describe("dueDates", () => {
  it("counts calendar days across months and DST", () => {
    expect(daysBetween("2026-09-17", "2026-09-17")).toBe(0);
    expect(daysBetween("2026-09-17", "2026-10-02")).toBe(15);
    expect(daysBetween("2026-09-17", "2026-09-10")).toBe(-7);
    expect(daysBetween("2026-10-17", "2026-11-05")).toBe(19);
  });

  it("counts calendar months", () => {
    expect(monthsBetween("2026-09-17", "2026-12-01")).toBe(3);
    expect(monthsBetween("2026-09-17", "2027-01-31")).toBe(4);
  });

  it("clamps due days beyond the month length", () => {
    expect(dueDateInMonth("2026-02", 31)).toEqual({ date: "2026-02-28", clamped: true });
    expect(dueDateInMonth("2026-09", 30)).toEqual({ date: "2026-09-30", clamped: false });
    expect(dueDateInMonth("2026-09", 31)).toEqual({ date: "2026-09-30", clamped: true });
  });
});

describe("billStatus", () => {
  const today = "2026-09-17";

  it("describes paid bills with the payment date", () => {
    expect(billStatus(true, "2026-09-05 10:30:00", "2026-09-10", today)).toEqual({ label: "Paga em 05/09", tone: "positive" });
    expect(billStatus(true, null, "2026-09-10", today)).toEqual({ label: "Paga", tone: "positive" });
  });

  it("describes due today, overdue and upcoming bills", () => {
    expect(billStatus(false, null, "2026-09-17", today)).toEqual({ label: "Vence hoje", tone: "warning" });
    expect(billStatus(false, null, "2026-09-16", today)).toEqual({ label: "Vencida há 1 dia", tone: "negative" });
    expect(billStatus(false, null, "2026-09-07", today)).toEqual({ label: "Vencida há 10 dias", tone: "negative" });
    expect(billStatus(false, null, "2026-09-18", today)).toEqual({ label: "Vence em 18/09 (1 dia)", tone: "warning" });
    expect(billStatus(false, null, "2026-09-22", today)).toEqual({ label: "Vence em 22/09 (5 dias)", tone: "warning" });
    expect(billStatus(false, null, "2026-09-30", today)).toEqual({ label: "Vence em 30/09 (13 dias)", tone: "neutral" });
  });

  it("reads the local date of UTC timestamps", () => {
    expect(paidDate("2026-09-05T12:00:00Z")).toBe("2026-09-05");
    expect(paidDate("garbage")).toBeNull();
  });
});

describe("buildBillRows / billTotals", () => {
  const rent = bill(1, "Aluguel", 5, 200000, 7);
  const net = bill(2, "Internet", 31, 10000);
  const power = bill(3, "Energia", 20, 30000);

  it("sorts by effective due date, merges checklist status and clamps short months", () => {
    const rows = buildBillRows([power, net, rent], [paidItem(rent, "2026-02-04 09:00:00", 42)], [{ id: 7, name: "Moradia", kind: "expense", monthly_budget_cents: 0, active: true }], "2026-02", "2026-02-10");
    expect(rows.map(row => row.bill.name)).toEqual(["Aluguel", "Energia", "Internet"]);
    expect(rows[0]).toMatchObject({ paid: true, transactionId: 42, categoryName: "Moradia", status: { label: "Paga em 04/02" } });
    expect(rows[2]).toMatchObject({ dueDate: "2026-02-28", clamped: true, status: { label: "Vence em 28/02 (18 dias)", tone: "neutral" } });
  });

  it("sums paid/pending; the next due bill is never an overdue one (CR-18)", () => {
    const rows = buildBillRows([rent, net, power], [paidItem(net, null)], [], "2026-09", "2026-09-17");
    const totals = billTotals(rows);
    expect(totals).toMatchObject({ totalCents: 240000, paidCents: 10000, pendingCents: 230000, paidCount: 1, pendingCount: 2, overdueCount: 1 });
    expect(totals.next?.bill.name).toBe("Energia");
    // Overdue unpaid bills lead the list.
    expect(sortBillsForAction(rows).map(row => row.bill.name)).toEqual(["Aluguel", ...rows.filter(row => row.bill.name !== "Aluguel").map(row => row.bill.name)]);
  });

  it("has no next bill when everything is paid", () => {
    const rows = buildBillRows([rent], [paidItem(rent, null)], [], "2026-09", "2026-09-17");
    expect(billTotals(rows).next).toBeNull();
  });
});
