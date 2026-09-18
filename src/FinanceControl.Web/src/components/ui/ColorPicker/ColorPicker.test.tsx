// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ColorPicker } from "./ColorPicker";

afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState("#2fbf8f");
  return <><ColorPicker aria-label="Cor" value={value} onChange={setValue} /><output>{value}</output></>;
}

describe("ColorPicker", () => {
  it("amostras com nomes pt-BR; setas movem e escolhem", () => {
    render(<Harness />);
    const current = screen.getByRole("radio", { name: "Esmeralda" });
    expect(current.getAttribute("aria-checked")).toBe("true");
    expect(current.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(current, { key: "ArrowRight" });
    expect(screen.getByText("#57c785", { selector: "output" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Verde" }));
  });

  it("campo hexadecimal aceita cor personalizada e avisa formato inválido", () => {
    render(<Harness />);
    const hex = screen.getByRole("textbox", { name: "Cor personalizada (hexadecimal)" });
    fireEvent.change(hex, { target: { value: "123abc" } });
    expect(screen.getByText("#123abc", { selector: "output" })).toBeTruthy();
    fireEvent.change(hex, { target: { value: "#12" } });
    fireEvent.blur(hex);
    expect(screen.getByRole("alert").textContent).toBe("Use o formato #rrggbb.");
  });
});
