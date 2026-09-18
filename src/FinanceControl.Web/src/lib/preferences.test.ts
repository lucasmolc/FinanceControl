// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { applyCachedPreferences, applyPreferences, DASHBOARD_WIDGETS, DEFAULT_DASHBOARD_WIDGETS, DEFAULT_PREFERENCES, normalizePreferences, PREFERENCES_CACHE_KEY, readCachedPreferences } from "./preferences";
import { getPreferences, resetPreferencesForTests, setPreferences, subscribePreferences } from "./preferencesStore";

afterEach(() => {
  window.localStorage.clear();
  resetPreferencesForTests();
});

describe("preferências (MEL-30)", () => {
  it("preenche padrões e descarta valores inválidos", () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.dashboard_widgets).toEqual([...DEFAULT_DASHBOARD_WIDGETS]);
    // CR-13: a reduced default (every default id is a registered widget; the rest stays available as hidden)
    expect(DEFAULT_DASHBOARD_WIDGETS.length).toBeLessThan(DASHBOARD_WIDGETS.length);
    expect(DEFAULT_DASHBOARD_WIDGETS.every(id => (DASHBOARD_WIDGETS as readonly string[]).includes(id))).toBe(true);
    expect(DEFAULT_DASHBOARD_WIDGETS).not.toContain("mercado");
    expect(DEFAULT_DASHBOARD_WIDGETS).not.toContain("patrimonio");
    expect(normalizePreferences({ theme: "neon", accent: "rosa", density: "compacto", animations: "sim", hide_values: true, dashboard_widgets: ["fluxo", "fluxo", "", 3, "saldo"] }))
      .toEqual({ ...DEFAULT_PREFERENCES, accent: "rosa", density: "compacto", hide_values: true, dashboard_widgets: ["fluxo", "saldo"] });
  });

  it("aplica os atributos no <html>", () => {
    const root = document.createElement("html");
    applyPreferences({ ...DEFAULT_PREFERENCES, theme: "sistema", animations: false, hide_values: true }, root);
    expect(root.dataset.theme).toBe("sistema");
    expect(["claro", "noite"]).toContain(root.dataset.themeResolved);
    expect(root.dataset.accent).toBe("esmeralda");
    expect(root.dataset.density).toBe("confortavel");
    expect(root.dataset.motion).toBe("off");
    expect(root.dataset.hideValues).toBe("true");
  });

  it("aplica o cache antes da primeira renderização e tolera cache corrompido", () => {
    window.localStorage.setItem(PREFERENCES_CACHE_KEY, JSON.stringify({ theme: "ouro" }));
    expect(applyCachedPreferences().theme).toBe("ouro");
    expect(document.documentElement.dataset.theme).toBe("ouro");
    window.localStorage.setItem(PREFERENCES_CACHE_KEY, "{quebrado");
    expect(readCachedPreferences()).toBeNull();
    expect(applyCachedPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("a store avisa assinantes, grava o cache e ignora valores iguais", () => {
    let calls = 0;
    const unsubscribe = subscribePreferences(() => { calls += 1; });
    setPreferences({ ...DEFAULT_PREFERENCES, theme: "grafite" });
    setPreferences({ ...DEFAULT_PREFERENCES, theme: "grafite" });
    unsubscribe();
    expect(calls).toBe(1);
    expect(getPreferences().theme).toBe("grafite");
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_CACHE_KEY)!).theme).toBe("grafite");
    expect(document.documentElement.dataset.theme).toBe("grafite");
  });
});
