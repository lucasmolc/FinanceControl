// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../api/client";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { HistoryDialog } from "./HistoryDialog";
import { bankDelta, bankStatementRows, goalEntryRows, investmentDelta, investmentEntryRows, type HistoryRow } from "./historyRows";

vi.mock("../../api/client", async importOriginal => ({
  ...await importOriginal<typeof import("../../api/client")>(),
  api: { removeGoalEntry: vi.fn(), removeInvestmentEntry: vi.fn(), removeBankEntry: vi.fn(), restoreGoalEntry: vi.fn(), restoreInvestmentEntry: vi.fn(), restoreBankEntry: vi.fn() },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("historyRows", () => {
  it("maps goal entries to reversible rows", () => {
    const [row] = goalEntryRows(5, [{ id: 9, goal_id: 5, date: "2026-09-10", amount_cents: 20_000, notes: "13º" }]);
    expect(row).toMatchObject({ kindLabel: "Aporte", deltaCents: 20_000, notes: "13º" });
    void row!.reverse!();
    expect(api.removeGoalEntry).toHaveBeenCalledWith(5, 9);
    void row!.restore!();
    expect(api.restoreGoalEntry).toHaveBeenCalledWith(5, 9);
  });

  it("derives investment deltas by kind; adjustments show the new value", () => {
    expect(investmentDelta("deposit", 100)).toBe(100);
    expect(investmentDelta("yield", 100)).toBe(100);
    expect(investmentDelta("withdrawal", 100)).toBe(-100);
    expect(investmentDelta("adjustment", 100)).toBeNull();
    const [row] = investmentEntryRows(2, [{ id: 3, investment_id: 2, date: "2026-09-01", kind: "withdrawal", amount_cents: 500, notes: null }]);
    expect(row).toMatchObject({ kindLabel: "Resgate", deltaCents: -500 });
  });

  it("builds bank statement rows: entries reversible, transactions removable", () => {
    expect(bankDelta({ source: "entry", kind: "transfer_out", amount_cents: 300, delta_cents: null })).toBe(-300);
    expect(bankDelta({ source: "entry", kind: "adjustment", amount_cents: 300, delta_cents: null })).toBeNull();
    expect(bankDelta({ source: "transaction", kind: "income", amount_cents: 300, delta_cents: null })).toBe(300);
    expect(bankDelta({ source: "entry", kind: "adjustment", amount_cents: 300, delta_cents: -50 })).toBe(-50);
    const onRemove = vi.fn();
    const rows = bankStatementRows(1, [
      { id: 7, source: "entry", date: "2026-09-02", description: "Transferência enviada", kind: "transfer_out", amount_cents: 1_000, delta_cents: -1_000, related_account_id: 2, related_account_name: "Poupança", notes: null },
      { id: 8, source: "transaction", date: "2026-09-05", description: "Mercado", kind: "expense", amount_cents: 2_000, delta_cents: -2_000, related_account_id: null, related_account_name: null, notes: null },
    ], onRemove);
    expect(rows[0]).toMatchObject({ kindLabel: "Transferência enviada", detail: "Para Poupança", deltaCents: -1_000 });
    expect(rows[0]!.action).toBeUndefined();
    expect(rows[1]).toMatchObject({ kindLabel: "Despesa", description: "Mercado" });
    expect(rows[1]!.reverse).toBeUndefined();
    rows[1]!.action!.run();
    expect(onRemove).toHaveBeenCalledWith(8, "Mercado");
    void rows[0]!.reverse!();
    expect(api.removeBankEntry).toHaveBeenCalledWith(1, 7);
    void rows[0]!.restore!();
    expect(api.restoreBankEntry).toHaveBeenCalledWith(1, 7);
    expect(rows[1]!.restore).toBeUndefined();
  });
});

function renderDialog(rows: HistoryRow[], overrides: Partial<Parameters<typeof HistoryDialog>[0]> = {}) {
  const props = {
    title: "Histórico · Reserva", rows, loading: false, error: null, onRetry: vi.fn(),
    emptyTitle: "Nenhum aporte registrado", emptyDescription: "Os aportes aparecem aqui.",
    onClose: vi.fn(), refresh: vi.fn(async () => undefined), notify: vi.fn(), ...overrides,
  };
  render(<ConfirmProvider><div className="shell" /><HistoryDialog {...props} /></ConfirmProvider>);
  return props;
}

/** CR-20: row actions live in the "…" menu of each line. */
function chooseAction(row: string, item: RegExp | string) {
  fireEvent.click(screen.getByRole("button", { name: `Mais ações para ${row}` }));
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
}

const goalRows = () => goalEntryRows(5, [{ id: 9, goal_id: 5, date: "2026-09-10", amount_cents: 20_000, notes: null }]);

describe("HistoryDialog", () => {
  it("renders rows with dd/mm/aaaa dates, labels and signed amounts outside the inert shell", () => {
    renderDialog(goalRows());
    const dialog = screen.getByRole("dialog", { name: "Histórico · Reserva" });
    expect(within(dialog).getByText("10/09/2026")).toBeTruthy();
    expect(within(dialog).getByText("Aporte")).toBeTruthy();
    expect(within(dialog).getByText("+R$ 200,00", { normalizer: text => text })).toBeTruthy();
    expect(dialog.closest(".shell")).toBeNull();
  });

  it("confirms, reverses, refreshes and notifies", async () => {
    vi.mocked(api.removeGoalEntry).mockResolvedValue(undefined);
    const props = renderDialog(goalRows());
    chooseAction("aporte de 10/09/2026", /^Estornar/);
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Estornar" }));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith("Movimentação estornada.", expect.objectContaining({ label: "Desfazer" })));
    expect(api.removeGoalEntry).toHaveBeenCalledWith(5, 9);
    expect(props.refresh).toHaveBeenCalled();
  });

  it("MEL-13 · \"Desfazer\" restaura a movimentação estornada e atualiza o histórico", async () => {
    vi.mocked(api.removeGoalEntry).mockResolvedValue(undefined);
    vi.mocked(api.restoreGoalEntry).mockResolvedValue({ ok: true });
    const props = renderDialog(goalRows());
    chooseAction("aporte de 10/09/2026", /^Estornar/);
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/Você poderá desfazer o estorno em seguida/)).toBeTruthy();
    fireEvent.click(within(confirm).getByRole("button", { name: "Estornar" }));
    await waitFor(() => expect(props.notify).toHaveBeenCalledTimes(1));

    const action = vi.mocked(props.notify).mock.calls[0]![1]!;
    await action.run();
    expect(api.restoreGoalEntry).toHaveBeenCalledWith(5, 9);
    expect(props.refresh).toHaveBeenCalledTimes(2);
    expect(props.notify).toHaveBeenLastCalledWith("Estorno desfeito.");
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const props = renderDialog(goalRows());
    chooseAction("aporte de 10/09/2026", /^Estornar/);
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.removeGoalEntry).not.toHaveBeenCalled();
    expect(props.notify).not.toHaveBeenCalled();
  });

  it("shows the server message when the movement cannot be reversed", async () => {
    const message = "Esta movimentação foi registrada antes do histórico detalhado e não pode ser estornada.";
    vi.mocked(api.removeGoalEntry).mockRejectedValue(new ApiError(message, 400, { entry: message }));
    const props = renderDialog(goalRows());
    chooseAction("aporte de 10/09/2026", /^Estornar/);
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Estornar" }));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(props.refresh).not.toHaveBeenCalled();
    expect(props.notify).not.toHaveBeenCalled();
  });

  it("CR-20 · agrupa por mês, mostra o saldo após cada movimento e a descrição antes do tipo", () => {
    const rows = [
      { key: "a", date: "2026-09-12", kindLabel: "Saída", description: "Aluguel", deltaCents: -150_000, amountCents: 150_000, detail: null, notes: null },
      { key: "b", date: "2026-09-02", kindLabel: "Entrada", description: "Salário", deltaCents: 500_000, amountCents: 500_000, detail: null, notes: null },
      { key: "c", date: "2026-08-20", kindLabel: "Ajuste de saldo", description: null, deltaCents: null, amountCents: 100_000, detail: null, notes: null },
      { key: "d", date: "2026-08-01", kindLabel: "Entrada", description: "Pix", deltaCents: 5_000, amountCents: 5_000, detail: null, notes: null },
    ];
    renderDialog(rows, { balanceCents: 450_000 });
    const table = within(screen.getByRole("dialog")).getByRole("table");
    const headers = within(table).getAllByRole("rowheader").map(header => header.textContent);
    expect(headers).toEqual(["Setembro de 20262 movimentações", "Agosto de 20262 movimentações"]);
    expect(within(table).getByRole("columnheader", { name: "Saldo após" })).toBeTruthy();
    const line = (text: string) => within(table).getByText(text).closest("tr")!;
    expect(line("Aluguel").textContent).toMatch(/R\$\s4\.500,00$/);
    expect(line("Salário").textContent).toMatch(/R\$\s6\.000,00$/);
    expect(line("Salário").textContent).toContain("Entrada");
    expect(line("Ajuste de saldo").textContent).toMatch(/R\$\s1\.000,00$/);
    expect(line("Pix").textContent).toContain("—");
  });

  it("shows loading, empty and error states", () => {
    renderDialog([], { loading: true });
    expect(screen.getByRole("status").textContent).toContain("Carregando histórico");
    cleanup();
    renderDialog([]);
    expect(screen.getByText("Nenhum aporte registrado")).toBeTruthy();
    cleanup();
    const props = renderDialog([], { error: "Falha ao carregar os dados." });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(props.onRetry).toHaveBeenCalled();
  });
});

describe("MEL-14 · histórico paginado", () => {
  const manyRows = (count: number) => goalEntryRows(5, Array.from({ length: count }, (_, index) => ({ id: index + 1, goal_id: 5, date: "2026-09-10", amount_cents: 100, notes: null })));

  it("mostra \"Mostrando N de T\" e \"Carregar mais\" enquanto houver mais linhas", () => {
    const onLoadMore = vi.fn();
    renderDialog(manyRows(50), { total: 120, hasMore: true, onLoadMore });
    expect(screen.getByText("Mostrando 50 de 120")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("indica o carregamento e esconde o botão quando tudo foi carregado", () => {
    renderDialog(manyRows(50), { total: 120, hasMore: true, loadingMore: true, onLoadMore: vi.fn() });
    expect((screen.getByRole("button", { name: "Carregando…" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderDialog(manyRows(120), { total: 120, hasMore: false, onLoadMore: vi.fn() });
    expect(screen.getByText("Mostrando 120 de 120")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    cleanup();
    renderDialog(manyRows(3), { total: 3, hasMore: false });
    expect(screen.queryByText(/Mostrando/)).toBeNull();
  });
});
