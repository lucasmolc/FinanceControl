// @vitest-environment jsdom

import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { brToISO, isoToBR, maskBR } from "../shared/dates";
import { DatePicker } from "./DatePicker";

afterEach(cleanup);

function Harness({ min, max, onChange }: { min?: string; max?: string; onChange?: (iso: string) => void }) {
  const [value, setValue] = useState("2026-09-18");
  return <><DatePicker aria-label="Data" value={value} min={min} max={max} onChange={next => { setValue(next); onChange?.(next); }} /><output>{value || "vazio"}</output></>;
}

describe("DatePicker", () => {
  it("helpers pt-BR ↔ ISO e máscara", () => {
    expect(isoToBR("2026-09-18")).toBe("18/09/2026");
    expect(brToISO("18/09/2026")).toBe("2026-09-18");
    expect(brToISO("1/2/26")).toBe("2026-02-01");
    expect(brToISO("18092026")).toBe("2026-09-18");
    expect(brToISO("31/02/2026")).toBeNull();
    expect(maskBR("1809")).toBe("18/09");
    expect(maskBR("18092026")).toBe("18/09/2026");
    expect(maskBR("1/9/26")).toBe("1/9/26");
    expect(maskBR("18/092")).toBe("18/09/2");
  });

  it("mostra dd/mm/aaaa e emite ISO ao digitar; texto inválido fica marcado", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Data" }) as HTMLInputElement;
    expect(input.value).toBe("18/09/2026");
    fireEvent.change(input, { target: { value: "01102026" } });
    expect(input.value).toBe("01/10/2026");
    expect(onChange).toHaveBeenLastCalledWith("2026-10-01");
    fireEvent.change(input, { target: { value: "31/02/2026" } });
    fireEvent.blur(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("2026-10-01", { selector: "output" })).toBeTruthy();
  });

  it("calendário: abre, navega com setas/PageDown e escolhe com Enter; Esc devolve o foco", async () => {
    render(<Harness />);
    const toggle = screen.getByRole("button", { name: "Abrir calendário" });
    fireEvent.click(toggle);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("setembro de 2026");
    const grid = screen.getByRole("grid");
    const focused = () => grid.querySelector<HTMLButtonElement>("button[tabindex='0']")!;
    expect(focused().getAttribute("aria-label")).toBe("sexta-feira, 18 de setembro de 2026");
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "PageDown" });
    expect(focused().dataset.date).toBe("2026-10-19");
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(screen.getByText("2026-10-19", { selector: "output" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    act(() => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("respeita min/max e atalhos Hoje/Início do mês", () => {
    render(<Harness min="2026-09-10" max="2026-09-20" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendário" }));
    const blocked = screen.getByRole("button", { name: "quarta-feira, 9 de setembro de 2026" });
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(blocked);
    expect(screen.getByText("2026-09-18", { selector: "output" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hoje" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Início do mês" })).toBeTruthy();
  });
});
