// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "../lib/preferences";
import { resetPreferencesForTests, setPreferences } from "../lib/preferencesStore";
import { Money, MoneyInput } from "./ui";

afterEach(() => { cleanup(); resetPreferencesForTests(); });

const plain = (text: string | null) => (text ?? "").replace(/\s/g, " ");

function Controlled({ currency }: { currency?: string }) {
  const [value, setValue] = useState("");
  return <MoneyInput aria-label="Valor" currency={currency} value={value} onChange={setValue} />;
}

describe("Money e MoneyInput (MEL-26/30)", () => {
  it("formata na moeda e oculta no modo privado", () => {
    const { container, rerender } = render(<Money cents={500_000} currency="BTC" />);
    expect(plain(container.textContent)).toBe("₿ 0,005");
    rerender(<Money cents={-1050} currency="USD" signed />);
    expect(plain(container.textContent)).toBe("−US$ 10,50");
    expect(container.querySelector(".money")!.className).toContain("negative");

    act(() => { setPreferences({ ...DEFAULT_PREFERENCES, hide_values: true }); });
    expect(plain(screen.getByRole("img", { name: "Valor oculto" }).textContent)).toBe("US$ •••••");
    rerender(<Money cents={100} reveal />);
    expect(plain(container.textContent)).toBe("R$ 1,00");
  });

  it("usa o símbolo e as casas da moeda ao reformatar", () => {
    const { container } = render(<Controlled currency="BTC" />);
    expect(container.querySelector(".money-input > span")!.textContent).toBe("₿");
    const input = screen.getByLabelText("Valor") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0.00500" } });
    fireEvent.blur(input);
    expect(input.value).toBe("0,005");
    cleanup();

    render(<Controlled currency="JPY" />);
    const yen = screen.getByLabelText("Valor") as HTMLInputElement;
    expect(yen.placeholder).toBe("0");
    fireEvent.change(yen, { target: { value: "12000" } });
    fireEvent.blur(yen);
    expect(yen.value).toBe("12.000");
  });
});
