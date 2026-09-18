// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Stepper } from "./Stepper";

afterEach(cleanup);

describe("Stepper", () => {
  it("lista ordenada com etapa atual e status; volta por etapas concluídas", () => {
    const onStepClick = vi.fn();
    render(<Stepper current={1} onStepClick={onStepClick} steps={[{ id: "a", label: "Renda" }, { id: "b", label: "Contas" }, { id: "c", label: "Metas" }]} />);
    const list = screen.getByRole("list", { name: "Etapas" });
    const items = list.querySelectorAll("li");
    expect(items[1]!.getAttribute("aria-current")).toBe("step");
    expect(items[0]!.textContent).toContain("concluída");
    expect(items[2]!.textContent).toContain("pendente");
    fireEvent.click(screen.getByRole("button", { name: /Renda/ }));
    expect(onStepClick).toHaveBeenCalledWith(0);
    expect(screen.queryByRole("button", { name: /Metas/ })).toBeNull();
  });
});
