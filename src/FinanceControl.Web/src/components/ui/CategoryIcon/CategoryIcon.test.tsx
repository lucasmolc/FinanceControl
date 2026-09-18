// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CategoryIcon } from "./CategoryIcon";

afterEach(cleanup);

describe("CategoryIcon", () => {
  it("decorativo por padrão; com rótulo vira role=img", () => {
    const { container } = render(<CategoryIcon icon="academia" />);
    const span = container.firstElementChild as HTMLElement;
    expect(span.getAttribute("aria-hidden")).toBe("true");
    expect(span.dataset.icon).toBe("academia");
    render(<CategoryIcon icon="mercado" label="Mercado" color="#ff0000" />);
    const img = screen.getByRole("img", { name: "Mercado" });
    expect(img.style.getPropertyValue("--icon-color")).toBe("#ff0000");
  });

  it("detecta pelo nome e cai em 'outros'", () => {
    const { container } = render(<><CategoryIcon name="Conta de luz" /><CategoryIcon icon="inexistente" /></>);
    const spans = container.querySelectorAll<HTMLElement>(".ui-category-icon");
    expect(spans[0]!.dataset.icon).toBe("energia");
    expect(spans[1]!.dataset.icon).toBe("outros");
  });
});
