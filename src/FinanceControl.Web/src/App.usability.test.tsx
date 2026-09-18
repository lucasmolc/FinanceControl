// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { App } from "./App";
import { api, ApiError } from "./api/client";
import { currentMonth, todayISO } from "./lib/date";
import { emptyState } from "./test/fixtures";
import type { FinanceState, Subscription, Transaction } from "./types";
import { optionLabels, pick } from "./test/formControls";

vi.mock("./api/client", async importOriginal => {
  const original = await importOriginal<typeof import("./api/client")>();
  return {
    ...original,
    api: {
      ...original.api,
      // R1 decision 4: the offline banner confirms failed requests with /api/health (up in these tests).
      health: vi.fn(async () => ({ status: "ok" })),
      state: vi.fn(), checklist: vi.fn(), summary: vi.fn(), transactions: vi.fn(), about: vi.fn(),
      remove: vi.fn(), restore: vi.fn(), settings: vi.fn(),
      chargeSubscription: vi.fn(), undoSubscriptionCharge: vi.fn(), reassignCategory: vi.fn(), reassignCard: vi.fn(),
      categoryLinks: vi.fn(), cardLinks: vi.fn(), cardInvoices: vi.fn(), closings: vi.fn(), closeMonth: vi.fn(), reopenMonth: vi.fn(), setup: vi.fn(),
      goalEntriesPage: vi.fn(), removeGoalEntry: vi.fn(), restoreGoalEntry: vi.fn(),
    },
  };
});

const streaming: Subscription = { id: 8, name: "Streaming", amount_cents: 5_990, billing_day: 10, category_id: 1, category_name: "Mercado", card_id: 7, card_name: "Visa", frequency: "monthly", next_billing_date: null, active: true, last_charge_date: null };

const state: FinanceState = {
  ...emptyState,
  categories: [
    { id: 1, name: "Mercado", kind: "expense", monthly_budget_cents: 0, active: true },
    { id: 2, name: "Feira", kind: "expense", monthly_budget_cents: 0, active: true },
    { id: 3, name: "Salário", kind: "income", monthly_budget_cents: 0, active: true },
  ],
  transactions: [{ id: 1, date: "2026-09-02", description: "Compra", category_id: 1, category_name: "Mercado", kind: "expense", amount_cents: 1_000, payment_method: "pix", account_id: null, account_name: null } as Transaction],
  cards: [
    { id: 7, name: "Visa", closing_day: 1, due_day: 8, real_limit_cents: 0, personal_limit_cents: 0, active: true },
    { id: 9, name: "Master", closing_day: 1, due_day: 8, real_limit_cents: 0, personal_limit_cents: 0, active: true },
  ],
  goals: [{ id: 4, name: "Viagem", type: "travel", target_cents: 500_000, current_cents: 100_000, target_date: null, currency: "BRL", active: true }],
  subscriptions: [streaming],
};

const summary = { month: "2026-09", income_cents: 0, expense_cents: 0, investment_cents: 0, transactions_count: 0, uncategorized_expense_cents: 0, categories: [], bills: { total_count: 0, paid_count: 0, total_cents: 0, paid_cents: 0 } };

const go = (hash: string) => act(() => { window.location.hash = hash; });

beforeEach(() => {
  window.location.hash = "";
  vi.mocked(api.state).mockResolvedValue(state);
  vi.mocked(api.checklist).mockResolvedValue([]);
  vi.mocked(api.summary).mockResolvedValue(summary);
  vi.mocked(api.transactions).mockResolvedValue([]);
  vi.mocked(api.about).mockResolvedValue({ database_path: "C:/dados/finance.db", schema_version: "005" });
  vi.mocked(api.remove).mockResolvedValue(undefined);
  vi.mocked(api.restore).mockResolvedValue({ ok: true });
  vi.mocked(api.reassignCategory).mockResolvedValue({ ok: true, updated: { transactions: 1 } });
  vi.mocked(api.reassignCard).mockResolvedValue({ ok: true, updated: { subscriptions: 1 } });
  // MEL-41: exact counts from the links endpoints (Mercado: 1 transaction, 0 bills, 1 subscription; Visa: 1 subscription).
  vi.mocked(api.categoryLinks).mockImplementation(async id => id === 1 ? { transactions: 1, bills: 0, subscriptions: 1 } : { transactions: 0, bills: 0, subscriptions: 0 });
  vi.mocked(api.cardLinks).mockImplementation(async id => id === 7 ? { transactions: 0, subscriptions: 1 } : { transactions: 0, subscriptions: 0 });
  vi.mocked(api.cardInvoices).mockResolvedValue([]);
  vi.mocked(api.closings).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MEL-05 · cobrança de assinatura", () => {
  it("lança a cobrança pela linha, mostra o selo do mês e permite desfazer", async () => {
    const today = todayISO();
    vi.mocked(api.chargeSubscription).mockResolvedValue({ ok: true, transaction_id: 50, charge_date: today });
    vi.mocked(api.undoSubscriptionCharge).mockResolvedValue(undefined);
    go("#/assinaturas");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Lançar cobrança de Streaming" }));
    const dialog = screen.getByRole("dialog", { name: "Lançar cobrança · Streaming" });
    vi.mocked(api.state).mockResolvedValue({ ...state, subscriptions: [{ ...streaming, last_charge_date: today }] });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lançar cobrança" }));

    await waitFor(() => expect(api.chargeSubscription).toHaveBeenCalledWith(8, expect.objectContaining({ date: today, amount_cents: 5_990, payment_method: "card", account_id: null })));
    expect(await screen.findByText("Cobrança lançada.")).toBeTruthy();
    expect(screen.getByText(`Cobrada em ${today.slice(8, 10)}/${today.slice(5, 7)}`)).toBeTruthy();

    vi.mocked(api.state).mockResolvedValue(state);
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(api.undoSubscriptionCharge).toHaveBeenCalledWith(8, today));
    expect(await screen.findByText("Cobrança desfeita.")).toBeTruthy();
    expect(screen.queryByText(/Cobrada em/)).toBeNull();
  });
});

describe("MEL-09 · remover categoria ou cartão com vínculos", () => {
  it("mostra os vínculos, move para outra categoria e desfaz sem voltar os vínculos", async () => {
    go("#/categorias");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Remover Mercado" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Remover \"Mercado\"?" });
    expect(within(dialog).getByText("Usada em 1 lançamento, 0 contas e 1 assinatura.")).toBeTruthy();
    expect(within(dialog).getByLabelText("Mover vínculos para").textContent).toBe("Não mover (manter vínculos)");
    expect(optionLabels(dialog, "Mover vínculos para")).toEqual(["Não mover (manter vínculos)", "Sem categoria", "Feira"]);
    pick(dialog, "Mover vínculos para", "Feira");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover" }));

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("categories", 1));
    expect(api.reassignCategory).toHaveBeenCalledWith(1, 2);
    expect(vi.mocked(api.reassignCategory).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(api.remove).mock.invocationCallOrder[0]!);
    expect(await screen.findByText("\"Mercado\" foi removido. Vínculos movidos para Feira.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith("categories", 1));
    expect(await screen.findByText("Remoção desfeita. Os vínculos movidos continuam em Feira.")).toBeTruthy();
  });

  it("remove cartão movendo as assinaturas para \"Sem cartão\"", async () => {
    go("#/cartoes");
    render(<App />);
    // CR-21: card actions live in the card menu.
    fireEvent.click(await screen.findByRole("button", { name: "Mais ações para Visa" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Usado em 1 assinatura.")).toBeTruthy();
    pick(dialog, "Mover vínculos para", "Sem cartão");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(api.reassignCard).toHaveBeenCalledWith(7, null));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("cards", 7));
  });

  it("mantém os vínculos quando nada é escolhido e usa a confirmação simples sem vínculos", async () => {
    go("#/categorias");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Remover Mercado" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("categories", 1));
    expect(api.reassignCategory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remover Salário" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remover \"Salário\"?" });
    expect(within(dialog).queryByLabelText("Mover vínculos para")).toBeNull();
  });
});

describe("MEL-07 · remoção em andamento", () => {
  it("desabilita o item com \"Removendo…\" até concluir", async () => {
    let finish: () => void = () => undefined;
    vi.mocked(api.remove).mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    go("#/metas");
    render(<App />);
    // CR-19: goal actions live in the goal menu.
    fireEvent.click(await screen.findByRole("button", { name: "Mais ações para Viagem" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remover" }));

    const status = await screen.findByText("Removendo…");
    const card = status.closest("article")!;
    expect(card.getAttribute("aria-busy")).toBe("true");
    expect(card.className).toContain("is-removing");
    expect(within(card).queryByRole("button", { name: "Remover Viagem" })).toBeNull();
    expect((within(card).getByRole("button", { name: "Registrar aporte" }) as HTMLButtonElement).disabled).toBe(true);

    vi.mocked(api.state).mockResolvedValue({ ...state, goals: [] });
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByText("Removendo…")).toBeNull());
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  });
});

describe("MEL-10 · alterações não salvas", () => {
  it("pergunta antes de sair pela navegação e mantém a página ao continuar editando", async () => {
    go("#/configuracoes");
    render(<App />);
    fireEvent.change(await screen.findByRole("textbox", { name: "Nome (opcional)" }), { target: { value: "Lucas" } });
    const sidebar = screen.getByRole("navigation", { name: "Navegação principal" });

    fireEvent.click(within(sidebar).getByRole("link", { name: "Metas" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Descartar alterações não salvas?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar editando" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(window.location.hash).toBe("#/configuracoes");
    expect((screen.getByRole("textbox", { name: "Nome (opcional)" }) as HTMLInputElement).value).toBe("Lucas");

    fireEvent.click(within(sidebar).getByRole("link", { name: "Metas" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(window.location.hash).toBe("#/metas"));
    expect(await screen.findByRole("heading", { level: 1, name: "Metas" })).toBeTruthy();
  });

  it("reverte a troca de hash (voltar/avançar) quando o usuário cancela", async () => {
    go("#/configuracoes");
    render(<App />);
    fireEvent.change(await screen.findByRole("textbox", { name: "Nome (opcional)" }), { target: { value: "Lucas" } });

    go("#/metas");
    const dialog = await screen.findByRole("alertdialog", { name: "Descartar alterações não salvas?" });
    expect(window.location.hash).toBe("#/configuracoes");
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar editando" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(window.location.hash).toBe("#/configuracoes");
    expect(screen.getByRole("heading", { level: 1, name: "Configurações" })).toBeTruthy();

    go("#/metas");
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Descartar" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Metas" })).toBeTruthy();
    expect(window.location.hash).toBe("#/metas");
  });

  it("navega sem perguntar quando não há alterações", async () => {
    go("#/configuracoes");
    render(<App />);
    await screen.findByRole("textbox", { name: "Nome (opcional)" });
    fireEvent.click(within(screen.getByRole("navigation", { name: "Navegação principal" })).getByRole("link", { name: "Metas" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Metas" })).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("MEL-41 · contagem exata de vínculos", () => {
  it("usa as contagens do endpoint, além dos lançamentos carregados", async () => {
    vi.mocked(api.categoryLinks).mockResolvedValue({ transactions: 312, bills: 2, subscriptions: 1 });
    go("#/categorias");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Remover Feira" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remover \"Feira\"?" });
    expect(within(dialog).getByText("Usada em 312 lançamentos, 2 contas e 1 assinatura.")).toBeTruthy();
    expect(api.categoryLinks).toHaveBeenCalledWith(2);
  });

  it("conta lançamentos e assinaturas do cartão", async () => {
    vi.mocked(api.cardLinks).mockResolvedValue({ transactions: 4, subscriptions: 0 });
    go("#/cartoes");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Mais ações para Master" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Usado em 4 lançamentos.")).toBeTruthy();
    expect(api.cardLinks).toHaveBeenCalledWith(9);
  });

  it("volta às contagens do estado quando o endpoint falha", async () => {
    vi.mocked(api.categoryLinks).mockRejectedValue(new ApiError("Registro não encontrado.", 404));
    go("#/categorias");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Remover Mercado" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Usada em 1 lançamento, 0 contas e 1 assinatura.")).toBeTruthy();
  });
});

describe("MEL-22 · fechamento mensal", () => {
  const month = currentMonth();
  const openSummary = { ...summary, month, income_cents: 500_000, expense_cents: 120_000, investment_cents: 30_000 };
  const closedSummary = { ...openSummary, closed: true, closed_at: `${month}-28T10:00:00` };
  const monthTx = { ...state.transactions[0]!, date: `${month}-02` } as Transaction;

  it("não sugere fechar o mês corrente no meio do mês (CR-29)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 10, 12));
    try {
      vi.mocked(api.summary).mockResolvedValue(openSummary);
      render(<App />);
      await screen.findByRole("heading", { level: 1 });
      await waitFor(() => expect(api.summary).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: "Fechar mês" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fecha o mês pelo Painel com o resumo e as observações", async () => {
    // CR-29: the Painel suggests closing the current month only in its last days.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12));
    onTestFinished(() => { vi.useRealTimers(); });
    vi.mocked(api.summary).mockResolvedValue(openSummary);
    vi.mocked(api.closeMonth).mockResolvedValue({ ok: true, month, closed_at: `${month}-28T10:00:00` });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Fechar mês" }));
    const dialog = await screen.findByRole("dialog", { name: /^Fechar / });
    expect(within(dialog).getByText("+R$ 3.500,00", { normalizer: text => text.replace(/\s/g, " ") })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Observações do fechamento (opcional)"), { target: { value: "Ok" } });
    vi.mocked(api.summary).mockResolvedValue(closedSummary);
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar mês" }));
    await waitFor(() => expect(api.closeMonth).toHaveBeenCalledWith(month, "Ok"));
    expect(await screen.findByText(/foi fechado\.$/)).toBeTruthy();
    expect(screen.getByText("Mês fechado", { selector: ".topbar-actions .badge" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reabrir mês" })).toBeTruthy();
  });

  it("bloqueia lançamentos do mês fechado e reabre com confirmação", async () => {
    vi.mocked(api.summary).mockResolvedValue(closedSummary);
    vi.mocked(api.transactions).mockResolvedValue([monthTx]);
    vi.mocked(api.reopenMonth).mockResolvedValue({ ok: true });
    go("#/lancamentos");
    render(<App />);
    const edit = await screen.findByRole("button", { name: "Editar Compra" });
    expect((edit as HTMLButtonElement).disabled).toBe(true);
    expect(edit.getAttribute("title")).toBe("Mês fechado");
    expect((screen.getByRole("button", { name: "Remover Compra" }) as HTMLButtonElement).disabled).toBe(true);
    // The page's own button (the global quick-add in the shell stays available: R1-SH-4).
    const add = within(document.querySelector<HTMLElement>(".page-content")!).getAllByRole("button", { name: "Novo lançamento" })[0] as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByText(/Fechado em 28\//)).toBeTruthy();

    vi.mocked(api.summary).mockResolvedValue(openSummary);
    fireEvent.click(screen.getByRole("button", { name: "Reabrir mês" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reabrir mês" }));
    await waitFor(() => expect(api.reopenMonth).toHaveBeenCalledWith(month));
    expect(await screen.findByText(/foi reaberto\.$/)).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "Editar Compra" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText("Mês fechado", { selector: ".badge" })).toBeNull();
  });

  it("desabilita marcar contas como pagas no Painel quando o mês está fechado", async () => {
    vi.mocked(api.summary).mockResolvedValue(closedSummary);
    vi.mocked(api.checklist).mockResolvedValue([{ id: 1, name: "Luz", amount_cents: 12_000, due_day: 10, category_id: null, recurring: true, active: true, paid: false, paid_at: null, transaction_id: null }]);
    render(<App />);
    const toggle = await screen.findByRole("button", { name: /Luz/, pressed: false });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Pagar Luz com detalhes" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Mês fechado: reabra o mês/)).toBeTruthy();
  });

  it("lista os fechamentos em Configurações e reabre por lá", async () => {
    vi.mocked(api.closings).mockResolvedValue([{ month: "2026-07", closed_at: "2026-08-02T09:00:00", notes: "Conferido", summary: { ...summary, month: "2026-07", income_cents: 100_000, expense_cents: 40_000 } }]);
    vi.mocked(api.reopenMonth).mockResolvedValue({ ok: true });
    go("#/configuracoes");
    render(<App />);
    const list = await screen.findByRole("list", { name: "Meses fechados" });
    expect(within(list).getByText("Julho de 2026")).toBeTruthy();
    expect(within(list).getByText("Fechado em 02/08/2026 · Conferido")).toBeTruthy();
    vi.mocked(api.closings).mockResolvedValue([]);
    fireEvent.click(within(list).getByRole("button", { name: "Reabrir julho de 2026" }));
    fireEvent.click(within(await screen.findByRole("alertdialog", { name: "Reabrir julho de 2026?" })).getByRole("button", { name: "Reabrir mês" }));
    await waitFor(() => expect(api.reopenMonth).toHaveBeenCalledWith("2026-07"));
    expect(await screen.findByText("Nenhum mês fechado ainda. Feche um mês pelo Painel ou por Lançamentos.")).toBeTruthy();
  });
});

describe("MEL-25 · Ajuda em Configurações", () => {
  it("\"Rever tour guiado\" leva ao Painel e inicia o tour", async () => {
    go("#/configuracoes");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Rever tour guiado" }));
    await waitFor(() => expect(window.location.hash).toBe("#/painel"));
    expect(await screen.findByText(/^Etapa 1 de \d+$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pular tour" }));
    await waitFor(() => expect(api.settings).toHaveBeenCalledWith({ tour_completed: true }));
  });

  it("\"Revisar planejamento inicial\" abre o assistente em modo de revisão", async () => {
    vi.mocked(api.settings).mockResolvedValue({ ok: true });
    go("#/configuracoes");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Revisar planejamento inicial" }));
    const dialog = await screen.findByRole("dialog", { name: "Revise seu planejamento" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Revise seu planejamento" })).toBeNull());
    expect(api.setup).not.toHaveBeenCalled();
  });
});

describe("MEL-13 · desfazer estorno pelo aviso", () => {
  it("o aviso de estorno oferece Desfazer e falhas aparecem no banner de erro", async () => {
    const goal = state.goals[0]!;
    const entries = { items: [{ id: 9, goal_id: goal.id, date: "2026-09-10", amount_cents: 20_000, notes: null }], total: 1 };
    vi.mocked(api.goalEntriesPage).mockResolvedValue(entries);
    vi.mocked(api.removeGoalEntry).mockResolvedValue(undefined);
    vi.mocked(api.restoreGoalEntry).mockRejectedValue(new ApiError("O mês 09/2026 está fechado. Reabra-o para alterar.", 400, { date: "O mês 09/2026 está fechado. Reabra-o para alterar." }));
    go("#/metas");
    render(<App />);
    // CR-19/CR-20: "Histórico" and "Estornar" live in the goal and line menus.
    fireEvent.click(await screen.findByRole("button", { name: "Mais ações para Viagem" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Histórico" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mais ações para aporte de 10/09/2026" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Estornar/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Estornar" }));
    expect(await screen.findByText("Movimentação estornada.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(api.restoreGoalEntry).toHaveBeenCalledWith(goal.id, 9));
    expect((await screen.findByRole("alert")).textContent).toContain("O mês 09/2026 está fechado. Reabra-o para alterar.");
  });
});
