// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RangeField, Slider } from "./Slider";

afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState(110);
  return <RangeField label="Rentabilidade" unit="% do CDI" min={50} max={150} step={5} value={value} onChange={setValue} format={next => `${next}% do CDI`} />;
}

describe("Slider / RangeField", () => {
  it("slider nativo com aria-valuetext", () => {
    render(<Slider aria-label="Meses" value={6} min={1} max={24} onChange={() => undefined} format={value => `${value} meses`} />);
    const slider = screen.getByRole("slider", { name: "Meses" });
    expect(slider.getAttribute("aria-valuetext")).toBe("6 meses");
  });

  it("slider e campo numérico rotulados; valor digitado é limitado e arredondado ao passo", () => {
    render(<Harness />);
    const slider = screen.getByRole("slider", { name: "Rentabilidade" });
    const input = screen.getByRole("textbox", { name: "Rentabilidade" }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "120" } });
    expect(input.value).toBe("120");
    fireEvent.change(input, { target: { value: "133" } });
    fireEvent.blur(input);
    expect((slider as HTMLInputElement).value).toBe("135");
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect((slider as HTMLInputElement).value).toBe("150");
    expect(document.querySelector("output")?.textContent).toBe("150% do CDI");
  });
});
