// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupWizard } from "../features/setup/SetupWizard";
import { AppShell } from "./AppShell";

afterEach(cleanup);

describe("primeiro uso", () => {
  it("exibe uma saudação neutra e não oferece botão para reiniciar o tour", () => {
    render(<AppShell page="dashboard" name="" onNavigate={vi.fn()}><span>Conteúdo</span></AppShell>);

    expect(screen.getByRole("heading", { name: "Olá!" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /tour/i })).toBeNull();
  });

  it("mantém o nome opcional e informa que nenhum registro será pré-cadastrado", () => {
    render(<SetupWizard onDone={vi.fn()} onSkip={vi.fn()} onError={vi.fn()} />);

    expect((screen.getByRole("textbox", { name: "Nome (opcional)" }) as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/Nada é criado até você confirmar no fim/i)).toBeTruthy();
    expect(screen.queryByDisplayValue(/Usuário|Usuario/i)).toBeNull();
  });

  it("mantém as áreas essenciais no menu móvel, com o “+” no centro (R2-SH-2), e agrupa as demais em Mais", () => {
    const onNavigate = vi.fn();
    const onQuickAdd = vi.fn();
    render(<AppShell page="dashboard" name="" onNavigate={onNavigate} onQuickAdd={onQuickAdd}><span>Conteúdo</span></AppShell>);

    const mobileNav = screen.getByRole("navigation", { name: "Navegação móvel" });
    const slots = Array.from(mobileNav.querySelectorAll(":scope > a, :scope > button, :scope > .mobile-more"));
    expect(slots).toHaveLength(5);
    expect(slots[2]!.getAttribute("aria-label")).toBe("Novo lançamento");
    fireEvent.click(slots[2]!);
    expect(onQuickAdd).toHaveBeenCalledOnce();
    expect(mobileNav.querySelector("#mobile-more-panel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    expect(within(screen.getByRole("group", { name: "Mais páginas" })).getByRole("link", { name: "Metas" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Mais páginas" })).getByRole("link", { name: "Investimentos" }));

    expect(onNavigate).toHaveBeenCalledWith("investments");
    expect(mobileNav.querySelector("#mobile-more-panel")).toBeNull();
  });
});

describe("MEL-01 · painel Mais", () => {
  it("fica depois do botão, foca o primeiro item ao abrir e devolve o foco ao fechar com Escape", () => {
    render(<AppShell page="dashboard" name="" onNavigate={vi.fn()}><span>Conteúdo</span></AppShell>);
    const toggle = screen.getByRole("button", { name: "Mais" });
    fireEvent.click(toggle);
    const panel = screen.getByRole("group", { name: "Mais páginas" });
    expect(toggle.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.activeElement).toBe(within(panel).getAllByRole("link")[0]);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Mais páginas" })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it("devolve o foco ao botão ao escolher uma área ou clicar fora", () => {
    const onNavigate = vi.fn();
    render(<AppShell page="dashboard" name="" onNavigate={onNavigate}><span>Conteúdo</span></AppShell>);
    const toggle = screen.getByRole("button", { name: "Mais" });
    fireEvent.click(toggle);
    fireEvent.click(within(screen.getByRole("group", { name: "Mais páginas" })).getByRole("link", { name: "Cartões" }));
    expect(onNavigate).toHaveBeenCalledWith("cards");
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);
    fireEvent.pointerDown(screen.getByText("Conteúdo"));
    expect(screen.queryByRole("group", { name: "Mais páginas" })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it("área secundária ativa: “Mais” fica destacado e o nome vai no rótulo acessível, sem cortar (CR-29)", () => {
    render(<AppShell page="investments" name="" onNavigate={vi.fn()}><span>Conteúdo</span></AppShell>);
    const mobileNav = screen.getByRole("navigation", { name: "Navegação móvel" });
    const toggle = within(mobileNav).getByRole("button", { name: "Mais · Investimentos" });
    expect(toggle.textContent).toBe("Mais");
    expect(toggle.className).toContain("active");
  });

  it("MEL-49: a marca é um link para a Visão geral pela navegação do app", () => {
    const onNavigate = vi.fn();
    render(<AppShell page="goals" name="" onNavigate={onNavigate}><span>Conteúdo</span></AppShell>);
    const [sidebarBrand] = screen.getAllByRole("link", { name: "LMM Finance — ir para a Visão geral" });
    expect(sidebarBrand!.getAttribute("href")).toBe("#/painel");
    expect(fireEvent.click(sidebarBrand!)).toBe(false); // default prevented: no reload, no raw hash change
    expect(onNavigate).toHaveBeenCalledWith("dashboard");
    onNavigate.mockClear();
    fireEvent.click(sidebarBrand!, { ctrlKey: true }); // new tab keeps the browser behaviour
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("R2-SH-3: os itens da navegação são links para a rota; clique simples navega pelo app, Ctrl-clique fica com o navegador", () => {
    const onNavigate = vi.fn();
    render(<AppShell page="dashboard" name="" onNavigate={onNavigate}><span>Conteúdo</span></AppShell>);
    const link = within(screen.getByRole("navigation", { name: "Navegação principal" })).getByRole("link", { name: "Metas" });
    expect(link.getAttribute("href")).toBe("#/metas");
    expect(fireEvent.click(link)).toBe(false);
    expect(onNavigate).toHaveBeenCalledWith("goals");
    onNavigate.mockClear();
    fireEvent.click(link, { ctrlKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(within(screen.getByRole("navigation", { name: "Navegação principal" })).getByRole("link", { name: "Visão geral" }).getAttribute("aria-current")).toBe("page");
  });

  it("marca o conteúdo principal como ocupado durante a atualização (MEL-07)", () => {
    const { rerender } = render(<AppShell page="dashboard" name="" onNavigate={vi.fn()} busy><span>Conteúdo</span></AppShell>);
    expect(screen.getByRole("main").getAttribute("aria-busy")).toBe("true");
    rerender(<AppShell page="dashboard" name="" onNavigate={vi.fn()}><span>Conteúdo</span></AppShell>);
    expect(screen.getByRole("main").hasAttribute("aria-busy")).toBe(false);
  });
});
