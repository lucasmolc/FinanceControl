// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Popover } from "./Popover";

afterEach(cleanup);

const flush = () => act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));

describe("Popover", () => {
  it("abre pelo gatilho (aria-expanded), foca o conteúdo e fecha com Esc devolvendo o foco", async () => {
    render(<Popover label="Filtros" trigger={<button type="button">Filtros</button>}>{close => <button type="button" onClick={close}>Aplicar</button>}</Popover>);
    const trigger = screen.getByRole("button", { name: "Filtros" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Filtros" })).toBeTruthy();
    await flush();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Aplicar" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("clique fora fecha; render-prop fecha", () => {
    render(<><Popover label="Filtros" trigger={<button type="button">Filtros</button>}>{close => <button type="button" onClick={close}>Aplicar</button>}</Popover><p>Fora</p></>);
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.pointerDown(screen.getByText("Fora"));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
