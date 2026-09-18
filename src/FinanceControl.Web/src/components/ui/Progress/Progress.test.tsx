// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Progress } from "./Progress";

afterEach(cleanup);

describe("Progress", () => {
  it("progressbar com valores e tom automático", () => {
    const { container } = render(<><Progress label="Orçamento" value={62} tone="auto" /><Progress label="Estourado" value={120} tone="auto" valueText="120%" /></>);
    const bar = screen.getByRole("progressbar", { name: "Orçamento" });
    expect(bar.getAttribute("aria-valuenow")).toBe("62");
    expect(bar.getAttribute("aria-valuetext")).toBe("62%");
    const over = screen.getByRole("progressbar", { name: "Estourado" });
    expect(over.getAttribute("aria-valuenow")).toBe("100");
    expect(container.querySelectorAll(".ui-progress")[1]!.className).toContain("tone-danger");
  });

  it("indeterminado não expõe valor", () => {
    render(<Progress label="Carregando" indeterminate />);
    expect(screen.getByRole("progressbar", { name: "Carregando" }).getAttribute("aria-valuenow")).toBeNull();
  });
});
