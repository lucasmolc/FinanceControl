// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Badge, Tag } from "./Badge";

afterEach(cleanup);

describe("Badge / Tag", () => {
  it("badge mantém as classes legadas de tom", () => {
    render(<Badge tone="positive" dot>Pago</Badge>);
    expect(screen.getByText("Pago").className).toContain("badge");
    expect(screen.getByText("Pago").className).toContain("positive");
  });

  it("tag removível com rótulo pt-BR", () => {
    const onRemove = vi.fn();
    render(<Tag onRemove={onRemove}>Mercado</Tag>);
    fireEvent.click(screen.getByRole("button", { name: "Remover Mercado" }));
    expect(onRemove).toHaveBeenCalled();
  });
});
