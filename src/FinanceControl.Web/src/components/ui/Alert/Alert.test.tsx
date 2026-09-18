// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Alert } from "./Alert";

afterEach(cleanup);

describe("Alert", () => {
  it("perigo usa role=alert; demais role=status; fechar", () => {
    const onDismiss = vi.fn();
    render(<><Alert tone="danger" title="Falhou" onDismiss={onDismiss}>Tente de novo.</Alert><Alert tone="success" title="Salvo" /></>);
    expect(screen.getByRole("alert").textContent).toContain("Falhou");
    expect(screen.getByRole("status").textContent).toContain("Salvo");
    fireEvent.click(screen.getByRole("button", { name: "Fechar aviso" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
