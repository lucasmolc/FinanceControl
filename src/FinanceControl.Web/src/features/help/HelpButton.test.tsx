// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PageId } from "../../types";
import { HelpButton } from "./HelpButton";
import { helpFor, PAGE_HELP } from "./pageHelp";

afterEach(cleanup);

describe("ajuda da tela", () => {
  it("abre o painel com os assuntos da tela atual", () => {
    render(<HelpButton page="transactions" label="Lançamentos" />);
    const trigger = screen.getByRole("button", { name: "Ajuda desta tela: Lançamentos" });
    fireEvent.click(trigger);

    const panel = screen.getByRole("dialog", { name: "Como usar · Lançamentos" });
    expect(panel.textContent).toContain("Importar fatura ou extrato");
    expect(panel.textContent).toContain("Compra parcelada");
    // A regra de data do gasto é o ponto que mais confunde: precisa estar explicada.
    expect(panel.textContent).toContain("A data é a do gasto, não a da fatura");
    expect(within(panel).getByRole("note").textContent).toContain("Fique de olho");
  });

  it("fecha pelo botão do rodapé", () => {
    render(<HelpButton page="cards" label="Cartões" />);
    fireEvent.click(screen.getByRole("button", { name: "Ajuda desta tela: Cartões" }));
    // O rodapé tem o botão com texto; o "x" do cabeçalho usa aria-label.
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Fechar"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("não aparece em telas sem texto de ajuda", () => {
    render(<HelpButton page="components" label="Componentes" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("toda tela do menu tem ajuda com introdução e assuntos", () => {
    const pages: PageId[] = ["dashboard", "transactions", "bills", "subscriptions", "accounts", "investments", "cards", "goals", "categories", "reports", "projections", "market", "settings"];
    for (const page of pages) {
      const help = helpFor(page);
      expect(help, page).toBeTruthy();
      expect(help!.intro.length, page).toBeGreaterThan(30);
      expect(help!.topics.length, page).toBeGreaterThanOrEqual(3);
      for (const topic of help!.topics) expect(topic.body.length, `${page}/${topic.title}`).toBeGreaterThan(40);
    }
    // A galeria de componentes é só para desenvolvimento e fica de fora.
    expect(PAGE_HELP.components).toBeUndefined();
  });
});
