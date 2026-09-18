// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Skeleton } from "./Skeleton";

afterEach(cleanup);

describe("Skeleton", () => {
  it("anuncia o rótulo e esconde os blocos do leitor de tela", () => {
    const { container } = render(<Skeleton label="Carregando lançamentos…" lines={3} />);
    expect(screen.getByRole("status").textContent).toBe("Carregando lançamentos…");
    const blocks = container.querySelectorAll(".skeleton");
    expect(blocks.length).toBe(3);
    expect(Array.from(blocks).every(block => block.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});
