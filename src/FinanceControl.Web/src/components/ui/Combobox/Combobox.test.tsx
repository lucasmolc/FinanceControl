// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Combobox } from "./Combobox";

afterEach(cleanup);

const BANKS = [
  { label: "Bancos", options: [{ value: "nubank", label: "Nubank", keywords: ["roxinho"] }, { value: "itau", label: "Itaú" }, { value: "inter", label: "Inter" }] },
  { label: "Corretoras", options: [{ value: "xp", label: "XP Investimentos" }] },
];

function Single() {
  const [value, setValue] = useState<string | null>(null);
  return <><Combobox aria-label="Banco" options={BANKS} value={value} onChange={next => setValue(next)} /><output>{value ?? "nada"}</output></>;
}

function Multi() {
  const [value, setValue] = useState<string[]>(["itau"]);
  return <><Combobox aria-label="Bancos" multiple options={BANKS} value={value} onChange={setValue} /><output>{value.join(",")}</output></>;
}

describe("Combobox", () => {
  it("filtra sem acento (inclusive por palavras-chave) e escolhe com Enter", () => {
    render(<Single />);
    const input = screen.getByRole("combobox", { name: "Banco" });
    fireEvent.change(input, { target: { value: "ita" } });
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Itaú"]);
    fireEvent.change(input, { target: { value: "roxinho" } });
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Nubank"]);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("nubank", { selector: "output" })).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("Nubank");
  });

  it("mostra estado vazio e fecha com Esc", () => {
    render(<Single />);
    const input = screen.getByRole("combobox", { name: "Banco" });
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText("Nenhum resultado.")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("múltipla: listbox multiselecionável, chips removíveis e Backspace", () => {
    render(<Multi />);
    const input = screen.getByRole("combobox", { name: "Bancos" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBe("true");
    fireEvent.click(screen.getByRole("option", { name: "Nubank" }));
    expect(screen.getByText("itau,nubank", { selector: "output" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remover Itaú" }));
    expect(screen.getByText("nubank", { selector: "output" })).toBeTruthy();
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(screen.getByText("", { selector: "output" })).toBeTruthy();
  });
});
