// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { resetPreferencesForTests } from "../lib/preferencesStore";
import { usePreferences } from "./usePreferences";

vi.mock("../api/client", async importOriginal => {
  const original = await importOriginal<typeof import("../api/client")>();
  return { ...original, api: { ...original.api, settings: vi.fn() } };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); resetPreferencesForTests(); });

describe("R1-CFG-9 · duas preferências no mesmo instante", () => {
  it("as duas são salvas, em ordem, e a última escrita leva as duas mudanças", async () => {
    const sent: unknown[] = [];
    let release: () => void = () => undefined;
    vi.mocked(api.settings).mockImplementation(async body => {
      sent.push(JSON.parse(JSON.stringify(body)));
      if (sent.length === 1) await new Promise<void>(resolve => { release = resolve; });
      return { ok: true };
    });
    const { result } = renderHook(() => usePreferences());
    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = result.current.update({ theme: "claro" });
      second = result.current.update({ density: "compacto" });
    });
    expect(sent).toHaveLength(1);
    await act(async () => { release(); await first; await second; });
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ ui_preferences: expect.objectContaining({ theme: "claro", density: "compacto" }) });
    expect(result.current.preferences.theme).toBe("claro");
    expect(result.current.preferences.density).toBe("compacto");
  });

  it("uma falha desfaz só a própria mudança", async () => {
    vi.mocked(api.settings).mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error("falhou"));
    const { result } = renderHook(() => usePreferences());
    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = result.current.update({ theme: "claro" });
      second = result.current.update({ density: "compacto" });
    });
    await act(async () => { await first; await second.catch(() => undefined); });
    expect(result.current.preferences.theme).toBe("claro");
    expect(result.current.preferences.density).toBe("confortavel");
  });
});

describe("R4-SH-1 · preferências offline", () => {
  it("fora do ar a mudança fica aplicada e é enviada quando a conexão volta", async () => {
    const { markServerOffline, reportRequestFailure, reportRequestSuccess, resetConnectivity } = await import("../api/connectivity");
    const { NETWORK_ERROR_MESSAGE, ApiError } = await import("../api/client");
    const { preferencesWritePending } = await import("./usePreferences");
    vi.mocked(api.settings).mockRejectedValueOnce(new ApiError(NETWORK_ERROR_MESSAGE, 0)).mockResolvedValue({ ok: true });
    reportRequestFailure();
    markServerOffline();
    const { result } = renderHook(() => usePreferences());
    await act(async () => { await result.current.update({ hide_values: true }); });
    expect(result.current.preferences.hide_values).toBe(true);
    expect(preferencesWritePending()).toBe(true);

    await act(async () => { reportRequestSuccess(); await Promise.resolve(); });
    expect(api.settings).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.settings).mock.calls[1]![0]).toEqual({ ui_preferences: expect.objectContaining({ hide_values: true }) });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    // a state read sent before the write settled must not bring the old value back: still guarded for a moment…
    expect(preferencesWritePending()).toBe(true);
    const later = Date.now() + 5000;
    const now = vi.spyOn(Date, "now").mockReturnValue(later);
    expect(preferencesWritePending()).toBe(false);
    now.mockRestore();
    resetConnectivity();
  });
});
