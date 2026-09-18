// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportsData } from "../../api/insights";
import { DEFAULT_PREFERENCES } from "../../lib/preferences";
import { resetPreferencesForTests, setPreferences } from "../../lib/preferencesStore";
import { makePageProps } from "../../test/fixtures";
import { ReportsPage } from "./ReportsPage";

const report = (overrides: Partial<ReportsData> = {}): ReportsData => ({
  from: "2026-04", to: "2026-09",
  months: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map(month => ({ month, income_cents: 500_000, expense_cents: 300_000, investment_cents: 50_000, net_cents: 150_000 })),
  totals: { income_cents: 3_000_000, expense_cents: 1_800_000, investment_cents: 300_000, net_cents: 900_000, avg_monthly_income_cents: 500_000, avg_monthly_expense_cents: 300_000, savings_rate_pct: 40 },
  expense_categories: [{ category_id: 1, name: "Mercado", total_cents: 1_000_000, share_pct: 55.6 }, { category_id: null, name: "Sem categoria", total_cents: 800_000, share_pct: 44.4 }],
  income_categories: [{ category_id: 2, name: "Salário", total_cents: 3_000_000, share_pct: 100 }],
  payment_methods: [{ method: "pix", total_cents: 1_000_000, count: 12 }, { method: "auto_debit", total_cents: 800_000, count: 3 }],
  top_expenses: [{ id: 42, date: "2026-09-03", description: "Aluguel", category_name: "Moradia", amount_cents: 250_000, currency: "BRL", base_amount_cents: 250_000 }],
  net_worth: [{ month: "2026-08", total_cents: 1_000_000, bank_cents: 400_000, investments_cents: 600_000 }, { month: "2026-09", total_cents: 1_200_000, bank_cents: 500_000, investments_cents: 700_000 }],
  currency_exposure: [{ currency: "BRL", native_cents: 1_000_000, base_cents: 1_000_000, share_pct: 83.3 }, { currency: "USD", native_cents: 40_000, base_cents: 200_000, share_pct: 16.7 }],
  ...overrides,
});

const previous = report({ totals: { income_cents: 2_500_000, expense_cents: 2_000_000, investment_cents: 300_000, net_cents: 200_000, avg_monthly_income_cents: 416_667, avg_monthly_expense_cents: 333_333, savings_rate_pct: 20 } });

let fetchMock: ReturnType<typeof vi.fn>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 18, 12));
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/reports?from=2026-04&to=2026-09")) return json(report());
    if (url.startsWith("/api/reports?from=2025-10&to=2026-03")) return json(previous);
    if (url.startsWith("/api/reports?")) return json(report({ from: "x", to: "y" }));
    if (url.startsWith("/api/transactions?month=2026-09")) return json([{ id: 42, date: "2026-09-03", description: "Aluguel", category_id: null, category_name: null, kind: "expense", amount_cents: 250_000, payment_method: "pix", account_id: null, account_name: null }]);
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => { cleanup(); resetPreferencesForTests(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const pickMonth = (field: string, month: string) => {
  fireEvent.click(screen.getByRole("button", { name: field }));
  fireEvent.click(screen.getByRole("button", { name: month }));
};

describe("ReportsPage", () => {
  it("mostra KPIs com variação, gráficos, exposição e o link do CSV", async () => {
    render(<ReportsPage {...makePageProps()} />);
    const kpis = await screen.findByRole("list", { name: "Resumo do período" }).catch(() => screen.findByLabelText("Resumo do período"));
    expect(within(kpis).getByText("Receitas")).toBeTruthy();
    await waitFor(() => expect(within(kpis).getByText("+20%")).toBeTruthy());
    expect(within(kpis).getByText("40%")).toBeTruthy();
    const expenseDelta = within(kpis).getByText("−10%").closest(".kpi-delta");
    expect(expenseDelta?.className).toContain("down");
    expect(expenseDelta?.className).toContain("good");
    expect(screen.getByRole("link", { name: /Exportar CSV/ }).getAttribute("href")).toBe("/api/reports/transactions.csv?from=2026-04&to=2026-09");
    expect(screen.getByRole("img", { name: /^Receitas, despesas e investimentos por mês\./ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Despesas por categoria\./ })).toBeTruthy();
    expect(screen.getAllByText(/Débito automático/).length).toBeGreaterThan(0);
    expect(screen.getByText("Dólar americano")).toBeTruthy();
    const usdRow = screen.getByText("Dólar americano").closest("tr") as HTMLElement;
    expect(usdRow.querySelector('.ui-currency-icon[data-currency="USD"]')).toBeTruthy();
    expect(usdRow.textContent).toContain("USD");
    expect(within(kpis).getByText(/Média de R\$\s5\.000,00 por mês/)).toBeTruthy();
  });

  it("oculta valores dentro das dicas no modo privacidade", async () => {
    setPreferences({ ...DEFAULT_PREFERENCES, hide_values: true });
    render(<ReportsPage {...makePageProps()} />);
    const kpis = await screen.findByLabelText("Resumo do período");
    expect(within(kpis).getAllByText(/Média de R\$\s•••••/)).toHaveLength(2);
    expect(kpis.textContent).not.toMatch(/5\.000,00/);
  });

  it("troca o período e busca de novo", async () => {
    render(<ReportsPage {...makePageProps()} />);
    await screen.findByLabelText("Resumo do período");
    const period = screen.getByRole("radiogroup", { name: "Período" });
    expect(within(period).getByRole("radio", { name: "6 meses" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(period).getByRole("radio", { name: "12 meses" }));
    expect(within(period).getByRole("radio", { name: "12 meses" }).getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/reports?from=2025-10&to=2026-09"))).toBe(true));
    expect(screen.getByRole("link", { name: /Exportar CSV/ }).getAttribute("href")).toContain("from=2025-10&to=2026-09");
  });

  it("valida o período personalizado", async () => {
    render(<ReportsPage {...makePageProps()} />);
    await screen.findByLabelText("Resumo do período");
    fireEvent.click(screen.getByRole("radio", { name: "Personalizado" }));
    pickMonth("De", "setembro de 2026");
    pickMonth("Até", "janeiro de 2026");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByRole("alert").textContent).toMatch(/anterior ou igual/);
  });

  it("aplica o período personalizado escolhido nos seletores de mês", async () => {
    render(<ReportsPage {...makePageProps()} />);
    await screen.findByLabelText("Resumo do período");
    fireEvent.click(screen.getByRole("radio", { name: "Personalizado" }));
    expect(screen.getByRole("button", { name: "De" }).textContent).toContain("abril de 2026");
    pickMonth("De", "janeiro de 2026");
    pickMonth("Até", "março de 2026");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/reports?from=2026-01&to=2026-03"))).toBe(true));
    expect(screen.getByRole("link", { name: /Exportar CSV/ }).getAttribute("href")).toContain("from=2026-01&to=2026-03");
  });

  it("abre o lançamento ao escolher um dos maiores gastos", async () => {
    const props = makePageProps();
    render(<ReportsPage {...props} />);
    const plot = await screen.findByRole("group", { name: "Maiores gastos do período" });
    fireEvent.keyDown(plot, { key: "ArrowDown" });
    fireEvent.keyDown(plot, { key: "Enter" });
    await waitFor(() => expect(props.openEdit).toHaveBeenCalledWith("transaction", expect.objectContaining({ id: 42 })));
  });

  it("avisa por toast de erro quando o lançamento não abre", async () => {
    const props = makePageProps({ notifyError: vi.fn() });
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/transactions?")) return json({ title: "Falhou." }, 500);
      if (url.startsWith("/api/reports?from=2026-04&to=2026-09")) return json(report());
      return json(previous);
    });
    render(<ReportsPage {...props} />);
    const plot = await screen.findByRole("group", { name: "Maiores gastos do período" });
    fireEvent.keyDown(plot, { key: "ArrowDown" });
    fireEvent.keyDown(plot, { key: "Enter" });
    await waitFor(() => expect(props.notifyError).toHaveBeenCalled());
    expect(props.notify).not.toHaveBeenCalled();
    expect(props.openEdit).not.toHaveBeenCalled();
  });

  it("mostra erro com nova tentativa quando o relatório falha", async () => {
    fetchMock.mockImplementation(async () => json({ title: "Falhou." }, 500));
    render(<ReportsPage {...makePageProps()} />);
    expect(await screen.findByText("Não foi possível carregar o relatório")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });
});

describe("CR-14 e MEL-45 · comparações, maiores gastos e plano", () => {
  it("sem dados no período anterior não mostra \"Subiu\"", async () => {
    const empty = report({ months: report().months.map(item => ({ ...item, income_cents: 0, expense_cents: 0, investment_cents: 0, net_cents: 0 })), net_worth: [],
      totals: { income_cents: 0, expense_cents: 0, investment_cents: 0, net_cents: 0, avg_monthly_income_cents: 0, avg_monthly_expense_cents: 0, savings_rate_pct: null } });
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => String(input).startsWith("/api/reports?from=2025-10") ? json(empty) : json(report()));
    render(<ReportsPage {...makePageProps()} />);
    expect(await screen.findByText(/Sem dados no período anterior/)).toBeTruthy();
    expect(screen.queryByText("Subiu")).toBeNull();
    expect(screen.queryByText(/vs período anterior/)).toBeNull();
  });

  it("agrupa gastos repetidos e data os únicos", async () => {
    const rent = (id: number, date: string) => ({ id, date, description: "Aluguel", category_name: "Moradia", amount_cents: 220_000, currency: "BRL", base_amount_cents: 220_000 });
    const items = [rent(1, "2026-04-05"), rent(2, "2026-05-05"), rent(3, "2026-09-05"), { id: 9, date: "2026-08-12", description: "Notebook", category_name: "Compras", amount_cents: 500_000, currency: "BRL", base_amount_cents: 500_000 }];
    fetchMock.mockImplementation(async () => json(report({ top_expenses: items })));
    render(<ReportsPage {...makePageProps()} />);
    const card = await screen.findByRole("region", { name: "Maiores gastos" });
    const labels = [...card.querySelectorAll("table.chart-table tbody th")].map(cell => cell.textContent);
    expect(labels.map(label => label?.split(" — ")[0])).toEqual(["Aluguel · 3×", "Notebook · 12/08"]);
    expect(labels[0]).toContain("3 lançamentos de 05/04 a 05/09");
  });

  it("compara o realizado de cada balde com o plano no período", async () => {
    const props = makePageProps({ navigate: vi.fn() });
    const state = { ...props.state,
      settings: { ...props.state.settings, monthly_net_income_cents: 500_000, plan_fixed_pct: 70, plan_fun_pct: 20, plan_invest_pct: 10 },
      categories: [{ id: 1, name: "Mercado", kind: "expense" as const, monthly_budget_cents: 0, active: true, bucket: "fixo" as const }] };
    render(<ReportsPage {...props} state={state} />);
    const card = await screen.findByRole("region", { name: "Plano 70-20-10 no período" });
    const list = within(card).getByRole("list", { name: "Distribuição por balde" });
    const rows = within(list).getAllByRole("listitem").map(item => item.textContent);
    // 6 months × R$ 5.000: fixed R$ 10.000 = 33,3% (≤ 70%), leisure 0, invested R$ 3.000 = 10% (≥ 10%).
    expect(rows[0]).toContain("33,3% do salário");
    expect(rows[0]).toContain("Dentro do limite");
    // R1-REL-1: leisure counted nothing while R$ 8.000 has no bucket → "Sem dados", never "Dentro do limite".
    expect(rows[1]).toContain("Sem dados");
    expect(rows[2]).toContain("Mínimo atingido");
    const warning = card.querySelector(".plan-report-warning") as HTMLElement;
    expect(warning.textContent).toMatch(/R\$\s8\.000,00 sem balde/);
    fireEvent.click(within(warning).getByRole("button", { name: /Classificar em Categorias/ }));
    expect(props.navigate).toHaveBeenCalledWith("categories", { balde: "sem" });
  });

  it("troca gráficos vazios por um estado com ação e mostra uma fotografia única como valor (R1-REL-4)", async () => {
    fetchMock.mockImplementation(async () => json(report({ income_categories: [], net_worth: [{ month: "2026-09", total_cents: 1_200_000, bank_cents: 500_000, investments_cents: 700_000 }], currency_exposure: [] })));
    const props = makePageProps();
    render(<ReportsPage {...props} />);
    const income = await screen.findByRole("region", { name: "Receitas por categoria" });
    fireEvent.click(within(income).getByRole("button", { name: "Registrar receita" }));
    expect(props.openModal).toHaveBeenCalledWith("transaction", { kind: "income" });
    const worth = screen.getByRole("region", { name: "Evolução do patrimônio" });
    expect(worth.textContent).toMatch(/Patrimônio em setembro de 2026R\$\s12\.000,00/i);
    expect(within(worth).queryByRole("img")).toBeNull();
    fireEvent.click(within(screen.getByRole("region", { name: "Exposição por moeda" })).getByRole("button", { name: "Cadastrar conta" }));
    expect(props.openModal).toHaveBeenCalledWith("bank-account");
  });
});

describe("ReportsPage · R2", () => {
  it("com uma moeda só mostra uma frase em vez da tabela (R2-REL-3)", async () => {
    fetchMock.mockImplementation(async () => json(report({ currency_exposure: [{ currency: "BRL", native_cents: 7_126_790, base_cents: 7_126_790, share_pct: 100 }] })));
    render(<ReportsPage {...makePageProps()} />);
    const exposure = await screen.findByRole("region", { name: "Exposição por moeda" });
    expect(within(exposure).queryByRole("table")).toBeNull();
    expect(exposure.textContent).toMatch(/100% em real brasileiro · R\$\s71\.267,90/);
  });

  it("sem conexão desativa Exportar CSV e Imprimir (R2-REL-1)", async () => {
    render(<ReportsPage {...makePageProps({ offline: true })} />);
    await screen.findByLabelText("Resumo do período");
    expect(screen.queryByRole("link", { name: /Exportar CSV/ })).toBeNull();
    expect((screen.getByRole("button", { name: /Exportar CSV/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Imprimir/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("o período vazio oferece registrar e ver 12 meses (R2-REL-4)", async () => {
    const empty = report({ months: [{ month: "2026-09", income_cents: 0, expense_cents: 0, investment_cents: 0, net_cents: 0 }], net_worth: [] });
    fetchMock.mockImplementation(async () => json(empty));
    const props = makePageProps();
    render(<ReportsPage {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Registrar lançamento" }));
    expect(props.openModal).toHaveBeenCalledWith("transaction");
    fireEvent.click(screen.getByRole("button", { name: "Ver 12 meses" }));
    expect(screen.getByRole("radio", { name: "12 meses" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("R3 · Relatórios", () => {
  it("sem conexão, o novo período não troca o rótulo dos números antigos (R3-REL-2)", async () => {
    const props = makePageProps();
    const view = render(<ReportsPage {...props} />);
    await screen.findByLabelText("Resumo do período");
    fetchMock.mockImplementation(async () => { throw new TypeError("Failed to fetch"); });
    view.rerender(<ReportsPage {...props} offline />);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Período" })).getByRole("radio", { name: "12 meses" }));
    expect(await screen.findByText(/^Mostrando abr\/26 a set\/26\. O período escolhido \(out\/25 a set\/26\) carrega quando o servidor responder\.$/)).toBeTruthy();
    expect(document.querySelector(".report-period b")?.textContent).toBe("abr/26 a set/26");
    expect(document.querySelector(".report-body")?.className).toContain("is-stale");
    // Decision 1: no page retry while the global banner is up.
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
  });

  it("uma categoria só de receita vira a dica do KPI, sem cartão quase vazio (R3-REL-3, R4-REL-1)", async () => {
    render(<ReportsPage {...makePageProps()} />);
    const kpis = await screen.findByLabelText("Resumo do período");
    expect(kpis.textContent).toMatch(/Toda de Salário\. Média de R\$\s5\.000,00 por mês/);
    expect(screen.queryByRole("region", { name: "Receitas por categoria" })).toBeNull();
  });

  it("a média mensal conta só os meses com lançamentos (R4-REL-2)", async () => {
    const months = report().months.map((item, index) => index < 3 ? { ...item, income_cents: 0, expense_cents: 0, investment_cents: 0, net_cents: 0 } : { ...item, income_cents: 1_000_000 });
    fetchMock.mockImplementation(async () => json(report({ months, totals: { ...report().totals, income_cents: 3_000_000, expense_cents: 900_000 } })));
    render(<ReportsPage {...makePageProps()} />);
    const kpis = await screen.findByLabelText("Resumo do período");
    expect(kpis.textContent).toMatch(/Média de R\$\s10\.000,00 nos 3 meses com lançamentos/);
    expect(kpis.textContent).toMatch(/Média de R\$\s3\.000,00 nos 3 meses com lançamentos/);
  });

  it("período vazio desativa Exportar CSV e Imprimir com o motivo (R3-REL-4)", async () => {
    const empty = report({ months: [{ month: "2026-09", income_cents: 0, expense_cents: 0, investment_cents: 0, net_cents: 0 }], net_worth: [] });
    fetchMock.mockImplementation(async () => json(empty));
    render(<ReportsPage {...makePageProps()} />);
    await screen.findByRole("button", { name: "Registrar lançamento" });
    const csv = screen.getByRole("button", { name: /Exportar CSV/ }) as HTMLButtonElement;
    expect(csv.disabled).toBe(true);
    expect(csv.title).toBe("Nada para exportar neste período.");
    expect((screen.getByRole("button", { name: /Imprimir/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("no celular os maiores gastos são uma lista com o nome inteiro (R3-REL-1)", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width: 560px"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const props = makePageProps();
    render(<ReportsPage {...props} />);
    const list = await screen.findByRole("list", { name: "Maiores gastos do período" });
    const item = within(list).getByRole("button", { name: /Aluguel · 03\/09/ });
    expect(item.textContent).toMatch(/R\$\s2\.500,00/);
    fireEvent.click(item);
    await waitFor(() => expect(props.openEdit).toHaveBeenCalled());
    expect(screen.getByRole("list", { name: "Despesas por forma de pagamento" }).textContent).toContain("Pix");
  });
});
