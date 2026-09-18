// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { emptyState, makePageProps } from "../../test/fixtures";
import type { Bill, ChecklistItem, PageProps } from "../../types";
import { ApiError } from "../../api/client";
import { BillsPage, GoalsPage } from "./PlanningPages";

vi.mock("../../api/client", async importOriginal => ({
  ...await importOriginal<typeof import("../../api/client")>(),
  api: { setChecklist: vi.fn(async () => ({ ok: true, transaction_id: null })), goalEntriesPage: vi.fn(async () => ({ items: [], total: 0 })), update: vi.fn(async () => ({ ok: true })), createEmergencyGoal: vi.fn(async () => ({ ok: true })) },
}));

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 17, 12)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const rent: Bill = { id: 1, name: "Aluguel", amount_cents: 200000, due_day: 5, category_id: null, category_name: "Moradia", recurring: true, active: true };
const net: Bill = { id: 2, name: "Internet", amount_cents: 10000, due_day: 31, category_id: null, recurring: true, active: true };
const power: Bill = { id: 3, name: "Energia", amount_cents: 30000, due_day: 17, category_id: null, recurring: true, active: true };

const renderPage = (Page: (props: PageProps) => ReactNode, props: PageProps) => render(<ConfirmProvider><Page {...props} /></ConfirmProvider>);

/** Opens the "…" menu of a record and returns the menu item (CR-19/CR-20). */
function menuItem(record: string, item: string | RegExp): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: `Mais ações para ${record}` }));
  return screen.getByRole("menuitem", { name: item });
}

describe("BillsPage", () => {
  it("lists bills by due date with month-aware statuses and totals", () => {
    const paid: ChecklistItem = { ...net, paid: true, paid_at: "2026-09-16 08:00:00", transaction_id: 12 };
    renderPage(BillsPage, makePageProps({ state: { ...emptyState, bills: [net, power, rent] }, checklist: [paid] }));
    const names = screen.getAllByRole("row").slice(1).map(row => within(row).getAllByRole("cell")[0]!.querySelector(".entity-name")!.textContent);
    expect(names).toEqual(["Aluguel", "Energia", "Internet"]);
    expect(screen.getByText("Vencida há 12 dias")).toBeTruthy();
    expect(screen.getByText("Vence hoje")).toBeTruthy();
    expect(screen.getByText("Paga em 16/09")).toBeTruthy();
    expect(screen.getByText(/Dia 31 não existe neste mês/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Compromissos de setembro de 2026" })).toBeTruthy();
  });

  it("opens the payment dialog and reopens a paid bill", async () => {
    const props = makePageProps({ state: { ...emptyState, bills: [rent, net] }, checklist: [{ ...net, paid: true, paid_at: null, transaction_id: 12 }] });
    renderPage(BillsPage, props);
    fireEvent.click(screen.getByRole("button", { name: "Pagar Aluguel" }));
    expect(props.openModal).toHaveBeenCalledWith("bill-payment", { bill_id: 1, month: "2026-09", name: "Aluguel", amount: 200000 });
    fireEvent.click(screen.getByRole("button", { name: "Reabrir pagamento de Internet" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reabrir pagamento" }));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith("Pagamento reaberto; o lançamento vinculado foi removido."));
    expect(api.setChecklist).toHaveBeenCalledWith({ bill_id: 2, month: "2026-09", paid: false });
    expect(props.refresh).toHaveBeenCalled();
  });

  it("MEL-22 · desabilita pagar e reabrir pagamento quando o mês está fechado", () => {
    const summary = { month: "2026-09", income_cents: 0, expense_cents: 0, investment_cents: 0, transactions_count: 0, uncategorized_expense_cents: 0, categories: [], bills: { total_count: 2, paid_count: 1, total_cents: 0, paid_cents: 0 }, closed: true, closed_at: "2026-10-01T09:00:00" };
    const props = makePageProps({ state: { ...emptyState, bills: [rent, net] }, checklist: [{ ...net, paid: true, paid_at: null, transaction_id: 12 }], summary });
    renderPage(BillsPage, props);
    const pay = screen.getByRole("button", { name: "Pagar Aluguel" }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
    expect(pay.title).toBe("Mês fechado");
    expect((screen.getByRole("button", { name: "Reabrir pagamento de Internet" }) as HTMLButtonElement).disabled).toBe(true);
    // Bills themselves are not month records: editing them stays available.
    expect((screen.getByRole("button", { name: "Editar Aluguel" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("CR-18 · separa \"Em atraso\" do próximo vencimento e põe as atrasadas no topo", () => {
    const later: Bill = { id: 4, name: "Academia", amount_cents: 9_000, due_day: 25, category_id: null, recurring: true, active: true };
    const paidEarly: ChecklistItem = { ...net, due_day: 2, paid: true, paid_at: "2026-09-02 08:00:00", transaction_id: null };
    renderPage(BillsPage, makePageProps({ state: { ...emptyState, bills: [later, { ...net, due_day: 2 }, rent, power] }, checklist: [paidEarly] }));
    const strip = document.querySelector(".stat-strip")!;
    const stat = (label: string) => Array.from(strip.querySelectorAll(".stat")).find(item => item.querySelector(".stat-label")?.textContent === label)!;
    expect(stat("Em atraso").querySelector(".stat-value")!.className).toContain("negative");
    expect(stat("Em atraso").textContent).toMatch(/R\$\s2\.000,00/);
    expect(stat("Em atraso").textContent).toContain("1 conta vencida");
    expect(stat("Próximo vencimento").textContent).toContain("Energia");
    expect(stat("Próximo vencimento").textContent).toContain("17/09");
    const names = screen.getAllByRole("row").slice(1).map(row => row.querySelector(".entity-name")!.textContent);
    // R1-BILLS-3: overdue first, then what is still to pay, paid ones at the end.
    expect(names).toEqual(["Aluguel", "Energia", "Academia", "Internet"]);
  });
});

describe("GoalsPage", () => {
  it("shows remaining amount, monthly contribution and the history dialog", async () => {
    const props = makePageProps({ state: { ...emptyState, goals: [{ id: 4, name: "Viagem", type: "travel", target_cents: 1_000_000, current_cents: 400_000, target_date: "2026-12-31", currency: "BRL", active: true }] } });
    renderPage(GoalsPage, props);
    expect(screen.getByText("Viagem", { selector: "h3" })).toBeTruthy();
    // R2-METAS-4: the type badge would repeat the name.
    expect(screen.queryAllByText("Viagem", { selector: ".badge" }).length).toBe(0);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText(/2\.000,00\/mês/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Registrar aporte" }));
    expect(props.openModal).toHaveBeenCalledWith("goal-entry", { goal_id: 4 });
    fireEvent.click(menuItem("Viagem", "Histórico"));
    expect(await screen.findByText("Nenhuma movimentação registrada")).toBeTruthy();
    expect(api.goalEntriesPage).toHaveBeenCalledWith(4, { limit: 50, offset: 0 });
  });
});

describe("v1.2 · débito automático, marcas e reserva", () => {
  const linkedSettings = { ...emptyState.settings, monthly_net_income_cents: 800_000, emergency_months_target: 6, emergency_goal_id: 11, emergency_goal_auto: true, emergency_goal_status: "linked" as const, emergency_reserve_target_cents: 4_800_000 };
  const reserve = { id: 11, name: "Reserva de emergência", type: "emergency", target_cents: 4_800_000, current_cents: 100_000, target_date: null, currency: "BRL", active: true };

  it("mostra o selo de débito automático, a marca do serviço e a data do débito (MEL-29/39)", () => {
    const netflix: Bill = { id: 5, name: "Netflix", amount_cents: 5_590, due_day: 20, category_id: null, recurring: true, active: true, auto_debit: true, account_id: 3, account_name: "Nubank", brand: "netflix" };
    renderPage(BillsPage, makePageProps({ state: { ...emptyState, bills: [netflix] } }));
    const row = screen.getByText("Netflix", { selector: ".entity-name" }).closest("tr")!;
    // R2-BILLS-3: one state for a debit still ahead — "Débito automático em 20/09 (N dias)" — and "Pagar antes".
    expect(row.textContent).toContain("Débito em Nubank");
    expect(row.querySelector(".badge.auto-debit")).toBeNull();
    expect(row.textContent).toMatch(/Débito automático em 20\/09 \(\d+ dias?\)/);
    expect(row.textContent).not.toContain("Será debitada");
    expect(within(row).getByRole("button", { name: "Pagar antes Netflix" })).toBeTruthy();
    expect(row.querySelector(".bank-logo")?.getAttribute("data-brand")).toBe("netflix");
    // R4-BILLS-1: the next item is the debit itself, so the KPI does not repeat "1 em débito automático".
    expect(screen.queryByText(/1 em débito automático/)).toBeNull();
  });

  it("falhas ao reabrir o pagamento vão para o aviso de erro (MEL-28)", async () => {
    vi.mocked(api.setChecklist).mockRejectedValueOnce(new ApiError("O mês está fechado.", 400, {}));
    const notifyError = vi.fn();
    renderPage(BillsPage, makePageProps({ notifyError, state: { ...emptyState, bills: [net] }, checklist: [{ ...net, paid: true, paid_at: null, transaction_id: 12 }] }));
    fireEvent.click(screen.getByRole("button", { name: "Reabrir pagamento de Internet" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reabrir pagamento" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(expect.any(ApiError)));
    expect(document.querySelector(".error-banner")).toBeNull();
  });

  it("marca a reserva automática e desliga o cálculo com confirmação e desfazer (MEL-43)", async () => {
    const props = makePageProps({ state: { ...emptyState, settings: linkedSettings, goals: [reserve] } });
    renderPage(GoalsPage, props);
    expect(screen.getByText("Automática", { selector: ".reserve-badge" })).toBeTruthy();
    // R2-METAS-4: the goal is named "Reserva de emergência", so the type badge is left out.
    expect(screen.queryByText("Reserva de emergência", { selector: ".badge" })).toBeNull();
    expect(screen.getByText(/Alvo = 6 meses × R\$\s8\.000,00 de salário líquido\./)).toBeTruthy();
    // CR-19: the rare, consequential switch lives in the goal menu.
    expect(screen.queryByRole("button", { name: "Desligar cálculo automático" })).toBeNull();
    fireEvent.click(menuItem("Reserva de emergência", /^Desligar cálculo automático/));
    fireEvent.click(within(await screen.findByRole("alertdialog", { name: "Desligar o cálculo automático da reserva?" })).getByRole("button", { name: "Desligar" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith("goals", 11, { target_cents: 4_800_000, detach_auto: true }));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith("Cálculo automático da reserva desligado.", expect.objectContaining({ label: "Desfazer" })));
    await vi.mocked(props.notify).mock.calls[0]![1]!.run();
    expect(api.createEmergencyGoal).toHaveBeenCalled();
  });

  it("reserva com valor manual oferece voltar a acompanhar o salário", async () => {
    const props = makePageProps({ state: { ...emptyState, settings: { ...linkedSettings, emergency_goal_auto: false }, goals: [reserve] } });
    renderPage(GoalsPage, props);
    expect(screen.getByText("Valor manual", { selector: ".reserve-badge" })).toBeTruthy();
    fireEvent.click(menuItem("Reserva de emergência", "Voltar a acompanhar o salário"));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith("A reserva voltou a acompanhar o salário."));
  });

  it("bloqueia aporte e resgate com o mês atual fechado (MEL-44)", () => {
    const summary = { month: "2026-09", income_cents: 0, expense_cents: 0, investment_cents: 0, transactions_count: 0, uncategorized_expense_cents: 0, categories: [], bills: { total_count: 0, paid_count: 0, total_cents: 0, paid_cents: 0 }, closed: true, closed_at: "2026-09-30T10:00:00" };
    renderPage(GoalsPage, makePageProps({ summary, state: { ...emptyState, goals: [{ ...reserve, id: 4, name: "Viagem", type: "travel" }] } }));
    expect((screen.getByRole("button", { name: "Registrar aporte" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Mês fechado: reabra o mês para registrar aportes e resgates\./)).toBeTruthy();
    expect(menuItem("Viagem", /^Resgatar/).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Histórico" }).getAttribute("aria-disabled")).toBeNull();
  });
});

describe("CR-19 · tipo da reserva vinculada", () => {
  it("a meta vinculada aparece como reserva mesmo criada como objetivo livre", () => {
    const settings = { ...emptyState.settings, monthly_net_income_cents: 500_000, emergency_goal_id: 3, emergency_goal_auto: true };
    renderPage(GoalsPage, makePageProps({ state: { ...emptyState, settings, goals: [{ id: 3, name: "Reserva", type: "custom", target_cents: 3_000_000, current_cents: 0, target_date: null, currency: "BRL", active: true }] } }));
    // R3-METAS-2: the type lives on the icon of every card (no badge on only some of them).
    expect(screen.getByRole("img", { name: "Reserva de emergência" })).toBeTruthy();
    expect(screen.queryByText("Reserva de emergência", { selector: ".badge" })).toBeNull();
    expect(screen.queryByText("Objetivo livre")).toBeNull();
    // CR-11: value and target on two deliberate lines.
    expect(document.querySelector(".goal-amounts p")!.textContent).toMatch(/^de R\$\s30\.000,00$/);
  });
});
