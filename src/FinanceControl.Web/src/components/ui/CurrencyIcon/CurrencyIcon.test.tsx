// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { currencies } from "../../../lib/currencies";
import { CurrencyIcon } from "./CurrencyIcon";

afterEach(cleanup);

describe("CurrencyIcon (MEL-36)", () => {
  it("toda moeda do catálogo tem ícone próprio com nome pt-BR", () => {
    render(<>{currencies.map(currency => <CurrencyIcon key={currency.code} code={currency.code} />)}</>);
    for (const currency of currencies) {
      const icon = screen.getByRole("img", { name: currency.name });
      expect(icon.dataset.currency).toBe(currency.code);
      expect(icon.className).not.toContain("is-unknown");
      expect(icon.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("decorativo ao lado do código; desconhecida usa selo neutro com as letras", () => {
    const { container } = render(<><CurrencyIcon code="USD" decorative size={16} /><CurrencyIcon code="XYZ" /></>);
    const usd = container.querySelector<HTMLElement>("[data-currency=USD]")!;
    expect(usd.getAttribute("aria-hidden")).toBe("true");
    expect(usd.style.width).toBe("16px");
    const unknown = screen.getByRole("img", { name: "XYZ" });
    expect(unknown.className).toContain("is-unknown");
    expect(unknown.querySelector("text")?.textContent).toBe("XYZ");
  });
});
