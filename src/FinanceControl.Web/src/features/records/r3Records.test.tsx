// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, NETWORK_ERROR_MESSAGE } from "../../api/client";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { emptyState, makePageProps } from "../../test/fixtures";
import type { Bill, MonthlySummary, Transaction } from "../../types";
import { BillsPage } from "../planning/PlanningPages";
import { TransactionsPage } from "../transactions/TransactionsPage";
import { unlinkedBillsUntil } from "../wealth/accountProjection";
import { benchmarkFallback } from "../wealth/conversion";
import { firstOpenDay } from "./formUtils";
import { OFFLINE_REASON } from "./offline";
import { RecordModal } from "./RecordModal";

vi.mock("../../api/client", async importOriginal => {
  const original = await importOriginal<typeof import("../../api/client")>();
  return { ...original, api: { ...original.api, transactions: vi.fn(), closings: vi.fn(), reopenMonth: vi.fn(), create: vi.fn(), cardInvoicesDue: vi.fn() } };
});

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 18, 12)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const summary = (over: Partial<MonthlySummary> = {}): MonthlySummary => ({
  month: "2026-09", income_cents: 0, expense_cents: 0, investment_cents: 0, transactions_count: 0, uncategorized_expense_cents: 0, categories: [],
  bills: { total_count: 0, paid_count: 0, total_cents: 0, paid_cents: 0 }, closed: false, ...over,
});

describe("R3-LANC-1/2 · Lançamentos sem servidor", () => {
  it("não mostra R$ 0,00 nem um segundo aviso com retry, e desabilita Fechar mês", async () => {
    vi.mocked(api.transactions).mockRejectedValue(new Error(NETWORK_ERROR_MESSAGE));
    render(<ConfirmProvider><TransactionsPage {...makePageProps({ offline: true, summary: summary(), onCloseMonth: vi.fn() })} /></ConfirmProvider>);
    expect(await screen.findByText(/Sem dados enquanto o servidor estiver fora/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    const kpis = document.querySelector(".stat-strip")!;
    expect(kpis.textContent).not.toMatch(/R\$/);
    expect(screen.getAllByLabelText("indisponível")).toHaveLength(4);
    const close = screen.getByRole("button", { name: "Fechar mês" }) as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    expect(close.title).toBe(OFFLINE_REASON);
  });

  it("uma falha que não é de conexão mantém o aviso com Tentar novamente", async () => {
    vi.mocked(api.transactions).mockRejectedValue(new Error("Servidor indisponível."));
    render(<ConfirmProvider><TransactionsPage {...makePageProps()} /></ConfirmProvider>);
    expect((await screen.findByRole("alert")).textContent).toContain("Servidor indisponível.");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
    expect(screen.getAllByLabelText("indisponível")).toHaveLength(4);
  });

  it("o título diz quantos lançamentos há no mês", async () => {
    vi.mocked(api.transactions).mockResolvedValue([{ id: 1, date: "2026-09-10", description: "Mercado", kind: "expense", amount_cents: 5000, category_id: null, category_name: null, payment_method: "pix", account_id: null, account_name: null } as Transaction]);
    render(<ConfirmProvider><TransactionsPage {...makePageProps()} /></ConfirmProvider>);
    expect(await screen.findByRole("heading", { name: "1 lançamento em setembro de 2026" })).toBeTruthy();
  });
});

describe("R3-CONTAS-1 · contas sem conta vinculada", () => {
  it("entram no consolidado quando não pagas", () => {
    const bills = [
      { id: 1, name: "Condomínio", amount_cents: 65_000, due_day: 10, category_id: null, recurring: true, active: true, account_id: null },
      { id: 2, name: "Aluguel", amount_cents: 200_000, due_day: 5, category_id: null, recurring: true, active: true, account_id: 3 },
      { id: 3, name: "Internet", amount_cents: 19_900, due_day: 25, category_id: null, recurring: true, active: true },
    ] as Bill[];
    const checklist = [{ id: 1, paid: false }, { id: 2, paid: false }, { id: 3, paid: true }] as never;
    const rows = unlinkedBillsUntil(bills, [{ id: 3 }], checklist, "2026-09", "2026-09-18");
    expect(rows.map(row => [row.name, row.overdue])).toEqual([["Condomínio", true]]);
  });
});

describe("R3-INV-1 · referência que não é taxa", () => {
  it("dá uma linha para índices como o S&P 500 e nada para taxas", () => {
    expect(benchmarkFallback("S&P 500")?.text).toBe("Segue o índice S&P 500 · sem rendimento garantido");
    expect(benchmarkFallback("110% do CDI")).toBeNull();
    expect(benchmarkFallback("")).toBeNull();
  });
});

describe("R3-REC-1 · descartar o que foi digitado", () => {
  it("pergunta antes de fechar com dados e fecha direto sem eles", async () => {
    vi.mocked(api.closings).mockResolvedValue([]);
    const onClose = vi.fn();
    render(<ConfirmProvider><RecordModal kind="category" mode="create" initial={{}} state={emptyState} month="2026-09" onClose={onClose} onSaved={vi.fn()} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledOnce();
    onClose.mockClear();

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Pets" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByRole("alertdialog", { name: "Descartar o que foi preenchido?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Pets");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});

describe("R3-REC-2 · data em mês fechado", () => {
  it("avisa antes de salvar e oferece usar outra data ou reabrir o mês", async () => {
    vi.mocked(api.closings).mockResolvedValue([{ month: "2026-09" }] as never);
    const onReopenMonth = vi.fn(async () => true);
    render(<ConfirmProvider><RecordModal kind="transaction" mode="create" initial={{}} state={emptyState} month="2026-09" onClose={vi.fn()} onSaved={vi.fn()} onReopenMonth={onReopenMonth} /></ConfirmProvider>);
    expect(await screen.findByText(/O mês 09\/2026 está fechado/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Usar 01/10/2026" }));
    await waitFor(() => expect(screen.queryByText(/O mês 09\/2026 está fechado/)).toBeNull());
    expect(screen.queryByRole("button", { name: "Reabrir setembro" })).toBeNull();
  });

  it("reabrir o mês mantém a data escolhida", async () => {
    vi.mocked(api.closings).mockResolvedValue([{ month: "2026-09" }] as never);
    const onReopenMonth = vi.fn(async () => true);
    render(<ConfirmProvider><RecordModal kind="transaction" mode="create" initial={{}} state={emptyState} month="2026-09" onClose={vi.fn()} onSaved={vi.fn()} onReopenMonth={onReopenMonth} /></ConfirmProvider>);
    const reopen = await screen.findByRole("button", { name: "Reabrir setembro" });
    await act(async () => { fireEvent.click(reopen); });
    expect(onReopenMonth).toHaveBeenCalledWith("2026-09");
    await waitFor(() => expect(screen.queryByText(/O mês 09\/2026 está fechado/)).toBeNull());
  });

  it("primeiro dia aberto: hoje quando o mês de hoje está aberto", () => {
    expect(firstOpenDay("2026-08-10", ["2026-08"], "2026-09-18")).toBe("2026-09-18");
    expect(firstOpenDay("2026-09-18", ["2026-09", "2026-10"], "2026-09-18")).toBe("2026-11-01");
  });
});

describe("R3-BILLS-1 · Contas a pagar sem as faturas", () => {
  it("marca os totais e diz no lugar das faturas quando elas voltam, sem retry", async () => {
    vi.mocked(api.cardInvoicesDue).mockRejectedValue(new Error(NETWORK_ERROR_MESSAGE));
    const state = {
      ...emptyState,
      bills: [{ id: 1, name: "Internet", amount_cents: 19_900, due_day: 25, category_id: null, recurring: true, active: true }] as Bill[],
      cards: [{ id: 9, name: "Visa", closing_day: 25, due_day: 5, real_limit_cents: 0, personal_limit_cents: 0, active: true }],
    };
    render(<ConfirmProvider><BillsPage {...makePageProps({ state, offline: true, checklist: [{ id: 1, paid: false }] as never })} /></ConfirmProvider>);
    expect(await screen.findByText(/As faturas de cartão aparecem quando ele voltar/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    expect(screen.getAllByText("sem as faturas de cartão").length).toBeGreaterThan(0);
    expect(screen.getByText(/Vence em 25\/09 \(7 dias\)/)).toBeTruthy();
  });
});
