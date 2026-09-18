// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";

afterEach(cleanup);

describe("Checkbox", () => {
  it("checkbox nativo rotulado; onChange recebe o estado", () => {
    const onChange = vi.fn();
    render(<Checkbox label="Recorrente" description="Repete todo mês." onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Recorrente" });
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true, expect.anything());
    expect(document.getElementById(box.getAttribute("aria-describedby")!)?.textContent).toBe("Repete todo mês.");
  });

  it("estado indeterminado", () => {
    render(<Checkbox aria-label="Selecionar todos" indeterminate checked={false} onChange={() => undefined} />);
    expect((screen.getByRole("checkbox", { name: "Selecionar todos" }) as HTMLInputElement).indeterminate).toBe(true);
  });
});
