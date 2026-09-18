// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KpiDelta, Stat } from "./Stat";

afterEach(cleanup);

describe("Stat / KpiDelta", () => {
  it("variação com seta, sinal e texto (nunca só cor)", () => {
    const { container } = render(<><KpiDelta value={0.123} context="vs. mês anterior" /><KpiDelta value={-0.05} invert /><KpiDelta value={0} /></>);
    const [up, down, flat] = Array.from(container.querySelectorAll<HTMLElement>(".kpi-delta"));
    expect(up!.className).toContain("up");
    expect(up!.className).toContain("is-good");
    expect(up!.textContent).toContain("+12,3%");
    expect(up!.textContent).toContain("Alta de 12,3% vs. mês anterior");
    expect(down!.className).toContain("is-good");
    expect(down!.textContent).toContain("Queda de 5,0%");
    expect(flat!.textContent).toContain("Estável");
  });

  it("stat com rótulo, valor e carregamento", () => {
    render(<><Stat label="Gastos" value="R$ 10,00" delta={{ value: 0.1, invert: true }} /><Stat label="Saldo" value="—" loading /></>);
    expect(screen.getByText("R$ 10,00")).toBeTruthy();
    expect(document.querySelector(".is-bad")).toBeTruthy();
    expect(screen.getByText("Carregando…")).toBeTruthy();
  });
});
