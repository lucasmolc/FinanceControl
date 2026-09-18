// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "../lib/preferences";
import { resetPreferencesForTests, setPreferences } from "../lib/preferencesStore";
import { useCountUp } from "./useCountUp";

function Counter({ value, duration }: { value: number; duration?: number }) {
  return <span data-testid="value">{useCountUp(value, { duration })}</span>;
}

const shown = () => Number(screen.getByTestId("value").textContent);

beforeEach(() => { vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "Date", "setTimeout", "clearTimeout"] }); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetPreferencesForTests(); });

describe("useCountUp (MEL-30)", () => {
  it("conta de 0 até o valor e anima as mudanças seguintes a partir do valor na tela", () => {
    const { rerender } = render(<Counter value={1000} duration={400} />);
    expect(shown()).toBe(0);
    act(() => { vi.advanceTimersByTime(200); });
    expect(shown()).toBeGreaterThan(0);
    expect(shown()).toBeLessThan(1000);
    act(() => { vi.advanceTimersByTime(400); });
    expect(shown()).toBe(1000);

    rerender(<Counter value={500} duration={400} />);
    act(() => { vi.advanceTimersByTime(600); });
    expect(shown()).toBe(500);
  });

  it("mostra o valor final direto com animações desligadas", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, animations: false });
    const { rerender } = render(<Counter value={1234} />);
    expect(shown()).toBe(1234);
    rerender(<Counter value={99} />);
    expect(shown()).toBe(99);
  });
});
