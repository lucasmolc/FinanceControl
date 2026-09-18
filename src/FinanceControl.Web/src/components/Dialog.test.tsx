// @vitest-environment jsdom

import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog } from "./Dialog";

afterEach(cleanup);

/** Page whose trigger disappears while the dialog is open (e.g. saving from an empty state). */
function Page({ withHeader = true }: { withHeader?: boolean }) {
  const [open, setOpen] = useState(false);
  const [empty, setEmpty] = useState(true);
  return <>
    <div className="shell"><main className="main">
      {withHeader && <div className="page-header"><div className="page-header-text"><h2>Seus cartões</h2></div></div>}
      {empty ? <button type="button" onClick={() => setOpen(true)}>Novo cartão</button> : <p>Cartão salvo</p>}
    </main></div>
    {open && <Dialog title="Novo cartão" onClose={() => setOpen(false)} footer={<>
      <button type="button" onClick={() => { setEmpty(false); setOpen(false); }}>Salvar</button>
      <button type="button" onClick={() => setOpen(false)}>Cancelar</button>
    </>}><input aria-label="Nome" /></Dialog>}
  </>;
}

describe("MEL-08 · foco ao fechar diálogos", () => {
  it("volta ao gatilho quando ele continua na página", () => {
    render(<Page />);
    const trigger = screen.getByRole("button", { name: "Novo cartão" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(document.activeElement).toBe(trigger);
  });

  it("foca o título da página quando o gatilho sumiu, nunca o body", () => {
    render(<Page />);
    const trigger = screen.getByRole("button", { name: "Novo cartão" });
    trigger.focus();
    fireEvent.click(trigger);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Salvar" })); });
    expect(screen.queryByRole("button", { name: "Novo cartão" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Seus cartões" }));
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });

  it("usa o main quando a página não tem cabeçalho", () => {
    render(<Page withHeader={false} />);
    const trigger = screen.getByRole("button", { name: "Novo cartão" });
    trigger.focus();
    fireEvent.click(trigger);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Salvar" })); });
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(document.activeElement).not.toBe(document.body);
  });
});

/** Page with a dialog that can open a nested one (e.g. a record form asking for confirmation). */
function Nested() {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return <>
    <div className="shell"><main className="main"><button type="button" onClick={() => setOuter(true)}>Abrir</button></main></div>
    {outer && <Dialog title="Externo" onClose={() => setOuter(false)} footer={<button type="button" onClick={() => setInner(true)}>Confirmar algo</button>}>
      <input aria-label="Campo externo" />
    </Dialog>}
    {inner && <Dialog title="Interno" onClose={() => setInner(false)} footer={<button type="button" onClick={() => setInner(false)}>Ok</button>}>
      <p>Tem certeza?</p>
    </Dialog>}
  </>;
}

describe("MEL-18 · portal único para diálogos", () => {
  it("renderiza no host do body, fora da página, e deixa o resto inerte", () => {
    render(<Nested />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    const dialog = screen.getByRole("dialog", { name: "Externo" });
    const host = dialog.closest("[data-dialog-host]");
    expect(host).toBeTruthy();
    expect(host?.parentElement).toBe(document.body);
    expect(document.querySelectorAll("[data-dialog-host]").length).toBe(1);
    expect(dialog.closest(".shell")).toBeNull();
    expect(document.querySelector(".shell")?.closest("[inert]")).toBeTruthy();
    expect(dialog.closest("[inert]")).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("mantém só o diálogo de cima interativo e devolve o foco ao externo", () => {
    render(<Nested />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    const outer = screen.getByRole("dialog", { name: "Externo" });
    const trigger = within(outer).getByRole("button", { name: "Confirmar algo" });
    trigger.focus();
    fireEvent.click(trigger);

    const inner = screen.getByRole("dialog", { name: "Interno" });
    expect(outer.closest("[inert]")).toBeTruthy();
    expect(inner.closest("[inert]")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Interno" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Externo" })).toBeTruthy();
    expect(outer.closest("[inert]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector(".shell")?.closest("[inert]")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".shell")?.closest("[inert]")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("inerte os filhos de #root quando a aplicação está montada nele", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
    try {
      render(<Nested />, { container: root });
      fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
      expect(root.querySelector(".shell")?.hasAttribute("inert")).toBe(true);
      expect(root.hasAttribute("inert")).toBe(false);
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fechar" }));
      expect(root.querySelector(".shell")?.hasAttribute("inert")).toBe(false);
    } finally {
      cleanup();
      root.remove();
    }
  });
});
