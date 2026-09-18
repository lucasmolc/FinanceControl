// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DropdownMenu } from "./Menu";

afterEach(cleanup);

describe("DropdownMenu (APG menu button)", () => {
  it("abre com Enter no primeiro item, navega, pula desativado e executa", () => {
    const edit = vi.fn();
    const remove = vi.fn();
    render(<DropdownMenu label="Ações de Nubank" items={[
      { label: "Editar", onSelect: edit },
      { label: "Arquivar", disabled: true, disabledReason: "Mês fechado", onSelect: vi.fn() },
      { type: "separator" },
      { label: "Remover", tone: "danger", onSelect: remove },
    ]} />);
    const trigger = screen.getByRole("button", { name: "Ações de Nubank" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.keyDown(trigger, { key: "Enter" });
    const menu = screen.getByRole("menu");
    expect(document.activeElement?.textContent).toBe("Editar");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("Remover");
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("↑ abre no último; Esc fecha e devolve o foco; type-ahead", () => {
    render(<DropdownMenu label="Mais ações" items={[{ label: "Editar", onSelect: vi.fn() }, { label: "Duplicar", onSelect: vi.fn() }, { label: "Remover", onSelect: vi.fn() }]} />);
    const trigger = screen.getByRole("button", { name: "Mais ações" });
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(document.activeElement?.textContent).toBe("Remover");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "d" });
    expect(document.activeElement?.textContent).toBe("Duplicar");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
