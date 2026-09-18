// @vitest-environment jsdom

import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Plus } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("renderiza variante, tamanho, ícone e type=button por padrão", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref} variant="primary" size="sm" icon={Plus}>Novo lançamento</Button>);
    const button = screen.getByRole("button", { name: "Novo lançamento" });
    expect(ref.current).toBe(button);
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("btn");
    expect(button.className).toContain("primary");
    expect(button.className).toContain("small");
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("carregando: aria-busy, desativado e sem clique", () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Salvar</Button>);
    const button = screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement;
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
