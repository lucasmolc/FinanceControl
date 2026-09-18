// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card } from "./Card";

afterEach(cleanup);

describe("Card", () => {
  it("section rotulada pelo título, ações e rodapé", () => {
    render(<Card as="section" title="Contas" description="Saldos" actions={<button type="button">Nova conta bancária</button>} footer={<span>Total</span>}>Corpo</Card>);
    const region = screen.getByRole("region", { name: "Contas" });
    expect(region.className).toContain("card");
    expect(screen.getByRole("heading", { level: 2, name: "Contas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nova conta bancária" })).toBeTruthy();
  });

  it("variante cartão de crédito usa --card-color", () => {
    const { container } = render(<Card variant="credit" color="#820ad1" title="Nubank" />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("visual-card");
    expect(card.style.getPropertyValue("--card-color")).toBe("#820ad1");
  });
});
