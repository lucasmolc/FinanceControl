// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { api } from "./api/client";
import { emptyState } from "./test/fixtures";
import type { FinanceState } from "./types";

vi.mock("./api/client", async importOriginal => {
  const original = await importOriginal<typeof import("./api/client")>();
  return {
    ...original,
    api: {
      ...original.api,
      // R1 decision 4: the offline banner confirms failed requests with /api/health (up in these tests).
      health: vi.fn(async () => ({ status: "ok" })),
      state: vi.fn(), checklist: vi.fn(), summary: vi.fn(), transactions: vi.fn(),
      remove: vi.fn(), restore: vi.fn(), setChecklist: vi.fn(), settings: vi.fn(),
    },
  };
});

const state: FinanceState = {
  ...emptyState,
  goals: [{ id: 4, name: "Viagem", type: "travel", target_cents: 500000, current_cents: 100000, target_date: null, currency: "BRL", active: true }],
};

beforeEach(() => {
  window.location.hash = "";
  vi.mocked(api.state).mockResolvedValue(state);
  vi.mocked(api.checklist).mockResolvedValue([]);
  vi.mocked(api.summary).mockResolvedValue({ month: "2026-09", income_cents: 0, expense_cents: 0, investment_cents: 0, transactions_count: 0, uncategorized_expense_cents: 0, categories: [], bills: { total_count: 0, paid_count: 0, total_cents: 0, paid_cents: 0 } });
  vi.mocked(api.transactions).mockResolvedValue([]);
  vi.mocked(api.remove).mockResolvedValue(undefined);
  vi.mocked(api.restore).mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("aplicação", () => {
  it("abre o painel por padrão e navega pela URL", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "Olá!" })).toBeTruthy();
    expect(document.title).toBe("Visão geral · LMM Finance Control");
    expect(screen.getByRole("group", { name: "Mês de referência" })).toBeTruthy();

    fireEvent.click(within(screen.getByRole("navigation", { name: "Navegação principal" })).getByRole("link", { name: "Metas" }));
    await waitFor(() => expect(window.location.hash).toBe("#/metas"));
    expect(await screen.findByRole("heading", { level: 1, name: "Metas" })).toBeTruthy();
    expect(document.title).toBe("Metas · LMM Finance Control");
    expect(screen.queryByRole("group", { name: "Mês de referência" })).toBeNull();
  });

  it("carrega os dados do mês escolhido", async () => {
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Olá!" });
    const firstMonth = vi.mocked(api.checklist).mock.calls.at(-1)?.[0];
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    await waitFor(() => expect(vi.mocked(api.checklist).mock.calls.at(-1)?.[0]).not.toBe(firstMonth));
    expect(vi.mocked(api.summary).mock.calls.at(-1)?.[0]).toBe(vi.mocked(api.checklist).mock.calls.at(-1)?.[0]);
  });

  it("remove com confirmação e permite desfazer", async () => {
    act(() => { window.location.hash = "#/metas"; });
    render(<App />);
    // CR-19: goal actions live in the goal menu.
    fireEvent.click(await screen.findByRole("button", { name: "Mais ações para Viagem" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remover" }));

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("goals", 4));
    expect(await screen.findByText("\"Viagem\" foi removido.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith("goals", 4));
    expect(await screen.findByText("Remoção desfeita.")).toBeTruthy();
  });
});
