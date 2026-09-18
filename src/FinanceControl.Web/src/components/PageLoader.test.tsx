// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_LOADER_DELAY_MS } from "../lib/brandMotion";
import { PageLoader } from "./PageLoader";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("MEL-48 · mini-loader da marca na troca de página", () => {
  it("só aparece quando a página demora mais que o limite", () => {
    render(<PageLoader label="Lançamentos" />);
    // R1-BR-5: the live region exists (empty) from the start; only its text appears after the delay.
    expect(screen.getByRole("status").textContent).toBe("");
    act(() => { vi.advanceTimersByTime(PAGE_LOADER_DELAY_MS - 1); });
    expect(screen.getByRole("status").textContent).toBe("");
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("status").textContent).toBe("Carregando lançamentos…");
    expect(document.querySelector(".page-loader .logo-trend")).toBeTruthy();
  });
});
