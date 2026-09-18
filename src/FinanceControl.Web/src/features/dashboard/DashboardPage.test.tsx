// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { insightsApi, type ReportsData } from "../../api/insights";
import { DEFAULT_PREFERENCES } from "../../lib/preferences";
import { resetPreferencesForTests, setPreferences } from "../../lib/preferencesStore";
import { emptyState, makePageProps } from "../../test/fixtures";
import type { CardInvoiceRow, ChecklistItem, FinanceState, MonthlySummary } from "../../types";
import { DashboardPage } from "./DashboardPage";

vi.mock("../../api/client", async importOriginal => {
  const original = await importOriginal<typeof import("../../api/client")>();
  return { ...original, api: { ...original.api, transactions: vi.fn(), settings: vi.fn(), cardInvoicesDue: vi.fn() } };
});
vi.mock("../../api/insights", async importOriginal => {
  const original = await importOriginal<typeof import("../../api/insights")>();
  return { ...original, market: vi.fn(async () => ({ base: "BRL", auto_refresh: true, last_refresh_at: null, last_error: null, indicators: [], rates: [] })), insightsApi: { ...original.insightsApi, reports: vi.fn() } };
});

const reportsData = (to = "2026-09"): ReportsData => ({
  from: "2026-04", to,
  months: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", to].map((month, index) => ({ month, income_cents: 500_000, expense_cents: 100_000 * (index + 1), investment_cents: 0, net_cents: 500_000 - 100_000 * (index + 1) })),
  totals: { income_cents: 0, expense_cents: 0, investment_cents: 0, net_cents: 0, avg_monthly_income_cents: 0, avg_monthly_expense_cents: 0, savings_rate_pct: null },
  expense_categories: [], income_categories: [],
  payment_methods: [{ method: "pix", total_cents: 40_000, count: 2 }, { method: "card", total_cents: 60_000, count: 3 }],
  top_expenses: [],
  net_worth: [{ month: "2026-08", total_cents: 1_000_000, bank_cents: 1_000_000, investments_cents: 0 }, { month: to, total_cents: 1_100_000, bank_cents: 1_100_000, investments_cents: 0 }],
  currency_exposure: [],
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 15, 12));
});

beforeEach(() => {
  vi.mocked(insightsApi.reports).mockImplementation(async (_from: string, to: string) => reportsData(to));
  vi.mocked(api.settings).mockResolvedValue({ ok: true });
  vi.mocked(api.cardInvoicesDue).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  resetPreferencesForTests();
});

const summary = (overrides: Partial<MonthlySummary> = {}): MonthlySummary => ({
  month: "2026-09", income_cents: 0, expense_cents: 0, investment_cents: 0, transactions_count: 0, uncategorized_expense_cents: 0, categories: [],
  bills: { total_count: 0, paid_count: 0, total_cents: 0, paid_cents: 0 }, ...overrides,
});

const planned: FinanceState = {
  ...emptyState,
  settings: { ...emptyState.settings, monthly_net_income_cents: 500_000, monthly_spending_limit_cents: 300_000 },
  categories: [{ id: 1, name: "Mercado", kind: "expense", monthly_budget_cents: 100_000, active: true }],
};

const item = (overrides: Partial<ChecklistItem>): ChecklistItem => ({
  id: 1, name: "Luz", amount_cents: 12_000, due_day: 10, category_id: null, recurring: true, active: true, paid: false, paid_at: null, transaction_id: null, ...overrides,
});

const renderDashboard = (overrides: Parameters<typeof makePageProps>[0] = {}, extra: { onToggleBill?: () => void; onPlanSetup?: () => void; busyBillId?: number | null } = {}) =>
  render(<DashboardPage {...makePageProps({ state: planned, ...overrides })} onToggleBill={extra.onToggleBill ?? vi.fn()} onPlanSetup={extra.onPlanSetup ?? vi.fn()} busyBillId={extra.busyBillId ?? null} />);

describe("ativação do painel", () => {
  it("prioriza o planejamento mensal quando ainda não há dados", () => {
    const onPlanSetup = vi.fn();
    renderDashboard({ state: emptyState }, { onPlanSetup });

    expect(screen.getByRole("heading", { name: "Defina a referência do seu mês" })).toBeTruthy();
    expect(screen.queryByText("Primeiro passo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Definir renda e teto/ }));
    expect(onPlanSetup).toHaveBeenCalledOnce();
    expect(screen.queryByRole("heading", { name: "Próximos vencimentos" })).toBeNull();
  });

  it("apresenta o disponível imediatamente e conduz ao primeiro lançamento", () => {
    const openModal = vi.fn();
    const state = { ...emptyState, settings: planned.settings };
    renderDashboard({ state, openModal });

    expect(screen.getByText("R$ 3.000,00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Registrar primeiro lançamento/ }));
    expect(openModal).toHaveBeenCalledWith("transaction", expect.objectContaining({ kind: "expense" }));
  });
});

describe("painel do mês", () => {
  it("mostra o estouro do teto em vez de zero", () => {
    renderDashboard({ summary: summary({ expense_cents: 350_000 }) });
    const kpis = screen.getByRole("group", { name: /Resumo de setembro de 2026/ });
    expect(within(kpis).getByText("Excedido em R$ 500,00").className).toContain("kpi-negative");
    expect(within(kpis).getByText("Acima do teto de gastos de R$ 3.000,00.")).toBeTruthy();
  });

  it("usa o resumo do mês escolhido e marca a renda planejada", () => {
    renderDashboard({ month: "2026-07", summary: summary({ month: "2026-07", expense_cents: 10_000 }) });
    const kpis = screen.getByRole("group", { name: /Resumo de julho de 2026/ });
    expect(within(kpis).getByText("R$ 5.000,00")).toBeTruthy();
    expect(within(kpis).getByText(/Planejada/)).toBeTruthy();
    expect(within(kpis).getByText("R$ 100,00")).toBeTruthy();
  });

  it("calcula pelos lançamentos quando o resumo não está disponível", () => {
    const state: FinanceState = {
      ...planned,
      transactions: [
        { id: 1, date: "2026-09-02", description: "Feira", category_id: 1, category_name: "Mercado", kind: "expense", amount_cents: 90_000, payment_method: "pix", account_id: null, account_name: null },
        { id: 2, date: "2026-08-02", description: "Antiga", category_id: 1, category_name: "Mercado", kind: "expense", amount_cents: 70_000, payment_method: "pix", account_id: null, account_name: null },
      ],
    };
    renderDashboard({ state, summary: null });
    expect(screen.getByText("R$ 2.100,00")).toBeTruthy();
    expect(screen.getByText(/^Perto do limite · /)).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("lançamentos mais recentes");
  });

  it("lista contas com status, alterna o pagamento e abre o pagamento detalhado", () => {
    const onToggleBill = vi.fn();
    const openModal = vi.fn();
    const checklist = [
      item({ id: 1, name: "Luz", due_day: 10 }),
      item({ id: 2, name: "Internet", due_day: 15 }),
      item({ id: 3, name: "Aluguel", due_day: 5, paid: true, paid_at: "2026-09-05T09:00:00", transaction_id: 7 }),
      item({ id: 4, name: "Escola", due_day: 31 }),
    ];
    renderDashboard({ checklist, openModal }, { onToggleBill });

    expect(screen.getByText("Vencida há 5 dias")).toBeTruthy();
    expect(screen.getByText("Vence hoje")).toBeTruthy();
    expect(screen.getByText("Paga em 05/09")).toBeTruthy();
    // R4-PAINEL-2: the date is in the tile; the pill keeps the days (full wording in the title)
    expect(screen.getByText(/^Vence em \d+ dias?$/).getAttribute("title")).toMatch(/^Vence em 30\/09 \(\d+ dias?\)$/);
    expect(screen.getByText("1 de 4 pagas")).toBeTruthy();

    const luz = screen.getByRole("button", { name: /^Luz/ });
    expect(luz.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(luz);
    expect(onToggleBill).toHaveBeenCalledWith(checklist[0]);

    fireEvent.click(screen.getByRole("button", { name: "Pagar Luz com detalhes" }));
    expect(openModal).toHaveBeenCalledWith("bill-payment", { bill_id: 1, month: "2026-09", name: "Luz", amount: 12_000 });
    expect(screen.queryByRole("button", { name: "Pagar Aluguel com detalhes" })).toBeNull();
  });

  it("mantém a conta ocupada durante a atualização", () => {
    renderDashboard({ checklist: [item({ id: 1 })] }, { busyBillId: 1 });
    expect((screen.getByRole("button", { name: /^Luz/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Atualizando…")).toBeTruthy();
  });

  it("classifica o orçamento das categorias e mostra gastos sem categoria", () => {
    renderDashboard({
      summary: summary({
        expense_cents: 260_000, uncategorized_expense_cents: 20_000,
        categories: [
          { category_id: 1, name: "Mercado", monthly_budget_cents: 100_000, spent_cents: 120_000, active: true },
          { category_id: 2, name: "Lazer", monthly_budget_cents: 50_000, spent_cents: 45_000, active: true },
          { category_id: 3, name: "Casa", monthly_budget_cents: 100_000, spent_cents: 20_000, active: true },
          { category_id: 4, name: "Pets", monthly_budget_cents: 0, spent_cents: 55_000, active: true },
        ],
      }),
    });
    const budget = screen.getByRole("list", { name: "Categorias de gasto" });
    // R3-PAINEL-5: the exceeded badge carries the amount on the bar's line ("Excedido:" for screen readers).
    expect(within(budget).getByText(/R\$\s200,00 acima/).closest(".badge")?.textContent).toMatch(/^Excedido: R\$\s200,00 acima$/);
    // R3-PAINEL-5: bar + one status line; a badge only when the budget is exceeded.
    expect(within(budget).getByText(/^Perto do limite · /)).toBeTruthy();
    expect(within(budget).getByText(/^Restam R\$/)).toBeTruthy();
    expect(within(budget).queryByText("Dentro do limite")).toBeNull();
    expect(within(budget).getByText("Sem orçamento")).toBeTruthy();
    expect(within(budget).getByText("Sem categoria")).toBeTruthy();
    expect(within(budget).getByRole("progressbar", { name: "Orçamento de Mercado" }).className).toContain("danger");
    expect(within(budget).getByRole("progressbar", { name: "Orçamento de Lazer" }).className).toContain("warning");
  });

  it("mostra quanto falta para cada meta e abre o aporte", () => {
    const openModal = vi.fn();
    const state: FinanceState = { ...planned, goals: [{ id: 9, name: "Viagem", type: "travel", target_cents: 500_000, current_cents: 125_000, target_date: null, currency: "BRL", active: true }] };
    renderDashboard({ state, openModal });
    expect(screen.getByText("Faltam R$ 3.750,00 · 25%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Registrar aporte em Viagem" }));
    expect(openModal).toHaveBeenCalledWith("goal-entry", { goal_id: 9 });
  });

  it("soma assinaturas anuais e semanais pelo equivalente mensal", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: [...DEFAULT_PREFERENCES.dashboard_widgets, "assinaturas"] });
    const base = { billing_day: 1, category_id: null, category_name: null, card_id: null, card_name: null, next_billing_date: null, active: true };
    const state: FinanceState = {
      ...planned,
      subscriptions: [
        { ...base, id: 1, name: "Streaming", amount_cents: 4_000, frequency: "monthly" },
        { ...base, id: 2, name: "Software", amount_cents: 12_000, frequency: "yearly" },
      ],
    };
    renderDashboard({ state });
    expect(screen.getByText("R$ 50,00/mês")).toBeTruthy();
    expect(screen.getByText("R$ 10,00/mês")).toBeTruthy();
  });

  it("não repete cabeçalhos consecutivos", () => {
    renderDashboard();
    const headings = screen.getAllByRole("heading").map(heading => heading.textContent);
    headings.slice(1).forEach((text, index) => expect(text).not.toBe(headings[index]));
  });
});

describe("MEL-05/MEL-09 · assinaturas e categorias removidas no painel", () => {
  it("mostra o selo de cobrança do mês e marca cartões e categorias removidos", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: [...DEFAULT_PREFERENCES.dashboard_widgets, "assinaturas"] });
    renderDashboard({
      state: { ...planned, subscriptions: [{ id: 1, name: "Streaming", amount_cents: 5_990, billing_day: 10, category_id: null, category_name: null, card_id: 99, card_name: "Cartão antigo", frequency: "monthly", next_billing_date: null, active: true, last_charge_date: "2026-09-10" }] },
      summary: summary({ expense_cents: 5_000, categories: [{ category_id: 50, name: "Antiga", monthly_budget_cents: 0, spent_cents: 5_000, active: false }] }),
    });
    const subscriptions = screen.getByRole("list", { name: "Assinaturas ativas" });
    expect(within(subscriptions).getByText("Cobrada em 10/09")).toBeTruthy();
    expect(within(subscriptions).getByText(/Cartão antigo \(removido\)/)).toBeTruthy();
    const budget = screen.getByRole("list", { name: "Categorias de gasto" });
    expect(within(budget).getByText("(removido)")).toBeTruthy();
  });
});

describe("MEL-22/MEL-23 · painel", () => {
  const withBill = { ...planned, bills: [{ id: 1, name: "Luz", amount_cents: 12_000, due_day: 10, category_id: null, recurring: true, active: true }] };

  it("com o mês fechado, bloqueia o checklist e oferece reabrir", () => {
    const onReopenMonth = vi.fn(async () => true);
    const onToggleBill = vi.fn();
    renderDashboard({ state: withBill, checklist: [item({})], summary: summary({ closed: true, closed_at: "2026-09-30T20:00:00" }), onReopenMonth }, { onToggleBill });
    const toggle = screen.getByRole("button", { name: /Luz/, pressed: false }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(toggle.title).toBe("Mês fechado");
    expect((screen.getByRole("button", { name: "Pagar Luz com detalhes" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Fechado em 30\/09\/2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reabrir mês" }));
    expect(onReopenMonth).toHaveBeenCalledWith("2026-09");
  });

  it("no meio do mês não sugere fechar o mês corrente (CR-29)", () => {
    renderDashboard({ state: withBill, checklist: [item({})], summary: summary(), onCloseMonth: vi.fn() });
    expect(screen.queryByRole("button", { name: "Fechar mês" })).toBeNull();
  });

  it("com o mês aberto, nos últimos dias, oferece fechar", () => {
    vi.setSystemTime(new Date(2026, 8, 29, 12));
    const onCloseMonth = vi.fn();
    renderDashboard({ state: withBill, checklist: [item({})], summary: summary(), onCloseMonth });
    expect((screen.getByRole("button", { name: /Luz/, pressed: false }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Fechar mês" }));
    expect(onCloseMonth).toHaveBeenCalledOnce();
  });

  it("R2-PAINEL-2: as faturas entram como linhas do widget, na contagem e no total, com “Pagar fatura”", async () => {
    const card = { id: 7, name: "Visa", closing_day: 25, due_day: 5, real_limit_cents: 0, personal_limit_cents: 0, active: true, open_invoice_cents: 10_000, unpaid_invoices_cents: 55_000, available_limit_cents: null };
    const invoice = (month: string, due: string, total: number, status: string, paid: CardInvoiceRow["paid"] = null): CardInvoiceRow => ({
      card_id: 7, card_name: "Visa", brand: null, network: null, color: null, month, period_start: "2026-07-26", period_end: "2026-08-25", closing_date: "2026-08-25", due_date: due,
      total_cents: total, items_count: 3, status, paid,
    });
    vi.mocked(api.cardInvoicesDue).mockResolvedValue([invoice("2026-09", "2026-09-05", 45_000, "vencida")]);
    const openModal = vi.fn();
    renderDashboard({ state: { ...withBill, cards: [card] }, checklist: [item({})], summary: summary(), openModal });
    const row = await screen.findByTitle("Fatura Visa · Setembro/2026");
    expect(api.cardInvoicesDue).toHaveBeenCalledWith("2026-09");
    expect(row.closest("li")!.textContent).toMatch(/Vencida há 10 dias/);
    expect(screen.getByText("0 de 2 pagas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pagar Fatura Visa · Setembro/2026" }));
    expect(openModal).toHaveBeenCalledWith("invoice-payment", expect.objectContaining({ card_id: 7, month: "2026-09", total_cents: 45_000 }));
  });
});

describe("MEL-30/MEL-38 · widgets do painel", () => {
  const widgetIds = () => Array.from(document.querySelectorAll<HTMLElement>("[data-widget]")).map(element => element.dataset.widget);

  it("segue a ordem e a visibilidade das preferências", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: ["metas", "categorias", "desconhecido", "contas"] });
    renderDashboard({ summary: summary() });
    expect(widgetIds()).toEqual(["metas", "categorias", "contas"]);
    expect(screen.queryByRole("heading", { name: "Assinaturas" })).toBeNull();
  });

  it("reordena pelo teclado, oculta e mostra de novo, salvando as preferências", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: ["metas", "contas"] });
    renderDashboard({ summary: summary() });
    fireEvent.click(screen.getByRole("button", { name: "Personalizar painel" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Reordenar Próximos vencimentos" }), { key: "ArrowUp" });
    expect(widgetIds()).toEqual(["contas", "metas"]);
    expect(api.settings).toHaveBeenLastCalledWith({ ui_preferences: expect.objectContaining({ dashboard_widgets: ["contas", "metas"] }) });
    expect(screen.getByRole("status").textContent).toContain("Próximos vencimentos na posição 1 de 2.");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar Metas" }));
    expect(widgetIds()).toEqual(["contas"]);
    fireEvent.click(within(screen.getByRole("group", { name: "Widgets ocultos" })).getByRole("button", { name: "Mostrar Metas" }));
    expect(widgetIds()).toEqual(["contas", "metas"]);
  });

  it("avisa com toast de erro quando a preferência não pode ser salva", async () => {
    const notifyError = vi.fn();
    vi.mocked(api.settings).mockRejectedValueOnce(new Error("Falhou."));
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: ["metas", "contas"] });
    renderDashboard({ summary: summary(), notifyError });
    fireEvent.click(screen.getByRole("button", { name: "Personalizar painel" }));
    fireEvent.click(screen.getByRole("button", { name: "Mover Próximos vencimentos para cima" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(widgetIds()).toEqual(["metas", "contas"]);
  });

  it("rosca de categorias leva a Lançamentos filtrado e maiores gastos abrem a edição", async () => {
    const navigate = vi.fn();
    const openEdit = vi.fn();
    const transaction = { id: 42, date: "2026-09-03", description: "Mercado grande", category_id: 1, category_name: "Mercado", kind: "expense" as const, amount_cents: 90_000, payment_method: "pix", account_id: null, account_name: null };
    vi.mocked(api.transactions).mockResolvedValue([transaction]);
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: ["categorias", "maiores_gastos"] });
    renderDashboard({ navigate, openEdit, summary: summary({
      expense_cents: 90_000, categories: [{ category_id: 1, name: "Mercado", monthly_budget_cents: 0, spent_cents: 90_000, active: true }],
      top_expenses: [{ id: 42, date: "2026-09-03", description: "Mercado grande", category_name: "Mercado", amount_cents: 90_000, currency: "BRL", base_amount_cents: 90_000 }],
    }) });
    fireEvent.click(document.querySelector("[data-widget='categorias'] .chart-slice")!);
    expect(navigate).toHaveBeenCalledWith("transactions", { categoria: "1", tipo: "expense" });

    const plot = document.querySelector<HTMLElement>("[data-widget='maiores_gastos'] .chart-plot")!;
    fireEvent.keyDown(plot, { key: "ArrowDown" });
    fireEvent.keyDown(plot, { key: "Enter" });
    await waitFor(() => expect(openEdit).toHaveBeenCalledWith("transaction", transaction));
    expect(api.transactions).toHaveBeenCalledWith("2026-09");
  });

  it("mostra a previsão do ritmo do mês e o patrimônio com variação", async () => {
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: ["ritmo", "patrimonio"] });
    renderDashboard({ summary: summary({ expense_cents: 150_000, daily_expenses: [{ date: "2026-09-05", total_cents: 150_000 }] }) });
    expect(screen.getByText(/No ritmo atual, o mês fecha em R\$\s3\.000,00 \(100% do teto/)).toBeTruthy();
    expect(await screen.findByText(/desde agosto de 2026/)).toBeTruthy();
  });

  it("carrega o relatório de 6 meses uma vez e de novo ao trocar de mês", async () => {
    const props = makePageProps({ state: planned, summary: summary() });
    const { rerender } = render(<DashboardPage {...props} onToggleBill={vi.fn()} onPlanSetup={vi.fn()} />);
    await waitFor(() => expect(insightsApi.reports).toHaveBeenCalledWith("2026-04", "2026-09"));
    rerender(<DashboardPage {...props} month="2026-08" onToggleBill={vi.fn()} onPlanSetup={vi.fn()} />);
    await waitFor(() => expect(insightsApi.reports).toHaveBeenCalledWith("2026-03", "2026-08"));
    expect(document.querySelector("[data-widget='contas']")!.className).toContain("is-switching");
    // The app refresh that follows the month switch (version + 1) does not fetch the report again.
    await act(async () => { rerender(<DashboardPage {...props} month="2026-08" version={2} summary={summary({ month: "2026-08" })} onToggleBill={vi.fn()} onPlanSetup={vi.fn()} />); });
    expect(insightsApi.reports).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[data-widget='contas']")!.className).not.toContain("is-switching");
  });

  it("oculta os valores do patrimônio em modo privado", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, hide_values: true, dashboard_widgets: ["saldo"] });
    renderDashboard({ summary: summary(), state: { ...planned, bank_accounts: [{ id: 1, name: "Conta", institution: "Banco", account_type: "checking", current_balance_cents: 123_456, color_label: null, active: true }] } });
    const hero = document.querySelector(".hero-balance")!;
    expect(hero.textContent).not.toContain("1.234,56");
    expect(hero.textContent).toContain("•••••");
  });
});

describe("CR-13 · painel sem repetição", () => {
  const widgetIds = () => Array.from(document.querySelectorAll<HTMLElement>("[data-widget]")).map(element => element.dataset.widget);
  const kpiLabels = () => Array.from(document.querySelectorAll(".dashboard-kpis .label")).map(label => label.textContent);

  it("o KPI de patrimônio some quando o destaque do patrimônio está no painel", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: ["saldo", "contas"] });
    renderDashboard({ summary: summary() });
    expect(kpiLabels()).toHaveLength(3);
    expect(kpiLabels().some(label => /patrim/i.test(label ?? ""))).toBe(false);
  });

  it("sem o destaque, o KPI de patrimônio volta", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: ["contas"] });
    renderDashboard({ summary: summary() });
    expect(kpiLabels()).toHaveLength(4);
  });

  it("com a faixa de cotações ligada, o widget Cotações não se repete (continua disponível ao personalizar)", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, show_market_ticker: true, dashboard_widgets: ["mercado", "contas"] });
    renderDashboard({ summary: summary() });
    expect(widgetIds()).toEqual(["contas"]);
    fireEvent.click(screen.getByRole("button", { name: "Personalizar painel" }));
    expect(widgetIds()).toEqual(["mercado", "contas"]);
    cleanup();
    setPreferences({ ...DEFAULT_PREFERENCES, show_market_ticker: false, dashboard_widgets: ["mercado", "contas"] });
    renderDashboard({ summary: summary() });
    expect(widgetIds()).toEqual(["mercado", "contas"]);
  });

  it("o padrão tem menos widgets e deixa o resto disponível", () => {
    renderDashboard({ summary: summary() });
    expect(widgetIds()).not.toContain("mercado");
    expect(widgetIds()).not.toContain("patrimonio");
    expect(widgetIds().length).toBeLessThanOrEqual(8);
  });
});

describe("MEL-46 · formas de pagamento do mês", () => {
  it("usa o resumo do mês quando o servidor traz payment_methods", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: ["pagamentos"] });
    renderDashboard({ summary: summary({ payment_methods: [{ method: "pix", total_cents: 25_000, count: 1 }] }) });
    const widget = document.querySelector("[data-widget='pagamentos']")!;
    expect(widget.textContent).toContain("Despesas de setembro de 2026 por forma de pagamento.");
    // R1-PAINEL-5: one stacked share bar + ranked list (no second donut)
    const list = within(widget as HTMLElement).getByRole("list", { name: "Formas de pagamento" });
    expect(list.textContent).toContain("Pix");
    expect(list.textContent).toContain("100%");
    expect(widget.querySelector(".chart-slice")).toBeNull();
    expect(widget.querySelectorAll(".share-bar > span")).toHaveLength(1);
  });

  it("servidor antigo: volta à janela de 6 meses dos relatórios", async () => {
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: ["pagamentos"] });
    renderDashboard({ summary: summary() });
    expect(await screen.findByText("Despesas dos últimos 6 meses por forma de pagamento.")).toBeTruthy();
  });
});


describe("R4-PAINEL-1/3 · painel com o servidor fora", () => {
  it("o Fluxo diz que faltam dados (sem estado vazio falso) e não há faixa de erro além do banner", async () => {
    const { ApiError, NETWORK_ERROR_MESSAGE } = await import("../../api/client");
    vi.mocked(insightsApi.reports).mockRejectedValue(new ApiError(NETWORK_ERROR_MESSAGE, 0));
    vi.mocked(api.cardInvoicesDue).mockRejectedValue(new ApiError(NETWORK_ERROR_MESSAGE, 0));
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: ["fluxo", "patrimonio", "contas"] });
    renderDashboard({ offline: true, checklist: [item({})], state: { ...planned, cards: [{ id: 1, name: "Nubank", closing_day: 1, due_day: 10, real_limit_cents: 0, personal_limit_cents: 0, active: true }] } });
    expect((await screen.findAllByText("Sem dados enquanto o servidor estiver fora.")).length).toBe(2);
    expect(screen.queryByText(/Sem movimento/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    expect(await screen.findByText(/sem as faturas de cartão/)).toBeTruthy();
  });
});
