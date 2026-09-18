// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

afterEach(cleanup);

describe("Switch", () => {
  it("role=switch com rótulo e descrição; clique alterna", () => {
    const onChange = vi.fn();
    render(<Switch label="Débito automático" description="Lançado no vencimento." onChange={onChange} />);
    const control = screen.getByRole("switch", { name: "Débito automático" });
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(document.getElementById(control.getAttribute("aria-describedby")!)?.textContent).toBe("Lançado no vencimento.");
    fireEvent.click(control);
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("controlado não muda sozinho; desativado não alterna", () => {
    const onChange = vi.fn();
    render(<><Switch aria-label="Controlado" checked={false} onChange={onChange} /><Switch aria-label="Desativado" disabled onChange={onChange} /></>);
    fireEvent.click(screen.getByRole("switch", { name: "Controlado" }));
    expect(screen.getByRole("switch", { name: "Controlado" }).getAttribute("aria-checked")).toBe("false");
    expect(onChange).toHaveBeenCalledWith(true);
    onChange.mockClear();
    fireEvent.click(screen.getByRole("switch", { name: "Desativado" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
