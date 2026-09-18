// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectionBase } from "../../api/insights";
import { DEFAULT_PREFERENCES } from "../../lib/preferences";
import { resetPreferencesForTests, setPreferences } from "../../lib/preferencesStore";
import { makePageProps } from "../../test/fixtures";
import { ProjectionsPage } from "./ProjectionsPage";

const base: ProjectionBase = {
  as_of: "2026-09-17", currency: "BRL",
  starting: { bank_cents: 100_000, investments_cents: 0, total_cents: 100_000 },
  income: { planned_monthly_cents: 500_000, avg_3m_cents: 450_000, avg_6m_cents: 420_000 },
  expenses: { planned_limit_cents: 400_000, bills_monthly_cents: 150_000, subscriptions_monthly_cents: 5_000, avg_3m_cents: 380_000, avg_6m_cents: 390_000 },
  investment_contribution_avg_3m_cents: 0,
  indicators: { selic_pct: 15, cdi_pct: 0, ipca_12m_pct: 0 },
  goals: [
    { id: 1, name: "Viagem", target_cents: 300_000, current_cents: 100_000, currency: "BRL", base_target_cents: 300_000, base_current_cents: 100_000, target_date: "2026-10-31" },
    { id: 2, name: "Carro", target_cents: 9_000_000, current_cents: 0, currency: "BRL", base_target_cents: 9_000_000, base_current_cents: 0, target_date: null },
  ],
  emergency: { months_target: 6, monthly_limit_cents: 400_000, reserve_target_cents: 500_000 },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/projections/base") return json(base);
    if (url.startsWith("/api/reports?")) return json({ net_worth: [{ month: "2026-08", total_cents: 80_000, bank_cents: 80_000, investments_cents: 0 }] });
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => { cleanup(); resetPreferencesForTests(); vi.unstubAllGlobals(); });

describe("ProjectionsPage", () => {
  it("projeta o patrimônio, os marcos e a tabela mês a mês", async () => {
    render(<ProjectionsPage {...makePageProps()} />);
    const kpis = await screen.findByLabelText("Resultado da projeção");
    // +R$ 1.000 per month without yield: 12 months → R$ 13.000.
    expect(within(kpis).getByText("Patrimônio em 12 meses").parentElement?.textContent).toMatch(/R\$\s13\.000,00/);
    const milestones = screen.getByRole("region", { name: "Marcos" });
    expect(within(milestones).getByText(/≈ 01\/2027/)).toBeTruthy();
    const trip = within(milestones).getByText("Viagem").closest("li") as HTMLElement;
    expect(within(trip).getByText("Depois do prazo")).toBeTruthy();
    const car = within(milestones).getByText("Carro").closest("li") as HTMLElement;
    expect(within(car).getByText("Fora do horizonte")).toBeTruthy();
    // R1-PRJ-3: beyond the horizon every milestone gives the long estimate (or "Além de 50 anos"), never "—".
    expect(car.querySelector(".milestone-when")!.textContent).toMatch(/^≈ \d{2}\/\d{4} \(\d+ anos?( e \d+ m(ês|eses))?\)$/);
    expect(milestones.textContent).not.toContain("—");
    const table = screen.getByRole("region", { name: "Mês a mês" });
    expect(within(table).queryByRole("row")).toBeNull();
    fireEvent.click(within(table).getByRole("button", { name: "Mostrar tabela" }));
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(within(kpis).getByText("Sobra antes dos aportes")).toBeTruthy();
    expect(within(milestones).getByText(/Critério: patrimônio total de R\$\s5\.000,00/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Patrimônio projetado\./ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/reports?from=2026-04&to=2026-09", undefined);
  });

  it("muda horizonte e cenário, recalculando na hora", async () => {
    render(<ProjectionsPage {...makePageProps()} />);
    await screen.findByLabelText("Resultado da projeção");
    const horizon = screen.getByRole("radiogroup", { name: "Horizonte da projeção" });
    expect(within(horizon).getByRole("radio", { name: "12 meses" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(horizon).getByRole("radio", { name: "36 meses" }));
    expect(within(horizon).getByRole("radio", { name: "36 meses" }).getAttribute("aria-checked")).toBe("true");
    const table = screen.getByRole("region", { name: "Mês a mês" });
    fireEvent.click(within(table).getByRole("button", { name: "Mostrar tabela" }));
    expect(within(table).getAllByRole("row")).toHaveLength(37);
    const expenseBasis = screen.getByRole("radiogroup", { name: "Base dos gastos: usar como referência" });
    fireEvent.click(within(expenseBasis).getByRole("radio", { name: "Contas" }));
    expect(within(expenseBasis).getByRole("radio", { name: "Contas" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("Gastos mensais") as HTMLInputElement).value).toBe("1.550,00");
    fireEvent.change(screen.getByLabelText("Renda mensal"), { target: { value: "abc" } });
    expect(screen.getByText(/Informe um valor válido/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Renda mensal"), { target: { value: "1.000,00" } });
    await waitFor(() => expect(screen.getByText(/Os gastos superam a renda/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Restaurar cenário/ }));
    expect((screen.getByLabelText("Renda mensal") as HTMLInputElement).value).toBe("5.000,00");
    expect(screen.queryByText(/Os gastos superam a renda/)).toBeNull();
  });

  it("ajusta a rentabilidade pelo slider com texto acessível", async () => {
    render(<ProjectionsPage {...makePageProps()} />);
    await screen.findByLabelText("Resultado da projeção");
    const slider = screen.getByRole("slider", { name: "Rentabilidade dos investimentos" });
    expect(slider.className).toContain("ui-slider");
    fireEvent.change(slider, { target: { value: "120" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("120% do CDI");
    expect(screen.getByText("120% do CDI", { selector: "output" })).toBeTruthy();
  });

  it("oculta valores nas dicas e no aviso no modo privacidade", async () => {
    setPreferences({ ...DEFAULT_PREFERENCES, hide_values: true });
    render(<ProjectionsPage {...makePageProps()} />);
    const kpis = await screen.findByLabelText("Resultado da projeção");
    expect(within(kpis).getByText(/Hoje: R\$\s•••••/)).toBeTruthy();
    expect(screen.getByText(/patrimônio total de R\$\s•••••/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Renda mensal"), { target: { value: "1.000,00" } });
    const warning = await screen.findByText(/Os gastos superam a renda/);
    expect(warning.textContent).toMatch(/cai R\$\s•••••/);
    expect(warning.closest(".ui-alert")?.className).toContain("tone-warning");
  });

  it("mostra erro com nova tentativa", async () => {
    fetchMock.mockImplementation(async () => json({ title: "Erro" }, 500));
    render(<ProjectionsPage {...makePageProps()} />);
    expect(await screen.findByText("Não foi possível carregar a projeção")).toBeTruthy();
  });
});

describe("CR-04 e MEL-45 · marcos da reserva e do número da liberdade", () => {
  it("usa só a meta vinculada como marco da reserva e não a repete entre as metas", async () => {
    const reserveGoal = { id: 3, name: "Reserva de Emergência", target_cents: 500_000, current_cents: 200_000, currency: "BRL", base_target_cents: 500_000, base_current_cents: 200_000, target_date: null };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => String(input) === "/api/projections/base" ? json({ ...base, goals: [...base.goals, reserveGoal] }) : json({ net_worth: [] }));
    const settings = { ...makePageProps().state.settings, emergency_goal_id: 3 };
    render(<ProjectionsPage {...makePageProps({ state: { ...makePageProps().state, settings } })} />);
    const milestones = await screen.findByRole("region", { name: "Marcos" });
    expect(within(milestones).getAllByText(/Reserva de emergência/i)).toHaveLength(2);
    const items = within(milestones).getAllByRole("listitem");
    expect(items.filter(item => /Reserva de emerg/i.test(item.querySelector("b")!.textContent!))).toHaveLength(1);
    expect(within(milestones).getByText(/Critério: completar a meta vinculada “Reserva de Emergência” \(faltam R\$\s3\.000,00\)/)).toBeTruthy();
    expect(within(milestones).queryByText(/Já atingida/)).toBeNull();
  });

  it("aplica o cenário do plano e projeta quando o número da liberdade é atingido", async () => {
    const planned = { ...base, plan: { fixed_pct: 70, fun_pct: 20, invest_pct: 10, freedom_multiplier: 150 }, freedom_target_cents: 50_000_000 };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => String(input) === "/api/projections/base" ? json(planned) : json({ net_worth: [] }));
    render(<ProjectionsPage {...makePageProps()} />);
    const milestones = await screen.findByRole("region", { name: "Marcos" });
    const freedom = within(milestones).getByText("Número da liberdade").closest("li") as HTMLElement;
    // Decision 3: measured on the invested wealth, with today's progress.
    expect(freedom.textContent).toMatch(/Critério: patrimônio investido de R\$\s500\.000,00 \(150 salários\)\. Patrimônio investido hoje: R\$\s0,00 \(0%\); faltam R\$\s500\.000,00\./);
    expect(freedom.querySelector(".milestone-when")!.textContent).toBe("Além de 50 anos");
    fireEvent.click(screen.getByRole("button", { name: /Plano 70-20-10/ }));
    expect(screen.getByRole("button", { name: /Plano 70-20-10/ }).getAttribute("aria-pressed")).toBe("true");
    // Salary 5.000, 3-month average 3.800 → contribution = 500 (10%) + 700 (below the 4.500 ceiling).
    expect((screen.getByLabelText("Renda mensal") as HTMLInputElement).value).toBe("5.000,00");
    expect((screen.getByLabelText("Gastos mensais") as HTMLInputElement).value).toBe("3.800,00");
    expect((screen.getByLabelText("Aporte mensal em investimentos") as HTMLInputElement).value).toBe("1.200,00");
    expect(screen.getByText(/aporte = 10% do salário \+ o que sobra abaixo do teto de gastos do mês/)).toBeTruthy();
    expect(freedom.querySelector(".milestone-when")!.textContent).toMatch(/^≈ \d{2}\/\d{4} \(\d+ anos( e \d+ m(ês|eses))?\)$/);
    fireEvent.change(screen.getByLabelText("Aporte mensal em investimentos"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: /Plano 70-20-10/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("com plano ativo diz quando o aporte fica abaixo do mínimo e oferece usá-lo (R3-PRJ-1)", async () => {
    const planned = { ...base, plan: { fixed_pct: 70, fun_pct: 20, invest_pct: 10, freedom_multiplier: 150 }, freedom_target_cents: 50_000_000 };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => String(input) === "/api/projections/base" ? json(planned) : json({ net_worth: [] }));
    render(<ProjectionsPage {...makePageProps()} />);
    await screen.findByLabelText("Resultado da projeção");
    expect(screen.getByText(/Mínimo do plano \(10% do salário\): R\$\s500,00\./)).toBeTruthy();
    expect(screen.getByText(/o plano pede ao menos R\$\s500,00 investidos|abaixo do mínimo do plano/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Usar o mínimo do plano" }));
    expect((screen.getByLabelText("Aporte mensal em investimentos") as HTMLInputElement).value).toBe("500,00");
    expect(screen.queryByRole("button", { name: "Usar o mínimo do plano" })).toBeNull();
  });
});
