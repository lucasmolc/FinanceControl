// @vitest-environment jsdom

import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Drawer } from "./Drawer";

afterEach(cleanup);

function Page() {
  const [open, setOpen] = useState(false);
  return <>
    <main className="main"><button type="button" onClick={() => setOpen(true)}>Ver detalhes</button></main>
    <Drawer open={open} onClose={() => setOpen(false)} title="Detalhes" description="Mercado do bairro" footer={<button type="button" onClick={() => setOpen(false)}>Salvar</button>}>
      <label htmlFor="d-desc">Descrição</label><input id="d-desc" />
    </Drawer>
  </>;
}

const flush = () => act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));

describe("Drawer", () => {
  it("diálogo modal rotulado no host de diálogos; foco no primeiro campo; Tab preso; Esc fecha e devolve o foco", async () => {
    render(<Page />);
    const trigger = screen.getByRole("button", { name: "Ver detalhes" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Detalhes" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.closest("[data-dialog-host]")).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("Mercado do bairro");
    await flush();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Descrição" }));
    const save = screen.getByRole("button", { name: "Salvar" });
    save.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
