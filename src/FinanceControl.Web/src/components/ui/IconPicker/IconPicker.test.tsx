// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IconPicker } from "./IconPicker";

afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState<string | null>(null);
  return <><IconPicker aria-label="Ícone" value={value} onChange={setValue} /><output>{value ?? "nenhum"}</output></>;
}

describe("IconPicker", () => {
  it("busca em pt-BR e escolhe com teclado; foco volta ao gatilho", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Ícone" });
    fireEvent.click(trigger);
    const search = screen.getByRole("combobox", { name: "Buscar ícone" });
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: "musculação" } });
    const options = screen.getAllByRole("option");
    expect(options[0]?.textContent).toBe("Academia");
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByText("academia", { selector: "output" })).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.textContent).toContain("Academia");
  });

  it("agrupa por grupo e mostra vazio", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Ícone" }));
    expect(screen.getAllByRole("group").length).toBeGreaterThan(10);
    fireEvent.change(screen.getByRole("combobox", { name: "Buscar ícone" }), { target: { value: "qwerty" } });
    expect(screen.getByText("Nenhum ícone para “qwerty”.")).toBeTruthy();
  });
});
