// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketIndicator } from "../../api/insights";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { emptyState, makePageProps } from "../../test/fixtures";
import type { Bill, CardInvoiceRow, PageProps, Transaction } from "../../types";
import { suggestedBucket } from "../catalog/catalogMetrics";
import { billDisplayStatus, buildBillRows } from "../planning/billStatus";
import { invoiceMonthTitle } from "../planning/invoiceRows";
import { GoalsPage } from "../planning/PlanningPages";
import { TransactionsPage } from "../transactions/TransactionsPage";
import { shortMethod } from "../transactions/transactionsModel";
import { projectAccounts, unpaidInvoicesUntil } from "../wealth/accountProjection";
import { benchmarkReference } from "../wealth/conversion";
import { OFFLINE_REASON } from "./offline";

const monthItems: Transaction[] = [];
vi.mock("../../hooks/useMonthTransactions", () => ({ useMonthTransactions: (month: string) => ({ items: monthItems, loading: false, error: null, reload: vi.fn(), loadedKey: `${month}:0` }) }));

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 18, 12)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); monthItems.length = 0; });

const renderPage = (Page: (props: PageProps) => ReactNode, props: PageProps) => render(<ConfirmProvider><Page {...props} /></ConfirmProvider>);
const bill = (over: Partial<Bill>): Bill => ({ id: 1, name: "Luz", amount_cents: 20_000, due_day: 22, category_id: null, recurring: true, active: true, ...over });
const account = { id: 3, name: "Conta corrente", institution: "Nubank", account_type: "checking", current_balance_cents: 1_000_000, color_label: null, active: true };

describe("R2-CONTAS-1 · projeção com contas vencidas", () => {
  it("inclui contas não pagas vinculadas à conta, vencidas ou não, com ou sem débito automático", () => {
    const rent = bill({ id: 1, name: "Aluguel", amount_cents: 320_000, due_day: 5, account_id: 3 });
    const power = bill({ id: 2, name: "Luz Enel", amount_cents: 21_340, due_day: 22, auto_debit: true, account_id: 3 });
    const other = bill({ id: 3, name: "Condomínio", amount_cents: 65_000, due_day: 6 });
    const checklist = [rent, power, other].map(item => ({ ...item, paid: false, paid_at: null, transaction_id: null }));
    const projection = projectAccounts([account], [rent, power, other], checklist, [], "2026-09", "2026-09-18").get(3)!;
    expect(projection.debits.map(debit => [debit.name, Boolean(debit.overdue)])).toEqual([["Aluguel", true], ["Luz Enel", false]]);
    expect(projection.projectedCents).toBe(1_000_000 - 341_340);
  });

  it("soma as faturas de cartão a pagar até o fim do mês (vencidas incluídas)", () => {
    const base: CardInvoiceRow = { card_id: 1, card_name: "Nubank", brand: null, network: null, color: null, month: "2026-08", period_start: "2026-07-04", period_end: "2026-08-03", closing_date: "2026-08-03", due_date: "2026-08-10", total_cents: 193_500, items_count: 4, status: "vencida", paid: null };
    const totals = unpaidInvoicesUntil([base, { ...base, month: "2026-09", due_date: "2026-09-10", total_cents: 31_800, status: "vencida" }, { ...base, month: "2026-10", due_date: "2026-10-10", status: "aberta", total_cents: 50_000 }, { ...base, month: "2026-07", paid: { date: "2026-07-10", amount_cents: 1, account_id: 3 } as CardInvoiceRow["paid"] }], "2026-09", "2026-09-18");
    expect(totals).toEqual({ count: 2, cents: 225_300, overdue: 2 });
  });
});

describe("R2-BILLS · estado único e título da fatura", () => {
  it("débito automático ainda por vir diz o estado uma vez", () => {
    const [row] = buildBillRows([bill({ auto_debit: true, account_id: 3 })], [], [], "2026-09", "2026-09-18");
    expect(billDisplayStatus(row!)).toEqual({ label: "Débito automático em 22/09 (4 dias)", tone: "neutral" });
    const [closed] = buildBillRows([bill({ auto_debit: true, account_id: 3 })], [], [], "2026-09", "2026-09-18", { closed: true });
    expect(billDisplayStatus(closed!, true).label).toBe("Não debitada");
  });

  it("no celular a fatura tem o mês como título", () => {
    expect(invoiceMonthTitle({ month: "2026-08" })).toBe("Agosto/2026");
  });
});

describe("R2-INV-1 · referência de rendimento em todos os cartões", () => {
  const indicators = [
    { code: "cdi", label: "CDI", value: 13.9, unit: "% a.a.", reference_date: null, source: "BC", fetched_at: "", stale: false },
    { code: "selic", label: "Selic", value: 14, unit: "% a.a.", reference_date: null, source: "BC", fetched_at: "", stale: false },
    { code: "ipca_12m", label: "IPCA", value: 4, unit: "%", reference_date: null, source: "BC", fetched_at: "", stale: false },
  ] satisfies MarketIndicator[];
  it("CDI, Selic e IPCA + x% ganham a mesma linha", () => {
    expect(benchmarkReference("CDI", indicators, "CDB 110% CDI")?.text).toBe("Rende 110% do CDI (≈ 15,29% ao ano hoje)");
    expect(benchmarkReference("Selic", indicators, "Tesouro Selic 2029")?.text).toBe("Rende 100% da Selic (≈ 14% ao ano hoje)");
    expect(benchmarkReference("IPCA + 6%", indicators)?.text).toBe("Rende IPCA + 6% (≈ 10,24% ao ano hoje)");
    expect(benchmarkReference("S&P 500", indicators)).toBeNull();
  });
});

describe("R2-REC-1 · balde sugerido com plano ativo", () => {
  it("despesa começa em gastos fixos e investimento em investimento; sem plano, nada", () => {
    expect(suggestedBucket({ plan_fixed_pct: 70 }, "expense")).toBe("fixo");
    expect(suggestedBucket({ plan_fixed_pct: 70 }, "investment")).toBe("investimento");
    expect(suggestedBucket({ plan_fixed_pct: 70 }, "income")).toBe("");
    expect(suggestedBucket({ plan_fixed_pct: null }, "expense")).toBe("");
  });
});

describe("R2-METAS-1 · concluir meta offline", () => {
  it("Concluir meta fica desabilitado com o motivo", () => {
    const goal = { id: 4, name: "Notebook", type: "purchase", target_cents: 100_000, current_cents: 100_000, target_date: null, currency: "BRL", active: true };
    renderPage(GoalsPage, makePageProps({ offline: true, state: { ...emptyState, goals: [goal] } }));
    const button = screen.getByRole("button", { name: "Concluir meta" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(OFFLINE_REASON);
  });
});

describe("R2-LANC · sinal, botão secundário e forma curta", () => {
  it("o KPI Investimentos leva o mesmo − das linhas e o botão do cabeçalho é secundário", () => {
    monthItems.push({ id: 1, date: "2026-09-10", description: "Aporte", kind: "investment", amount_cents: 80_000, category_id: null, category_name: null, payment_method: "transfer", card_id: null, card_name: null, notes: null, account_id: null, account_name: null } as Transaction);
    renderPage(TransactionsPage, makePageProps({ state: emptyState }));
    const kpi = screen.getByText("Investimentos", { selector: "dt" }).closest(".stat")!;
    expect(kpi.textContent).toMatch(/−R\$\s800,00/);
    const add = within(document.querySelector(".page-header")!).getByRole("button", { name: "Novo lançamento" });
    expect(add.className).not.toContain("primary");
    fireEvent.click(add);
    expect(shortMethod("card")).toBe("Crédito");
    expect(shortMethod("pix")).toBe("Pix");
  });
});
