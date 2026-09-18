// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { api, ApiError } from "./api/client";
import { resetPreferencesForTests } from "./lib/preferencesStore";
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
      state: vi.fn(), checklist: vi.fn(), summary: vi.fn(), transactions: vi.fn(), settings: vi.fn(), runAutoDebits: vi.fn(), closings: vi.fn(), about: vi.fn(),
    },
  };
});

const summary = { month: "2026-09", income_cents: 0, expense_cents: 0, investment_cents: 0, transactions_count: 0, uncategorized_expense_cents: 0, categories: [], bills: { total_count: 0, paid_count: 0, total_cents: 0, paid_cents: 0 } };

const state: FinanceState = {
  ...emptyState,
  goals: [{ id: 4, name: "Viagem", type: "travel", target_cents: 500_000, current_cents: 100_000, target_date: null, currency: "BRL", active: true }],
};

const go = (hash: string) => act(() => { window.location.hash = hash; });

beforeEach(() => {
  window.location.hash = "";
  try { window.localStorage.clear(); } catch { /* ignore */ }
  resetPreferencesForTests();
  vi.mocked(api.state).mockResolvedValue(state);
  vi.mocked(api.checklist).mockResolvedValue([]);
  vi.mocked(api.summary).mockResolvedValue(summary);
  vi.mocked(api.transactions).mockResolvedValue([]);
  vi.mocked(api.settings).mockResolvedValue({ ok: true });
  vi.mocked(api.runAutoDebits).mockResolvedValue({ created: [] });
  vi.mocked(api.closings).mockResolvedValue([]);
  vi.mocked(api.about).mockResolvedValue({ database_path: "C:/dados/finance.db", schema_version: "007" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetPreferencesForTests();
});

describe("MEL-37 · abertura da marca", () => {
  it("mostra a abertura enquanto carrega e o app por baixo quando os dados chegam", async () => {
    let resolve: (value: FinanceState) => void = () => undefined;
    vi.mocked(api.state).mockReturnValue(new Promise(done => { resolve = done; }));
    render(<App />);
    expect(screen.getByRole("status").textContent).toContain("Carregando LMM Finance Control…");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    await act(async () => { resolve(state); });
    expect(await screen.findByRole("heading", { level: 1, name: "Olá!" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.querySelector("[data-brand-intro]")).toBeNull());
  });
});

describe("MEL-48 · troca de página sem sobreposição da marca", () => {
  it("não cobre o shell: a sidebar e a doca seguem visíveis e o foco vai para o título", async () => {
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Olá!" });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.querySelector("[data-brand-intro]")).toBeNull());

    go("#/metas");
    expect(await screen.findByRole("heading", { level: 1, name: "Metas" })).toBeTruthy();
    expect(document.querySelector("[data-brand-intro]")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Navegação móvel" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Metas"));
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });
});

describe("MEL-49 · marca leva à Visão geral", () => {
  it("é um link com rótulo acessível que navega pelo app (sem recarregar)", async () => {
    window.location.hash = "#/metas";
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Metas" });
    fireEvent.keyDown(window, { key: "Escape" });
    const links = screen.getAllByRole("link", { name: "LMM Finance — ir para a Visão geral" });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]!.getAttribute("href")).toBe("#/painel");
    fireEvent.click(links[0]!);
    expect(await screen.findByRole("heading", { level: 1, name: "Olá!" })).toBeTruthy();
    expect(window.location.hash).toBe("#/painel");
  });
});

describe("CR-17 · atalho da paleta visível", () => {
  it("o botão de busca mostra Ctrl K", async () => {
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Olá!" });
    const trigger = screen.getByRole("button", { name: "Buscar e comandos" });
    expect(trigger.querySelector("kbd")?.textContent).toMatch(/^(Ctrl|⌘) K$/);
    expect(trigger.getAttribute("aria-keyshortcuts")).toBe("Control+K Meta+K");
  });
});

describe("MEL-29 · débitos automáticos ao abrir", () => {
  it("roda uma vez, atualiza os dados e avisa quantos foram lançados", async () => {
    vi.mocked(api.runAutoDebits).mockResolvedValue({ created: [
      { kind: "bill", id: 1, name: "Luz", date: "2026-09-10", amount_cents: 12_000, currency: "BRL", transaction_id: 50 },
      { kind: "subscription", id: 2, name: "Netflix", date: "2026-09-11", amount_cents: 5_590, currency: "BRL", transaction_id: 51 },
    ] });
    render(<App />);
    expect(await screen.findByText("2 débitos automáticos lançados.")).toBeTruthy();
    expect(api.runAutoDebits).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.state).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("falha silenciosamente quando o servidor não suporta", async () => {
    vi.mocked(api.runAutoDebits).mockRejectedValue(new ApiError("Não encontrado.", 404));
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Olá!" });
    await waitFor(() => expect(api.runAutoDebits).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("MEL-28 · toasts", () => {
  it("falha ao atualizar vira toast de erro, sem banner", async () => {
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Olá!" });
    vi.mocked(api.state).mockRejectedValue(new ApiError("Servidor indisponível.", 500));
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Servidor indisponível.");
    expect(document.querySelector(".error-banner")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Olá!" })).toBeTruthy();
  });
});

describe("MEL-30 · preferências", () => {
  it("aplica as preferências do servidor no <html> e oculta valores", async () => {
    vi.mocked(api.state).mockResolvedValue({ ...state, settings: { ...state.settings, ui_preferences: { theme: "claro", accent: "ouro", density: "compacto", animations: false, hide_values: true } } });
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Olá!" });
    const root = document.documentElement;
    await waitFor(() => expect(root.dataset.theme).toBe("claro"));
    expect(root.dataset.accent).toBe("ouro");
    expect(root.dataset.density).toBe("compacto");
    expect(root.dataset.motion).toBe("off");
    expect(root.dataset.hideValues).toBe("true");
    expect(screen.getByRole("button", { name: "Ocultar valores" }).getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(window.localStorage.getItem("lmm-ui") ?? "{}").theme).toBe("claro");
  });

  it("o olho da barra superior liga o modo privado e salva", async () => {
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Olá!" });
    fireEvent.click(screen.getByRole("button", { name: "Ocultar valores" }));
    expect(document.documentElement.dataset.hideValues).toBe("true");
    await waitFor(() => expect(api.settings).toHaveBeenCalledWith({ ui_preferences: expect.objectContaining({ hide_values: true }) }));
  });

  it("desfaz a preferência quando não consegue salvar", async () => {
    vi.mocked(api.settings).mockRejectedValue(new ApiError("Não foi possível salvar.", 500));
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Olá!" });
    fireEvent.click(screen.getByRole("button", { name: "Ocultar valores" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível salvar.");
    expect(document.documentElement.dataset.hideValues).toBe("false");
  });
});

describe("navegação v1.2", () => {
  it("mostra o grupo Análises e abre Relatórios", async () => {
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Olá!" });
    const sidebar = screen.getByRole("navigation", { name: "Navegação principal" });
    const group = within(sidebar).getByRole("group", { name: "Análises" });
    expect(within(group).getAllByRole("link").map(link => link.textContent)).toEqual(["Relatórios", "Projeções", "Mercado"]);
    fireEvent.click(within(group).getByRole("link", { name: "Relatórios" }));
    await waitFor(() => expect(window.location.hash).toBe("#/relatorios"));
    expect(await screen.findByRole("heading", { level: 1, name: "Relatórios" })).toBeTruthy();
  });

  it("abre a rota com filtros na URL", async () => {
    go("#/lancamentos?categoria=3&tipo=expense");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "Lançamentos" })).toBeTruthy();
    expect(document.title).toBe("Lançamentos · LMM Finance Control");
  });

  it("abre a galeria de componentes em desenvolvimento", async () => {
    go("#/componentes");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "Componentes" })).toBeTruthy();
    const sidebar = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(sidebar).queryByRole("link", { name: "Componentes" })).toBeNull();
  });

  it("Ctrl+K abre a paleta de comandos e navega", async () => {
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Olá!" });
    // R2-BR-1: shortcuts wait for the brand opening to leave.
    await waitFor(() => expect(document.querySelector("[data-brand-intro]")).toBeNull(), { timeout: 3000 });
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const palette = await screen.findByRole("dialog", { name: "Paleta de comandos" }, { timeout: 3000 });
    // R2-CMD-1: without a query "Ir para" shows 5 pages + "Mostrar todos"; searching finds the rest.
    expect(within(palette).getAllByRole("option", { name: /Mostrar todos/ }).length).toBeGreaterThan(0);
    fireEvent.change(within(palette).getByRole("combobox"), { target: { value: "metas" } });
    fireEvent.click(within(palette).getByRole("option", { name: /^Metas/ }));
    await waitFor(() => expect(window.location.hash).toBe("#/metas"), { timeout: 3000 });
    expect(await screen.findByRole("heading", { level: 1, name: "Metas" }, { timeout: 3000 })).toBeTruthy();
  });

  it("a paleta cria registros", async () => {
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Olá!" });
    fireEvent.click(screen.getByRole("button", { name: "Buscar e comandos" }));
    const palette = await screen.findByRole("dialog", { name: "Paleta de comandos" });
    fireEvent.click(within(palette).getByText("Nova meta"));
    expect(await screen.findByRole("dialog", { name: "Nova meta" })).toBeTruthy();
  });
});
