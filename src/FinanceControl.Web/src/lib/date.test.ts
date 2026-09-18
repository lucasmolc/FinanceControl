import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, addMonths, currentMonth, dateInMonth, daysInMonth, defaultDateForMonth, formatDate, formatMonthLabel, isISODate, shiftMonth, todayISO } from "./date";

afterEach(() => { vi.useRealTimers(); });

describe("datas locais", () => {
  it("mantém o dia e o mês locais no fim da noite", () => {
    vi.useFakeTimers();
    // Local 30/09/2026 23:30 — in UTC−3 toISOString() would already say 1st of October.
    vi.setSystemTime(new Date(2026, 8, 30, 23, 30, 0));
    expect(todayISO()).toBe("2026-09-30");
    expect(currentMonth()).toBe("2026-09");
    expect(defaultDateForMonth("2026-09")).toBe("2026-09-30");
    expect(defaultDateForMonth("2026-08")).toBe("2026-08-01");
  });

  it("mantém o último dia do ano", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 22, 0, 0));
    expect(todayISO()).toBe("2026-12-31");
    expect(currentMonth()).toBe("2026-12");
  });

  it("formata datas e meses em pt-BR", () => {
    expect(formatDate("2026-09-07")).toBe("07/09/2026");
    expect(formatDate("inválida")).toBe("inválida");
    expect(formatMonthLabel("2026-09")).toBe("setembro de 2026");
  });

  it("navega entre meses", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-09", 0)).toBe("2026-09");
    expect(shiftMonth("2026-09", -21)).toBe("2024-12");
  });

  it("calcula dias do mês e ajusta vencimentos", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(dateInMonth("2026-02", 31)).toBe("2026-02-28");
    expect(dateInMonth("2026-09", 5)).toBe("2026-09-05");
  });

  it("valida datas ISO", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("28/02/2026")).toBe(false);
    expect(isISODate("")).toBe(false);
  });

  it("soma dias e meses sem depender do fuso", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
  });
});
