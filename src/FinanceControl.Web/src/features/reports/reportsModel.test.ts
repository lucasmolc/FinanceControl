import { describe, expect, it } from "vitest";
import { delta, formatPct, monthSpan, periodError, periodLabel, presetPeriod, previousPeriod, shortMonthLabel } from "./reportsModel";

describe("reportsModel", () => {
  it("calcula os períodos prontos a partir do mês atual", () => {
    expect(presetPeriod("month", "2026-09")).toEqual({ from: "2026-09", to: "2026-09" });
    expect(presetPeriod("3m", "2026-02")).toEqual({ from: "2025-12", to: "2026-02" });
    expect(presetPeriod("6m", "2026-09")).toEqual({ from: "2026-04", to: "2026-09" });
    expect(presetPeriod("12m", "2026-09")).toEqual({ from: "2025-10", to: "2026-09" });
    expect(presetPeriod("year", "2026-09")).toEqual({ from: "2026-01", to: "2026-09" });
    expect(presetPeriod("custom", "2026-09", { from: "2025-01", to: "2025-03" })).toEqual({ from: "2025-01", to: "2025-03" });
  });

  it("conta meses, valida o intervalo e acha o período anterior", () => {
    expect(monthSpan("2025-11", "2026-02")).toBe(4);
    expect(monthSpan("2026-02", "2025-11")).toBe(0);
    expect(periodError({ from: "", to: "2026-01" })).toBe("Informe o mês inicial e o final.");
    expect(periodError({ from: "2026-03", to: "2026-01" })).toMatch(/anterior ou igual/);
    expect(periodError({ from: "2023-01", to: "2026-01" })).toMatch(/36 meses/);
    expect(periodError({ from: "2023-02", to: "2026-01" })).toBeNull();
    expect(previousPeriod({ from: "2026-04", to: "2026-09" })).toEqual({ from: "2025-10", to: "2026-03" });
    expect(previousPeriod({ from: "2026-01", to: "2026-01" })).toEqual({ from: "2025-12", to: "2025-12" });
  });

  it("calcula variação percentual e formata", () => {
    expect(delta(120, 100)).toEqual({ pct: 20, direction: "up" });
    expect(delta(50, 200)).toEqual({ pct: -75, direction: "down" });
    expect(delta(10, 0)).toEqual({ pct: null, direction: "up" });
    expect(delta(5, 5)).toEqual({ pct: 0, direction: "flat" });
    expect(delta(-50, -100)).toEqual({ pct: 50, direction: "up" });
    expect(formatPct(12.5, true)).toBe("+12,5%");
    expect(formatPct(-3, true)).toBe("−3%");
    expect(formatPct(0, true)).toBe("0%");
    expect(formatPct(33.3)).toBe("33,3%");
  });

  it("gera rótulos curtos de mês", () => {
    expect(shortMonthLabel("2026-09")).toBe("set/26");
    expect(shortMonthLabel("2026-02")).toBe("fev/26");
    expect(shortMonthLabel("x")).toBe("x");
    expect(periodLabel({ from: "2026-04", to: "2026-09" })).toBe("abr/26 a set/26");
    expect(periodLabel({ from: "2026-09", to: "2026-09" })).toBe("set/26");
  });
});
