// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { emptyState, makePageProps } from "../../test/fixtures";
import type { Bill, CardInvoiceRow, Category, MonthlySummary, PageProps, Subscription } from "../../types";
import { CategoriesPage, SubscriptionsPage } from "../catalog/CatalogPages";
import { billExistsIn, billStatus, buildBillRows } from "../planning/billStatus";
import { buildInvoiceRows } from "../planning/invoiceRows";
import { BillsPage, GoalsPage } from "../planning/PlanningPages";
import { shortDayLabel } from "../transactions/transactionsModel";
import { projectAccounts } from "../wealth/accountProjection";
import { investmentCdiShare } from "../wealth/conversion";
import { OFFLINE_REASON } from "./offline";

vi.mock("../../api/client", async importOriginal => ({
  ...await importOriginal<typeof import("../../api/client")>(),
  api: {
    cardInvoicesDue: vi.fn(async () => []),
    update: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => undefined),
    restore: vi.fn(async () => ({ ok: true })),
    goalEntriesPage: vi.fn(async () => ({ items: [], total: 0 })),
    setChecklist: vi.fn(async () => ({ ok: true })),
  },
}));

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 18, 12)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const renderPage = (Page: (props: PageProps) => ReactNode, props: PageProps) => render(<ConfirmProvider><Page {...props} /></ConfirmProvider>);

const bill = (over: Partial<Bill>): Bill => ({ id: 1, name: "Luz", amount_cents: 20_000, due_day: 22, category_id: null, recurring: true, active: true, ...over });
const closedSummary = (month: string): MonthlySummary => ({ month, income_cents: 0, expense_cents: 0, investment_cents: 0, transactions_count: 0, uncategorized_expense_cents: 0, categories: [], bills: { total_count: 0, paid_count: 0, total_cents: 0, paid_cents: 0 }, closed: true, closed_at: "2026-09-01T10:00:00" });
const invoice = (over: Partial<CardInvoiceRow>): CardInvoiceRow => ({
  card_id: 1, card_name: "Nubank", brand: "nubank", network: null, color: null, month: "2026-08", period_start: "2026-07-04", period_end: "2026-08-03",
  closing_date: "2026-08-03", due_date: "2026-08-10", total_cents: 102_300, items_count: 7, status: "vencida", paid: null, ...over,
});

describe("R1-BILLS-1 · contas que ainda não existiam e mês fechado", () => {
  it("a conta só entra a partir do mês de active_since", () => {
    expect(billExistsIn(bill({ active_since: "2026-09-18" }), "2026-08")).toBe(false);
    expect(billExistsIn(bill({ active_since: "2026-09-18" }), "2026-09")).toBe(true);
    expect(billExistsIn(bill({ active_since: null }), "2020-01")).toBe(true);
    const rows = buildBillRows([bill({ id: 1, active_since: "2026-09-18" }), bill({ id: 2, name: "Aluguel" })], [], [], "2026-08", "2026-09-18");
    expect(rows.map(row => row.bill.name)).toEqual(["Aluguel"]);
  });

  it("mês fechado diz \"Não paga\" (neutro) e débito automático que não rodou diz \"Não debitada\"", () => {
    expect(billStatus(false, null, "2026-08-10", "2026-09-18", { closed: true })).toEqual({ label: "Não paga", tone: "neutral" });
    expect(billStatus(false, null, "2026-08-22", "2026-09-18", { closed: true, autoDebit: true })).toEqual({ label: "Não debitada", tone: "neutral" });
    expect(billStatus(false, null, "2026-09-10", "2026-09-18", { autoDebit: true })).toEqual({ label: "Não debitada em 10/09", tone: "warning" });
  });

  it("agosto fechado: banner, nada \"vencido\" e KPI \"Não pagas\"", () => {
    const props = makePageProps({ month: "2026-08", summary: closedSummary("2026-08"), onReopenMonth: vi.fn(async () => true), state: { ...emptyState, bills: [bill({ auto_debit: true, account_id: 1 }), bill({ id: 2, name: "Aluguel", due_day: 5 })] } });
    renderPage(BillsPage, props);
    expect(screen.getByText("Mês fechado")).toBeTruthy();
    expect(screen.queryByText(/Vencida há/)).toBeNull();
    expect(screen.getByText("Não debitada")).toBeTruthy();
    expect(screen.getByText("Não paga")).toBeTruthy();
    expect(screen.getByText("Não pagas")).toBeTruthy();
    expect(screen.queryByText(/Será debitada/)).toBeNull();
  });
});

describe("R1-BILLS-2 · faturas de cartão em Contas a pagar", () => {
  it("lista a fatura vencida com \"Pagar fatura\", soma nos KPIs e ordena vencidas primeiro", async () => {
    vi.mocked(api.cardInvoicesDue).mockResolvedValueOnce([
      invoice({ month: "2026-09", due_date: "2026-09-10", total_cents: 91_200, status: "vencida" }),
      invoice({ card_id: 2, card_name: "Itaú", brand: null, month: "2026-09", due_date: "2026-09-25", total_cents: 31_800, status: "fechada" }),
      invoice({}),
    ]);
    const props = makePageProps({ state: { ...emptyState, cards: [{ id: 1, name: "Nubank", closing_day: 3, due_day: 10, real_limit_cents: 0, personal_limit_cents: 0, active: true }] } });
    renderPage(BillsPage, props);
    const region = await screen.findByRole("region", { name: "Faturas de cartão de setembro de 2026" });
    const titles = Array.from(region.querySelectorAll(".entity-name")).map(node => node.textContent);
    expect(titles).toEqual(["Fatura Nubank · Agosto/2026", "Fatura Nubank · Setembro/2026", "Fatura Itaú · Setembro/2026"]);
    expect(within(region).getByText("Fatura de um mês anterior ainda em aberto")).toBeTruthy();
    fireEvent.click(within(region).getByRole("button", { name: "Pagar Fatura Nubank · Agosto/2026" }));
    expect(props.openModal).toHaveBeenCalledWith("invoice-payment", expect.objectContaining({ card_id: 1, month: "2026-08", total_cents: 102_300 }));
    const overdue = Array.from(document.querySelectorAll(".stat")).find(node => node.querySelector(".stat-label")?.textContent === "Em atraso")!;
    expect(overdue.textContent).toMatch(/R\$\s1\.935,00/);
    expect(overdue.textContent).toContain("2 faturas vencidas");
  });

  it("a fatura paga vai para o fim e mostra a data", () => {
    const rows = buildInvoiceRows([invoice({ paid: { amount_cents: 1, date: "2026-09-05", account_id: 1, account_name: "Nubank", bank_entry_id: 3 }, status: "paga", month: "2026-09" }), invoice({ month: "2026-09", due_date: "2026-09-30", status: "fechada" })], "2026-09", "2026-09-18");
    expect(rows.map(row => row.status.label)).toEqual(["Vence em 30/09 (12 dias)", "Paga em 05/09"]);
  });
});

describe("R1-METAS · número da liberdade e metas atingidas", () => {
  const settings = { ...emptyState.settings, monthly_net_income_cents: 1_100_000, freedom_goal_id: 7, freedom_goal_status: "linked" as const, freedom_multiplier: 150, freedom_progress_cents: 7_100_000 };
  const freedom = { id: 7, name: "Número da liberdade", type: "retirement", target_cents: 165_000_000, current_cents: 7_100_000, target_date: null, currency: "BRL", active: true };
  const trip = { id: 8, name: "Viagem", type: "travel", target_cents: 500_000, current_cents: 500_000, target_date: null, currency: "BRL", active: true };

  it("destaca a liberdade sem aporte manual e tira ela dos KPIs", () => {
    renderPage(GoalsPage, makePageProps({ state: { ...emptyState, settings, goals: [freedom, trip] } }));
    const featured = document.querySelector(".goal-card.is-featured")!;
    expect(featured.textContent).toContain("Número da liberdade");
    expect(featured.textContent).toContain("Patrimônio investido");
    expect(within(featured as HTMLElement).getByText("Automática · patrimônio")).toBeTruthy();
    expect(within(featured as HTMLElement).queryByRole("button", { name: "Registrar aporte" })).toBeNull();
    const saved = Array.from(document.querySelectorAll(".stat")).find(node => node.querySelector(".stat-label")?.textContent === "Guardado")!;
    expect(saved.textContent).toMatch(/R\$\s5\.000,00/);
    expect(saved.textContent).toContain("sem o Número da liberdade");
  });

  it("meta atingida oferece \"Concluir meta\" (secundário) com desfazer", async () => {
    const props = makePageProps({ state: { ...emptyState, goals: [trip] } });
    renderPage(GoalsPage, props);
    const button = screen.getByRole("button", { name: "Concluir meta" });
    expect(button.className).not.toContain("primary");
    fireEvent.click(button);
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Concluir meta" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("goals", 8));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith('Meta "Viagem" concluída.', expect.objectContaining({ label: "Desfazer" })));
  });
});

describe("R1-INV-1 · % do CDI", () => {
  it("usa o % do nome quando o benchmark é só \"CDI\"", () => {
    expect(investmentCdiShare("CDI", "CDB Nubank 110% CDI")).toBe(110);
    expect(investmentCdiShare("105% do CDI", "CDB Nubank 110% CDI")).toBe(105);
    expect(investmentCdiShare(null, "LCI 95% do CDI")).toBe(95);
    expect(investmentCdiShare("CDI", "Tesouro Selic")).toBe(100);
    expect(investmentCdiShare("IPCA + 6%", "CDB 110% CDI")).toBeNull();
  });
});

describe("R1-CONTAS-1 · saldo projetado", () => {
  it("soma os débitos automáticos ainda pendentes no mês por conta", () => {
    const account = { id: 3, name: "Principal", institution: "Nubank", account_type: "checking", current_balance_cents: 500_000, color_label: null, active: true };
    const power = bill({ id: 1, auto_debit: true, account_id: 3, due_day: 22 });
    const paidBill = bill({ id: 2, name: "Água", auto_debit: true, account_id: 3, due_day: 5 });
    const gym: Subscription = { id: 4, name: "Academia", amount_cents: 9_900, billing_day: 25, category_id: null, category_name: null, card_id: null, card_name: null, frequency: "monthly", next_billing_date: null, active: true, auto_debit: true, account_id: 3 };
    const projection = projectAccounts([account], [power, paidBill], [{ ...paidBill, paid: true, paid_at: null, transaction_id: null }, { ...power, paid: false, paid_at: null, transaction_id: null }], [gym], "2026-09", "2026-09-18").get(3)!;
    expect(projection.debits.map(debit => debit.name)).toEqual(["Luz", "Academia"]);
    expect(projection.pendingCents).toBe(29_900);
    expect(projection.projectedCents).toBe(470_100);
  });
});

describe("R1-ASSIN-1 · cobrança pendente", () => {
  it("mostra a data da cobrança não lançada e o KPI filtra as pendentes", () => {
    const pending: Subscription = { id: 1, name: "Spotify", amount_cents: 2_190, billing_day: 8, category_id: null, category_name: null, card_id: null, card_name: null, frequency: "monthly", next_billing_date: null, active: true };
    const other: Subscription = { ...pending, id: 2, name: "Netflix", billing_day: 28, last_charge_date: null };
    renderPage(SubscriptionsPage, makePageProps({ state: { ...emptyState, subscriptions: [other, pending] } }));
    expect(screen.getByText("Cobrança de 08/09 não lançada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar só a cobrança a lançar" }));
    expect(screen.getByText("Só cobranças a lançar")).toBeTruthy();
    expect(screen.queryByText("Netflix", { selector: ".entity-name" })).toBeNull();
  });
});

describe("R1-CAT · baldes e teto", () => {
  const categories: Category[] = [
    { id: 1, name: "Moradia", kind: "expense", monthly_budget_cents: 600_000, active: true, bucket: "fixo" },
    { id: 2, name: "Restaurantes", kind: "expense", monthly_budget_cents: 230_000, active: true, bucket: null },
  ];
  const settings = { ...emptyState.settings, monthly_spending_limit_cents: 990_000, plan_fixed_pct: 70, plan_fun_pct: 20, plan_invest_pct: 10 };

  it("compara a soma dos limites com o teto e filtra as sem balde pela rota", async () => {
    const props = makePageProps({ routeParams: { balde: "sem" }, state: { ...emptyState, settings, categories } });
    renderPage(CategoriesPage, props);
    expect(screen.getByText("Soma dos limites por categoria")).toBeTruthy();
    expect(screen.getByText(/do teto de gastos/).textContent).toMatch(/Dentro do teto de gastos de R\$\s9\.900,00/);
    expect(screen.getByText("Gasto categorizado")).toBeTruthy();
    expect(screen.getByText("Só categorias sem balde")).toBeTruthy();
    expect(screen.queryByText("Moradia", { selector: ".entity-name" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Balde do plano de Restaurantes" })).toBeTruthy();
  });

  it("desabilita a criação sem conexão", () => {
    renderPage(CategoriesPage, makePageProps({ offline: true, state: { ...emptyState, settings, categories } }));
    const button = screen.getByRole("button", { name: "Nova categoria" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(OFFLINE_REASON);
  });
});

describe("R1-LANC-3", () => {
  it("rótulo curto do dia para o celular", () => {
    expect(shortDayLabel("2026-09-17")).toBe("Qui, 17/09");
  });
});
