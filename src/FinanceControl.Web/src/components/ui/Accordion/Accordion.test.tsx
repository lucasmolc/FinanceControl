// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Accordion } from "./Accordion";

afterEach(cleanup);

const ITEMS = [
  { id: "a", title: "Moradia", content: <p>Aluguel</p> },
  { id: "b", title: "Alimentação", content: <p>Mercado</p> },
  { id: "c", title: "Lazer", content: <p>Cinema</p> },
];

describe("Accordion (APG)", () => {
  it("botões com aria-expanded controlando regiões; setas movem entre cabeçalhos", () => {
    render(<Accordion items={ITEMS} defaultValue={["a"]} />);
    const moradia = screen.getByRole("button", { name: "Moradia" });
    expect(moradia.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "Moradia" }).textContent).toBe("Aluguel");
    fireEvent.click(screen.getByRole("button", { name: "Alimentação" }));
    expect(screen.getByRole("region", { name: "Alimentação" })).toBeTruthy();
    fireEvent.keyDown(moradia, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Lazer" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(moradia);
  });

  it("modo único fecha o anterior", () => {
    render(<Accordion items={ITEMS} multiple={false} defaultValue={["a"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Lazer" }));
    expect(screen.getByRole("button", { name: "Moradia" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: "Lazer" }).getAttribute("aria-expanded")).toBe("true");
  });
});
