// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Field } from "../../ui";
import { Select } from "./Select";
import type { OptionsInput } from "../shared/options";

afterEach(cleanup);

const OPTIONS: OptionsInput = [
  { label: "Moradia", options: [{ value: "aluguel", label: "Aluguel" }, { value: "agua", label: "Água" }] },
  { label: "Alimentação", options: [{ value: "mercado", label: "Mercado" }, { value: "bloqueado", label: "Bloqueado", disabled: true }, { value: "cafe", label: "Café" }] },
];

function Harness({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("");
  return <Field label="Categoria"><Select options={OPTIONS} value={value} emptyLabel="Sem categoria" onChange={next => { setValue(next); onChange?.(next); }} /></Field>;
}

describe("Select (APG select-only combobox)", () => {
  it("é rotulado pelo Field e abre com seta para baixo com grupos", () => {
    render(<Harness />);
    const combo = screen.getByRole("combobox", { name: "Categoria" });
    expect(combo.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    expect(combo.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("group").map(group => group.textContent?.slice(0, 7))).toEqual(["Moradia", "Aliment"]);
    expect(combo.getAttribute("aria-activedescendant")).toBeTruthy();
  });

  it("navega com setas pulando desativados e escolhe com Enter", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const combo = screen.getByRole("combobox", { name: "Categoria" });
    fireEvent.keyDown(combo, { key: "End" });
    fireEvent.keyDown(combo, { key: "ArrowUp" });
    const active = document.getElementById(combo.getAttribute("aria-activedescendant")!);
    expect(active?.textContent).toBe("Mercado");
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("mercado");
    expect(combo.getAttribute("aria-expanded")).toBe("false");
    expect(combo.textContent).toContain("Mercado");
  });

  it("type-ahead pelo texto sem acento e Esc fecha sem propagar", () => {
    const outer = vi.fn();
    render(<div onKeyDown={outer}><Harness /></div>);
    const combo = screen.getByRole("combobox", { name: "Categoria" });
    fireEvent.keyDown(combo, { key: "c" });
    expect(document.getElementById(combo.getAttribute("aria-activedescendant")!)?.textContent).toBe("Café");
    fireEvent.keyDown(combo, { key: "Escape" });
    expect(combo.getAttribute("aria-expanded")).toBe("false");
    expect(outer).not.toHaveBeenCalledWith(expect.objectContaining({ key: "Escape" }));
  });

  it("clique na opção seleciona; valor ausente aparece como missingLabel", () => {
    render(<Select aria-label="Conta" options={OPTIONS} value="removida" missingLabel="Conta removida" onChange={() => undefined} />);
    const combo = screen.getByRole("combobox", { name: "Conta" });
    expect(combo.textContent).toContain("Conta removida");
    fireEvent.click(combo);
    fireEvent.click(screen.getByRole("option", { name: "Água" }));
    expect(combo.getAttribute("aria-expanded")).toBe("false");
  });
});
