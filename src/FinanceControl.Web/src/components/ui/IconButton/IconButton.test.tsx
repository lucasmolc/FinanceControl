// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Trash2 } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";

afterEach(cleanup);

describe("IconButton", () => {
  it("tem nome acessível pt-BR, título e tom", () => {
    const onClick = vi.fn();
    render(<IconButton label="Remover Nubank" icon={Trash2} tone="danger" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Remover Nubank" });
    expect(button.getAttribute("title")).toBe("Remover Nubank");
    expect(button.className).toContain("icon-btn");
    expect(button.className).toContain("danger");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("alternância expõe aria-pressed", () => {
    render(<IconButton label="Ocultar valores" icon={Trash2} pressed />);
    expect(screen.getByRole("button", { name: "Ocultar valores" }).getAttribute("aria-pressed")).toBe("true");
  });
});
