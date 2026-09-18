// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../api/client";
import { getPreferences, resetPreferencesForTests } from "../../lib/preferencesStore";
import type { Settings } from "../../types";
import { SetupWizard } from "./SetupWizard";

vi.mock("../../api/client", async importOriginal => ({ ...await importOriginal<typeof import("../../api/client")>(), api: { setup: vi.fn(), skipSetup: vi.fn(), settings: vi.fn(), plan: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetPreferencesForTests();
});

const spaced = (text: string) => text.replace(/\s/g, " ");
const income = () => screen.getByRole("textbox", { name: "Renda líquida mensal (opcional)" });
const continueToPlan = () => fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

describe("configuração inicial (CR-27 + MEL-45)", () => {
  it("junta nome, renda e teto na primeira etapa e avisa teto acima da renda", () => {
    render(<SetupWizard onDone={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText("Etapa 1 de 2: Seu mês")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Nome (opcional)" })).toBeTruthy();
    fireEvent.change(income(), { target: { value: "5.000,00" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Teto de gastos do mês (opcional)" }), { target: { value: "6.000,00" } });
    expect(screen.getByText(/o teto de gastos é maior que a renda informada/).closest(".ui-alert")?.className).toContain("tone-warning");
    fireEvent.change(screen.getByRole("textbox", { name: "Teto de gastos do mês (opcional)" }), { target: { value: "3.000,xx" } });
    continueToPlan();
    expect(screen.getByText("Informe um valor válido, por exemplo 1.234,56.")).toBeTruthy();
    expect(screen.getByText("Etapa 1 de 2: Seu mês")).toBeTruthy();
  });

  it.each([
    ["13.000,00", ["R$ 9.100,00", "R$ 2.600,00", "R$ 1.300,00", "R$ 78.000,00", "R$ 1.950.000,00"]],
    ["11.000,00", ["R$ 7.700,00", "R$ 2.200,00", "R$ 1.100,00", "R$ 66.000,00", "R$ 1.650.000,00"]],
  ])("sugere o plano com salário de %s", (salary, values) => {
    render(<SetupWizard onDone={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.change(income(), { target: { value: salary } });
    continueToPlan();
    expect(screen.getByText("Etapa 2 de 2: Plano sugerido")).toBeTruthy();
    const table = screen.getByRole("table", { name: "Plano 70-20-10 calculado com o seu salário" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map(row => spaced(row.querySelector(".plan-value")!.textContent!))).toEqual(values);
    // Decision 1: limits and a minimum; "teto" is only the monthly cap (fixos + lazer).
    expect(rows.map(row => row.querySelector("th b")!.textContent)).toEqual(["Limite de gastos fixos", "Limite de lazer", "Investimento mínimo", "Reserva de emergência", "Número da liberdade"]);
    expect(rows.map(row => row.querySelector(".plan-rule")!.textContent)).toEqual(["70% do salário", "20% do salário", "10% do salário", "6 salários", "150 salários"]);
    // Decision 2: what "Aplicar" changes is right under the table and beside the button.
    const summary = document.querySelector(".plan-apply-summary")!;
    const limit = salary === "13.000,00" ? "R$ 11.700,00" : "R$ 9.900,00";
    expect(spaced(summary.querySelector(".plan-apply-limit b")!.textContent!)).toBe(`sem teto → ${limit}`);
    expect(spaced(summary.textContent!)).toContain(`Reserva de emergência · ${values[3]}`);
    expect(spaced(document.querySelector(".wizard-footer-note")!.textContent!)).toBe(`Teto de gastos: sem teto → ${limit}`);
    expect(screen.getByText(/limite máximo, não uma meta/)).toBeTruthy();
    expect(screen.getByText("mínimo", { selector: "b" })).toBeTruthy();
    expect(screen.getByText(/regra dos 4%/)).toBeTruthy();
  });

  it("aplica a sugestão sem criar nada antes da confirmação e termina com o próximo passo", async () => {
    vi.mocked(api.setup).mockResolvedValue({ ok: true });
    vi.mocked(api.plan).mockResolvedValue({ ok: true });
    vi.mocked(api.settings).mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<SetupWizard onDone={onDone} onSkip={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Nome (opcional)" }), { target: { value: "Lucas" } });
    fireEvent.change(income(), { target: { value: "13000" } });
    continueToPlan();
    expect(api.setup).not.toHaveBeenCalled();
    expect(api.plan).not.toHaveBeenCalled();
    expect((screen.getByRole("checkbox", { name: /categorias-balde/ }) as HTMLInputElement).checked).toBe(true);
    expect(document.querySelector(".plan-apply-summary")!.textContent).toContain("Categorias Gastos fixos, Lazer e Investimentos");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar plano" }));
    await waitFor(() => expect(api.setup).toHaveBeenCalledWith({ display_name: "Lucas", monthly_net_income_cents: 1_300_000, monthly_spending_limit_cents: 0, emergency_months_target: 6, bills: [], goals: [], card: null }));
    await waitFor(() => expect(api.plan).toHaveBeenCalledWith({ fixed_pct: 70, fun_pct: 20, invest_pct: 10, emergency_months: 6, freedom_multiplier: 150, create_buckets: true }));
    const done = await screen.findByRole("dialog", { name: "Tudo pronto" });
    expect(spaced(done.textContent!)).toContain("Teto de gastos do mês: R$ 11.700,00 (fixos + lazer)");
    expect(done.textContent).toContain("Próximo passo");
    expect(getPreferences().dashboard_widgets).toContain("plano");
    expect(onDone).not.toHaveBeenCalled();
    // R1-SET-6: the next step is the primary action; the painel is the secondary way out.
    fireEvent.click(within(done).getByRole("button", { name: "Registrar primeiro lançamento" }));
    expect(onDone).toHaveBeenCalledWith("record");
    fireEvent.click(within(done).getByRole("button", { name: /Ir para o painel/ }));
    expect(onDone).toHaveBeenLastCalledWith();
  });

  it("ajusta percentuais e multiplicadores, exigindo soma de 100%", async () => {
    vi.mocked(api.setup).mockResolvedValue({ ok: true });
    vi.mocked(api.plan).mockResolvedValue({ ok: true });
    render(<SetupWizard onDone={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.change(income(), { target: { value: "10.000,00" } });
    continueToPlan();
    fireEvent.click(screen.getByRole("button", { name: "Ajustar" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Percentual do salário para gastos fixos" }), { target: { value: "60" } });
    expect(screen.getByText("90% · precisa ser 100%")).toBeTruthy();
    // R1-SET-8: the three percentages are invalid while the sum is wrong; the heading follows the draft (R1-SET-5).
    expect(screen.getAllByRole("spinbutton").filter(input => input.getAttribute("aria-invalid") === "true")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar plano" }));
    expect(await screen.findByText("Os percentuais devem somar 100%. Agora somam 90%.")).toBeTruthy();
    expect(api.plan).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Percentual do salário para investir" }), { target: { value: "20" } });
    expect(screen.getByRole("heading", { name: "Seu plano 60-20-20" })).toBeTruthy();
    expect(screen.getAllByRole("spinbutton").some(input => input.getAttribute("aria-invalid") === "true")).toBe(false);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Salários do número da liberdade" }), { target: { value: "210" } });
    expect(spaced(screen.getByRole("table").querySelector(".plan-row-multiplier .plan-value")!.textContent!)).toBe("R$ 2.100.000,00");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar plano" }));
    await waitFor(() => expect(api.plan).toHaveBeenCalledWith({ fixed_pct: 60, fun_pct: 20, invest_pct: 20, emergency_months: 6, freedom_multiplier: 210, create_buckets: true }));
  });

  it("pula o plano salvando só o planejamento", async () => {
    vi.mocked(api.setup).mockResolvedValue({ ok: true });
    render(<SetupWizard onDone={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.change(income(), { target: { value: "5000" } });
    continueToPlan();
    fireEvent.click(screen.getByRole("button", { name: "Pular plano" }));
    await waitFor(() => expect(api.setup).toHaveBeenCalledWith(expect.objectContaining({ monthly_net_income_cents: 500_000, emergency_months_target: 6 })));
    expect(api.plan).not.toHaveBeenCalled();
    expect(await screen.findByText("Seu planejamento foi salvo.")).toBeTruthy();
  });

  it("sem salário explica e conclui sem plano", async () => {
    vi.mocked(api.setup).mockResolvedValue({ ok: true });
    render(<SetupWizard onDone={vi.fn()} onSkip={vi.fn()} />);
    continueToPlan();
    expect(screen.getByText(/Sem o salário líquido não dá para calcular o plano/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aplicar plano" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Concluir sem plano" }));
    await waitFor(() => expect(api.setup).toHaveBeenCalledOnce());
  });

  it("revisão: salva configurações e o plano e fecha", async () => {
    vi.mocked(api.settings).mockResolvedValue({ ok: true });
    vi.mocked(api.plan).mockRejectedValueOnce(new ApiError("Dados inválidos.", 400, { fixed_pct: "Os percentuais devem somar 100%." })).mockResolvedValueOnce({ ok: true });
    const onDone = vi.fn();
    const settings: Settings = { id: 1, setup_completed: true, display_name: "Ana", currency: "BRL", monthly_net_income_cents: 800_000, monthly_spending_limit_cents: 700_000, emergency_months_target: 4, tour_completed: true, plan_fixed_pct: 60, plan_fun_pct: 25, plan_invest_pct: 15, freedom_multiplier: 200 };
    render(<SetupWizard revisiting initialSettings={settings} onDone={onDone} onSkip={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Revise seu planejamento" })).toBeTruthy();
    continueToPlan();
    expect(spaced(document.querySelector(".wizard-footer-note")!.textContent!)).toBe("Teto de gastos: R$ 7.000,00 → R$ 6.800,00");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar plano" }));
    expect(await screen.findByText("Os percentuais devem somar 100%.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Aplicar/ }));
    await waitFor(() => expect(api.plan).toHaveBeenLastCalledWith({ fixed_pct: 60, fun_pct: 25, invest_pct: 15, emergency_months: 4, freedom_multiplier: 200 }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(api.settings).toHaveBeenCalledWith(expect.objectContaining({ display_name: "Ana", emergency_months_target: 4 }));
  });

  it("permite explorar sem configurar", async () => {
    vi.mocked(api.skipSetup).mockResolvedValue({ ok: true });
    const onSkip = vi.fn();
    render(<SetupWizard onDone={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: "Explorar sem configurar" }));
    await waitFor(() => expect(onSkip).toHaveBeenCalledOnce());
    expect(api.setup).not.toHaveBeenCalled();
  });

  it("mostra a falha dentro do assistente", async () => {
    vi.mocked(api.skipSetup).mockRejectedValue(new Error("Servidor indisponível."));
    render(<SetupWizard onDone={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Explorar sem configurar" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Servidor indisponível.");
  });

  it("volta à etapa anterior pelo indicador de etapas", () => {
    render(<SetupWizard onDone={vi.fn()} onSkip={vi.fn()} />);
    continueToPlan();
    fireEvent.click(screen.getByRole("button", { name: /Seu mês/ }));
    expect(screen.getByRole("textbox", { name: "Nome (opcional)" })).toBeTruthy();
  });
});
