// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip";

afterEach(cleanup);

describe("Tooltip", () => {
  it("descreve o gatilho, aparece no foco e some com Esc/blur", async () => {
    render(<Tooltip content="Mês fechado"><button type="button" aria-label="Editar">✎</button></Tooltip>);
    const button = screen.getByRole("button", { name: "Editar" });
    const tip = document.getElementById(button.getAttribute("aria-describedby")!)!;
    expect(tip.getAttribute("role")).toBe("tooltip");
    expect(tip.hidden).toBe(true);
    fireEvent.focus(button);
    await waitFor(() => expect(tip.hidden).toBe(false));
    expect(screen.getByRole("tooltip").textContent).toBe("Mês fechado");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(tip.hidden).toBe(true);
    fireEvent.focus(button);
    await waitFor(() => expect(tip.hidden).toBe(false));
    fireEvent.blur(button);
    expect(tip.hidden).toBe(true);
  });
});
