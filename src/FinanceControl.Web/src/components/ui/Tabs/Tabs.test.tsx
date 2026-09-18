// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";

afterEach(cleanup);

const TABS = [
  { id: "resumo", label: "Resumo", content: <p>Painel resumo</p> },
  { id: "categorias", label: "Categorias", content: <p>Painel categorias</p> },
  { id: "bloqueada", label: "Bloqueada", disabled: true, content: <p>x</p> },
  { id: "patrimonio", label: "Patrimônio", content: <p>Painel patrimônio</p> },
];

describe("Tabs (APG)", () => {
  it("ativação automática com setas, pulando desativadas; painel ligado à aba", () => {
    render(<Tabs aria-label="Relatório" tabs={TABS} />);
    const first = screen.getByRole("tab", { name: "Resumo" });
    expect(first.getAttribute("aria-selected")).toBe("true");
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(first.id);
    fireEvent.keyDown(first, { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("tab", { name: "Categorias" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Patrimônio" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Painel patrimônio");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Patrimônio" }), { key: "Home" });
    expect(document.activeElement).toBe(first);
  });

  it("ativação manual exige Enter", () => {
    render(<Tabs aria-label="Visão" activation="manual" tabs={TABS} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Resumo" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Resumo" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Categorias" }), { key: "Enter" });
    expect(screen.getByRole("tab", { name: "Categorias" }).getAttribute("aria-selected")).toBe("true");
  });
});
