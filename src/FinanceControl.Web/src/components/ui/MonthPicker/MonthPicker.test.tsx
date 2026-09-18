// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MonthPicker } from "./MonthPicker";

afterEach(cleanup);

function Harness({ stepper = false, max }: { stepper?: boolean; max?: string }) {
  const [value, setValue] = useState("2026-09");
  return <><MonthPicker aria-label="Competência" value={value} onChange={setValue} stepper={stepper} max={max} /><output>{value}</output></>;
}

describe("MonthPicker", () => {
  it("mostra o mês por extenso e escolhe na grade com setas e Enter", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Competência" });
    expect(trigger.textContent).toContain("setembro de 2026");
    fireEvent.click(trigger);
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(screen.getByText("2026-12", { selector: "output" })).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
  });

  it("PageUp muda o ano e max bloqueia meses", () => {
    render(<Harness max="2026-10" />);
    fireEvent.click(screen.getByRole("button", { name: "Competência" }));
    expect(screen.getByRole("button", { name: "novembro de 2026" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(screen.getByRole("grid"), { key: "PageUp" });
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
    expect(screen.getByText("2025-09", { selector: "output" })).toBeTruthy();
  });

  it("stepper anterior/próximo", () => {
    render(<Harness stepper />);
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(screen.getByText("2026-10", { selector: "output" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(screen.getByText("2026-08", { selector: "output" })).toBeTruthy();
  });
});
