// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BrandBadge } from "./BrandBadge";

afterEach(cleanup);

describe("BrandBadge", () => {
  it("monograma estilizado com nome acessível e classe .bank-logo", () => {
    render(<BrandBadge brand="netflix" size="lg" />);
    const badge = screen.getByRole("img", { name: "Netflix" });
    expect(badge.className).toContain("bank-logo");
    expect(badge.className).toContain("size-lg");
    expect(badge.querySelector("text")?.textContent).toBe("N");
  });

  it("detecta pelo nome, marca desconhecida vira selo neutro (sem monograma) e pode ser decorativo", () => {
    const { container } = render(<><BrandBadge name="Assinatura Spotify Família" /><BrandBadge name="Padaria Pão Quente" /><BrandBadge brand="smartfit" decorative /></>);
    const badges = container.querySelectorAll<HTMLElement>(".ui-brand-badge");
    expect(badges[0]!.dataset.brand).toBe("spotify");
    expect(badges[1]!.dataset.brand).toBe("outro");
    expect(badges[1]!.className).toContain("is-generic");
    expect(badges[1]!.querySelector("text")).toBeNull();
    expect(badges[1]!.getAttribute("aria-label")).toBe("Padaria Pão Quente");
    expect(badges[2]!.getAttribute("aria-hidden")).toBe("true");
  });

  it("logo enviada substitui o monograma; se falhar volta ao monograma", () => {
    const { container } = render(<BrandBadge brand="nubank" logo="data:image/png;base64,AAAA" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
