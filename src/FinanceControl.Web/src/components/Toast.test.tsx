// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "../hooks/useToast";
import { resetPreferencesForTests, setPreferences } from "../lib/preferencesStore";
import { DEFAULT_PREFERENCES } from "../lib/preferences";
import { ToastProvider } from "./Toast";
import { toastDuration, TRANSIENT_NETWORK_MESSAGE, type ToastApi } from "./toastContext";
import { NETWORK_ERROR_MESSAGE } from "../api/client";
import { markServerOffline, reportRequestFailure, reportRequestSuccess, resetConnectivity } from "../api/connectivity";

let api: ToastApi;
function Capture() { api = useToast(); return null; }

const renderProvider = () => render(<ToastProvider><Capture /></ToastProvider>);

beforeEach(() => {
  vi.useFakeTimers();
  // Motion off: toasts leave immediately (no exit animation delay).
  setPreferences({ ...DEFAULT_PREFERENCES, animations: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetPreferencesForTests();
});

describe("toasts (MEL-28)", () => {
  it("usa as durações padrão", () => {
    expect(toastDuration({ tone: "success" })).toBe(4500);
    expect(toastDuration({ tone: "info" })).toBe(4500);
    expect(toastDuration({ tone: "success", action: { label: "Desfazer", run: () => undefined } })).toBe(7000);
    expect(toastDuration({ tone: "error" })).toBe(8000);
    expect(toastDuration({ tone: "error", duration: 1000 })).toBe(1000);
  });

  it("some sozinho depois do tempo e pode ser fechado", () => {
    renderProvider();
    act(() => { api.toast({ message: "Lançamento registrado.", tone: "success" }); });
    expect(screen.getByText("Lançamento registrado.")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(4400); });
    expect(screen.queryByText("Lançamento registrado.")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText("Lançamento registrado.")).toBeNull();

    act(() => { api.toast({ message: "Outro aviso." }); });
    fireEvent.click(screen.getByRole("button", { name: "Fechar notificação" }));
    expect(screen.queryByText("Outro aviso.")).toBeNull();
  });

  it("pausa enquanto o mouse está sobre o aviso", () => {
    renderProvider();
    act(() => { api.toast({ message: "Pausável.", tone: "info" }); });
    const toast = screen.getByText("Pausável.").closest(".toast")!;
    act(() => { vi.advanceTimersByTime(3000); });
    fireEvent.mouseEnter(toast);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText("Pausável.")).toBeTruthy();
    fireEvent.mouseLeave(toast);
    act(() => { vi.advanceTimersByTime(1400); });
    expect(screen.getByText("Pausável.")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText("Pausável.")).toBeNull();
  });

  it("pausa com foco dentro do aviso", () => {
    renderProvider();
    act(() => { api.toast({ message: "Com foco.", tone: "success", action: { label: "Desfazer", run: () => undefined } }); });
    fireEvent.focus(screen.getByRole("button", { name: "Desfazer" }));
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(screen.getByText("Com foco.")).toBeTruthy();
  });

  it("mantém no máximo 3 avisos, descartando o mais antigo", () => {
    renderProvider();
    act(() => { ["Um", "Dois", "Três", "Quatro"].forEach(message => api.toast({ message })); });
    expect(screen.queryByText("Um")).toBeNull();
    expect(screen.getAllByText(/^(Dois|Três|Quatro)$/)).toHaveLength(3);
  });

  it("executa a ação uma vez e fecha o aviso", async () => {
    const run = vi.fn();
    renderProvider();
    act(() => { api.toast({ message: "Removido.", tone: "success", action: { label: "Desfazer", run } }); });
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await act(async () => { await Promise.resolve(); });
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Removido.")).toBeNull();
  });

  it("mostra a falha da ação como erro", async () => {
    renderProvider();
    act(() => { api.toast({ message: "Removido.", action: { label: "Desfazer", run: () => { throw new Error("Falhou."); } } }); });
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("alert").textContent).toContain("Falhou.");
  });

  it("anuncia erros como alerta e os demais na região educada", () => {
    renderProvider();
    act(() => { api.toast({ message: "Salvo.", tone: "success" }); api.toast({ message: "Deu erro.", tone: "error" }); });
    expect(screen.getByRole("alert").textContent).toContain("Deu erro.");
    const region = document.querySelector(".toast-region")!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("Salvo.").closest(".toast")!.getAttribute("role")).toBeNull();
    act(() => { vi.advanceTimersByTime(7900); });
    expect(screen.getByText("Deu erro.")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText("Deu erro.")).toBeNull();
  });

  it("aplica animação de saída quando as animações estão ligadas", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, animations: true });
    renderProvider();
    act(() => { api.toast({ message: "Saindo." }); });
    fireEvent.click(screen.getByRole("button", { name: "Fechar notificação" }));
    expect(screen.getByText("Saindo.").closest(".toast")!.className).toContain("is-leaving");
    act(() => { vi.advanceTimersByTime(210); });
    expect(screen.queryByText("Saindo.")).toBeNull();
  });

  it("R3 decisão 1: falha de conexão confirmada fica só com o banner (sem toast)", async () => {
    resetConnectivity();
    renderProvider();
    act(() => { reportRequestFailure(); api.toast({ message: NETWORK_ERROR_MESSAGE, tone: "error" }); });
    await act(async () => { markServerOffline(); await Promise.resolve(); });
    expect(screen.queryByText(NETWORK_ERROR_MESSAGE)).toBeNull();
    expect(screen.queryByText(TRANSIENT_NETWORK_MESSAGE)).toBeNull();
    resetConnectivity();
  });

  it("R3 decisão 1: com o servidor no ar (falha passageira) mostra um aviso curto", async () => {
    resetConnectivity();
    renderProvider();
    act(() => { reportRequestFailure(); api.toast({ message: NETWORK_ERROR_MESSAGE, tone: "error" }); });
    await act(async () => { reportRequestSuccess(); await Promise.resolve(); });
    expect(screen.getByText(TRANSIENT_NETWORK_MESSAGE)).toBeTruthy();
    resetConnectivity();
  });
});

