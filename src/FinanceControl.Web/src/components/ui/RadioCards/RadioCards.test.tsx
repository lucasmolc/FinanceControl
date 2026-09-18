// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RadioCards } from "./RadioCards";

afterEach(cleanup);

describe("RadioCards", () => {
  it("grupo de rádios rotulado; escolher chama onChange; desativado bloqueia", () => {
    const onChange = vi.fn();
    render(<RadioCards aria-label="Tipo" value="expense" onChange={onChange} options={[
      { value: "expense", label: "Despesa", description: "Saída" },
      { value: "income", label: "Receita" },
      { value: "investment", label: "Investimento", disabled: true },
    ]} />);
    expect(screen.getByRole("radiogroup", { name: "Tipo" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Despesa" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Receita" }));
    expect(onChange).toHaveBeenCalledWith("income");
    expect((screen.getByRole("radio", { name: "Investimento" }) as HTMLInputElement).disabled).toBe(true);
  });
});
