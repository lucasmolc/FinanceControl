// @vitest-environment jsdom

import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, type Command } from "./CommandPalette";
import { useCommandPaletteHotkey } from "./useCommandPaletteHotkey";

afterEach(cleanup);

function App({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false);
  useCommandPaletteHotkey(() => setOpen(true));
  return <><div id="root-content"><button type="button">Página</button></div><CommandPalette open={open} onClose={() => setOpen(false)} commands={commands} /></>;
}

const flush = () => act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));

describe("CommandPalette", () => {
  it("Ctrl+K abre; busca fuzzy agrupada; Enter executa e fecha; foco volta", async () => {
    const goTransactions = vi.fn();
    const commands: Command[] = [
      { id: "painel", group: "Ir para", label: "Painel", run: vi.fn() },
      { id: "lanc", group: "Ir para", label: "Lançamentos", keywords: ["transações"], run: goTransactions },
      { id: "novo", group: "Criar", label: "Novo lançamento", shortcut: ["N"], run: vi.fn() },
      { id: "off", group: "Criar", label: "Desativado", disabled: true, run: vi.fn() },
    ];
    render(<App commands={commands} />);
    const page = screen.getByRole("button", { name: "Página" });
    page.focus();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const dialog = screen.getByRole("dialog", { name: "Paleta de comandos" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    await flush();
    const input = screen.getByRole("combobox", { name: "Paleta de comandos" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "lanc" } });
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Lançamentos", "Novo lançamentoN"]);
    fireEvent.change(input, { target: { value: "transacoes" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(goTransactions).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(page);
  });

  it("mostra estado vazio e fecha com Esc", async () => {
    render(<App commands={[{ id: "a", label: "Painel", run: vi.fn() }]} />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    await flush();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(screen.getByText("Nada encontrado para “zzzz”.")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("R2-CMD-1/2: sem busca, cada grupo mostra 5 e “Mostrar todos (N)”; busca sem resultado oferece o fallback", async () => {
    const pages: Command[] = Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, group: "Ir para", label: `Página ${index + 1}`, run: vi.fn() }));
    const create = vi.fn();
    render(<CommandPalette open onClose={vi.fn()} commands={[...pages, { id: "novo", group: "Criar", label: "Novo lançamento", run: vi.fn() }]} emptyQueryGroupLimit={5}
      fallback={query => [{ id: "criar", group: "Criar", label: `Criar lançamento “${query}”`, run: () => create(query) }]} />);
    const labels = () => screen.getAllByRole("option").map(option => option.textContent);
    expect(labels()).toEqual(["Página 1", "Página 2", "Página 3", "Página 4", "Página 5", "Mostrar todos (8)", "Novo lançamento"]);
    fireEvent.click(screen.getByRole("option", { name: "Mostrar todos (8)" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(labels()).toHaveLength(9);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "padaria" } });
    expect(labels()).toEqual(["Criar lançamento “padaria”"]);
    expect(screen.getByText(/Nada encontrado para “padaria”/)).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(create).toHaveBeenCalledWith("padaria");
  });
});
