// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Segmented } from "./Segmented";

afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState("6");
  return <Segmented aria-label="Período" value={value} onChange={setValue} options={[{ value: "6", label: "6 meses" }, { value: "12", label: "12 meses" }, { value: "24", label: "24 meses", disabled: true }, { value: "36", label: "36 meses" }]} />;
}

describe("Segmented", () => {
  it("radiogroup com tabindex móvel; setas movem, selecionam e pulam desativados", () => {
    render(<Harness />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map(radio => radio.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
    radios[0]!.focus();
    fireEvent.keyDown(radios[0]!, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "12 meses" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(screen.getByRole("radio", { name: "12 meses" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "36 meses" }).getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "36 meses" }));
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(screen.getByRole("radio", { name: "6 meses" }).getAttribute("aria-checked")).toBe("true");
  });
});
