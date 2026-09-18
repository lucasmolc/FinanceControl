// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComponentsPage } from "./ComponentsPage";

afterEach(cleanup);

describe("Galeria de componentes (#/componentes)", () => {
  it("mostra todas as seções e troca o tema da pré-visualização, restaurando ao sair", () => {
    document.documentElement.dataset.theme = "noite";
    const notify = vi.fn();
    const { unmount } = render(<ComponentsPage notify={notify} />);
    for (const title of ["Botões e ações", "Entrada de dados", "Navegação", "Feedback", "Dados", "Ícones, marcas e moedas"]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("radio", { name: "Claro" }));
    expect(document.documentElement.dataset.theme).toBe("claro");
    fireEvent.click(screen.getByRole("switch", { name: "Animações" }));
    expect(document.documentElement.dataset.motion).toBe("off");
    unmount();
    expect(document.documentElement.dataset.theme).toBe("noite");
  });
});
