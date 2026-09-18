// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { reportRequestFailure, reportRequestSuccess, resetConnectivity } from "../api/connectivity";
import { OfflineBanner } from "../components/OfflineBanner";
import { SERVER_HEARTBEAT_MS, SERVER_RETRY_DELAYS_MS, useServerStatus } from "./useServerStatus";

vi.mock("../api/client", async importOriginal => {
  const original = await importOriginal<typeof import("../api/client")>();
  return { ...original, api: { ...original.api, health: vi.fn() } };
});

function Harness({ onRecover }: { onRecover: () => void }) {
  const server = useServerStatus(onRecover);
  return server.offline ? <OfflineBanner checking={server.checking} onRetry={server.retry} /> : <p>online</p>;
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => { vi.useFakeTimers(); resetConnectivity(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); resetConnectivity(); });

describe("R1 decisão 4 · estado offline global", () => {
  it("uma falha isolada com o servidor no ar não mostra o banner", async () => {
    vi.mocked(api.health).mockImplementation(async () => { reportRequestSuccess(); return {}; });
    render(<Harness onRecover={vi.fn()} />);
    act(() => reportRequestFailure());
    await flush();
    expect(screen.getByText("online")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("falha confirmada pelo /api/health: banner persistente, novas tentativas com espera e recarga ao voltar", async () => {
    vi.mocked(api.health).mockRejectedValue(new Error("offline"));
    const onRecover = vi.fn();
    render(<Harness onRecover={onRecover} />);
    act(() => reportRequestFailure());
    await flush();
    expect(screen.getByRole("status").textContent).toContain("Sem conexão com o servidor local.");
    expect(api.health).toHaveBeenCalledTimes(1);

    await act(async () => { vi.advanceTimersByTime(SERVER_RETRY_DELAYS_MS[0]!); });
    await flush();
    expect(api.health).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toBeTruthy();

    // The server is back: the next probe answers → banner gone, the page refetches once.
    vi.mocked(api.health).mockImplementation(async () => { reportRequestSuccess(); return {}; });
    fireEvent.click(screen.getByRole("button", { name: "Tentar agora" }));
    await flush();
    expect(screen.getByText("online")).toBeTruthy();
    expect(onRecover).toHaveBeenCalledTimes(1);
  });

  it("volta a tentar na hora quando a janela recebe foco", async () => {
    vi.mocked(api.health).mockRejectedValue(new Error("offline"));
    render(<Harness onRecover={vi.fn()} />);
    act(() => reportRequestFailure());
    await flush();
    expect(api.health).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new Event("focus")); });
    await flush();
    expect(api.health).toHaveBeenCalledTimes(2);
  });

  it("R3-X-1: online, verifica o /api/health a cada 30 s e mostra o banner sem esperar uma ação falhar", async () => {
    vi.mocked(api.health).mockRejectedValue(new Error("offline"));
    render(<Harness onRecover={vi.fn()} />);
    expect(api.health).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(SERVER_HEARTBEAT_MS); });
    await flush();
    await flush();
    expect(screen.getByRole("status").textContent).toContain("Sem conexão com o servidor local.");
  });
});

