// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category, PlanSummary } from "../../types";
import { PlanWidget } from "./PlanWidget";

afterEach(cleanup);

const plan: PlanSummary = { fixed_limit_cents: 910_000, fun_limit_cents: 260_000, invest_min_cents: 130_000, fixed_spent_cents: 770_000, fun_spent_cents: 300_000, invested_cents: 130_000, unbucketed_expense_cents: 12_000 };
const state = { editing: null, switching: false, loading: false };
const spaced = (text: string | null) => (text ?? "").replace(/\s/g, " ");
const categories: Category[] = [
  { id: 3, name: "Corretora", kind: "investment", monthly_budget_cents: 0, active: true, bucket: null },
  { id: 4, name: "Investimentos", kind: "investment", monthly_budget_cents: 0, active: true, bucket: "investimento" },
];

describe("MEL-45 · widget do plano", () => {
  it("mostra realizado × limite com estados e, num mês encerrado, sugere investir a sobra dos fixos", () => {
    const openModal = vi.fn();
    const onOpenCategories = vi.fn();
    render(<PlanWidget plan={plan} hasPlan month="2020-08" current={false} openModal={openModal} onPlanSetup={vi.fn()} onOpenCategories={onOpenCategories} state={state} categories={categories} />);
    const bars = within(screen.getByRole("list", { name: "Partes do plano" })).getAllByRole("listitem");
    expect(bars.map(bar => bar.querySelector("b")!.textContent)).toEqual(["Gastos fixos", "Lazer", "Investimento"]);
    // Decision 1: limits and a minimum, never "teto".
    expect(spaced(bars[0]!.textContent)).toContain("R$ 7.700,00 de R$ 9.100,00 (limite)");
    expect(spaced(bars[2]!.textContent)).toContain("R$ 1.300,00 de R$ 1.300,00 (mínimo)");
    expect(bars[0]!.textContent).toContain("Dentro do limite");
    expect(bars[1]!.textContent).toContain("Acima do limite");
    expect(spaced(bars[1]!.textContent)).toContain("R$ 400,00 acima do limite");
    expect(bars[2]!.textContent).toContain("Mínimo atingido");
    expect(within(bars[1]!).getByRole("progressbar").getAttribute("aria-valuetext")).toBe("115% do limite");
    expect(document.body.textContent).not.toMatch(/teto de fixos|Dentro do teto/);
    expect(spaced(screen.getByText(/a menos que o limite de gastos fixos/).textContent)).toBe("Você gastou R$ 1.400,00 a menos que o limite de gastos fixos. Que tal investir a diferença?");
    fireEvent.click(screen.getByRole("button", { name: "Registrar aporte" }));
    // R1-PAINEL-4: the aporte comes with the investment bucket category.
    expect(openModal).toHaveBeenCalledWith("transaction", expect.objectContaining({ kind: "investment", amount: "1.400,00", payment_method: "transfer", category_id: "4" }));
    fireEvent.click(screen.getByRole("button", { name: /Escolher baldes em Categorias/ }));
    expect(onOpenCategories).toHaveBeenCalledOnce();
  });

  it("R2-PAINEL-4: num mês fechado não convida a investir (o botão só poderia ficar desabilitado)", () => {
    render(<PlanWidget plan={plan} hasPlan month="2020-08" current={false} openModal={vi.fn()} onPlanSetup={vi.fn()} state={state} categories={categories} closed lockedReason="Mês fechado" />);
    expect(screen.queryByText(/Que tal investir/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Registrar aporte" })).toBeNull();
  });

  it("no mês atual só convida quando o ritmo cabe no teto; mês fechado bloqueia o aporte", () => {
    const { rerender } = render(<PlanWidget plan={plan} hasPlan month="2026-09" current openModal={vi.fn()} onPlanSetup={vi.fn()} state={state} forecastStatus="danger" />);
    expect(screen.queryByRole("button", { name: "Registrar aporte" })).toBeNull();
    rerender(<PlanWidget plan={plan} hasPlan month="2026-09" current openModal={vi.fn()} onPlanSetup={vi.fn()} state={state} forecastStatus="ok" />);
    expect(screen.getByText(/Até agora, os gastos fixos estão/)).toBeTruthy();
    rerender(<PlanWidget plan={plan} hasPlan month="2020-08" current={false} openModal={vi.fn()} onPlanSetup={vi.fn()} state={state} lockedReason="Mês fechado" />);
    const button = screen.getByRole("button", { name: "Registrar aporte" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Mês fechado: o aporte não pode ser registrado.")).toBeTruthy();
    rerender(<PlanWidget plan={plan} hasPlan month="2999-01" current={false} openModal={vi.fn()} onPlanSetup={vi.fn()} state={state} />);
    expect(screen.queryByRole("button", { name: "Registrar aporte" })).toBeNull();
  });

  it("sem plano convida a definir", () => {
    const onPlanSetup = vi.fn();
    render(<PlanWidget plan={null} hasPlan={false} month="2026-09" current openModal={vi.fn()} onPlanSetup={onPlanSetup} state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver o plano sugerido" }));
    expect(onPlanSetup).toHaveBeenCalledOnce();
  });
});
