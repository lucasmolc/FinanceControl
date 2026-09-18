// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuidedTour } from "./GuidedTour";
import { availableSteps, stepContent, tourSteps } from "./tourSteps";

afterEach(cleanup);

function Harness({ onDone, withChecklist = true }: { onDone: () => void; withChecklist?: boolean }) {
  const [run, setRun] = useState(false);
  return <>
    <button type="button" onClick={() => setRun(true)}>Abrir tour</button>
    <div className="tour-summary">Resumo</div>
    {withChecklist && <div className="tour-checklist">Contas</div>}
    <div className="tour-goals" style={{ display: "none" }}>Metas</div>
    <GuidedTour run={run} onDone={() => { setRun(false); onDone(); }} />
  </>;
}

describe("ordem e texto no celular (R4-TOUR-1)", () => {
  const place = (element: Element, top: number) => { element.getBoundingClientRect = () => ({ top, left: 0, width: 10, height: 10, right: 10, bottom: top + 10, x: 0, y: top, toJSON: () => ({}) }); };

  it("segue a posição na página e deixa a barra fixa para o fim", () => {
    const root = document.createElement("div");
    root.innerHTML = '<button class="command-palette-trigger"></button><div class="tour-summary"></div><button class="quick-add" style="position: fixed"></button><div class="tour-goals"></div><div class="tour-checklist"></div><div class="tour-plan"></div>';
    place(root.querySelector(".command-palette-trigger")!, 20);
    document.body.append(root);
    place(root.querySelector(".tour-summary")!, 100);
    place(root.querySelector(".tour-plan")!, 2700);
    place(root.querySelector(".tour-checklist")!, 600);
    place(root.querySelector(".tour-goals")!, 2300);
    place(root.querySelector(".quick-add")!, 5);
    expect(availableSteps(root).map(step => step.title)).toEqual(["Resumo do mês", "Registrar um lançamento", "Buscar e comandos", "Seu plano", "Próximos vencimentos", "Metas"]);
    expect(availableSteps(root, true).map(step => step.title)).toEqual(["Resumo do mês", "Próximos vencimentos", "Metas", "Seu plano", "Registrar um lançamento", "Buscar e comandos"]);
    root.remove();
  });

  it("no toque não fala de teclado", () => {
    const quickAdd = tourSteps.find(step => step.title === "Registrar um lançamento")!;
    const search = tourSteps.find(step => step.title === "Buscar e comandos")!;
    expect(stepContent(quickAdd, true)).not.toMatch(/teclado/);
    expect(stepContent(search, true)).not.toMatch(/Ctrl|teclado/);
    expect(stepContent(search, false)).toMatch(/Ctrl K/);
  });
});

describe("tour guiado", () => {
  it("mostra só etapas com alvo visível e foca o popover", () => {
    render(<Harness onDone={vi.fn()} withChecklist={false} />);
    const opener = screen.getByRole("button", { name: "Abrir tour" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Resumo do mês" });
    expect(document.activeElement).toBe(dialog);
    expect(screen.getByText("Etapa 1 de 1")).toBeTruthy();
    expect(document.querySelector(".tour-summary")?.classList.contains("tour-highlight")).toBe(true);
    expect(screen.getByRole("button", { name: "Concluir" })).toBeTruthy();
  });

  it("anda com as setas e esconde Voltar na primeira etapa (R1-TOUR-2/3)", () => {
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir tour" }));
    expect(screen.queryByRole("button", { name: "Voltar" })).toBeNull();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByRole("dialog", { name: "Próximos vencimentos" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Voltar" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByRole("dialog", { name: "Resumo do mês" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Próximos vencimentos" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("Escape pula o tour e devolve o foco", () => {
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);
    const opener = screen.getByRole("button", { name: "Abrir tour" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByText("Etapa 1 de 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    expect(screen.getByRole("dialog", { name: "Próximos vencimentos" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDone).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.querySelector(".tour-highlight")).toBeNull();
  });
});
