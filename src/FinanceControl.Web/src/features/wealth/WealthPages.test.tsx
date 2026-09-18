// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { emptyState, makePageProps } from "../../test/fixtures";
import type { BankStatementItem } from "../../types";
import { currentMonth } from "../../lib/date";
import { AccountsPage, InvestmentsPage } from "./WealthPages";

const statement: BankStatementItem[] = [
  { id: 8, source: "transaction", date: "2026-09-05", description: "Mercado", kind: "expense", amount_cents: 2_000, delta_cents: -2_000, related_account_id: null, related_account_name: null, notes: null },
  { id: 7, source: "entry", date: "2026-09-02", description: "Salário", kind: "deposit", amount_cents: 500_000, delta_cents: 500_000, related_account_id: null, related_account_name: null, notes: null },
];

vi.mock("../../api/client", async importOriginal => ({
  ...await importOriginal<typeof import("../../api/client")>(),
  api: {
    bankEntriesPage: vi.fn(async () => ({ items: statement, total: statement.length })),
    investmentEntriesPage: vi.fn(async () => ({ items: [], total: 0 })),
  },
}));

vi.mock("../../api/insights", () => ({ market: vi.fn(async () => ({
  base: "BRL", auto_refresh: true, last_refresh_at: null, last_error: null,
  rates: [{ currency: "USD", rate_brl: "5", change_pct: 0.4, source: "AwesomeAPI", fetched_at: "2026-09-17T10:00:00", manual: false, stale: false }],
  indicators: [{ code: "cdi", label: "CDI", value: 10.65, unit: "% a.a.", reference_date: null, source: "BCB", fetched_at: "2026-09-17T10:00:00", stale: false }],
})) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("InvestmentsPage", () => {
  it("tones results by sign and shows labels and chips", () => {
    render(<ConfirmProvider><InvestmentsPage {...makePageProps({ state: { ...emptyState, investments: [
      { id: 1, name: "CDB", institution: "Banco X", type: "fixed_income", invested_cents: 100_000, current_cents: 95_000, liquidity: "D+1", benchmark: "CDI", active: true },
    ] } })} /></ConfirmProvider>);
    const card = screen.getByRole("article");
    expect(within(card).getAllByText("Renda fixa").length).toBe(1);
    expect(within(card).getByText("Liquidez: D+1")).toBeTruthy();
    const loss = within(card).getByText(/−R\$/);
    expect(loss.className).toContain("negative");
    expect(within(card).getByText(/de perda/)).toBeTruthy();
    expect(screen.getByText("−5,0%").className).toContain("negative");
  });
});

describe("AccountsPage", () => {
  it("shows balances, last movement and the statement with estorno/remoção", async () => {
    const props = makePageProps({ state: { ...emptyState, bank_accounts: [
      { id: 3, name: "Conta principal", institution: "Banco Y", account_type: "checking", current_balance_cents: -5_000, color_label: null, active: true, last_movement_date: "2026-09-05" },
    ] } });
    render(<ConfirmProvider><div className="shell"><AccountsPage {...props} /></div></ConfirmProvider>);
    expect(screen.getByText("Conta corrente")).toBeTruthy();
    expect(screen.getByText("Saldo negativo")).toBeTruthy();
    // MEL-14: the date comes from the state; no statement request per account.
    expect(screen.getByText("Última movimentação em 05/09/2026")).toBeTruthy();
    expect(api.bankEntriesPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Extrato" }));
    const dialog = await screen.findByRole("dialog", { name: "Extrato · Banco Y · Conta principal" });
    expect(await within(dialog).findByText("Despesa")).toBeTruthy();
    // CR-20: description first, running balance, and the actions in each line's menu.
    const market = within(dialog).getByText("Mercado").closest("tr")!;
    expect(market.textContent).toMatch(/R\$\s50,00$/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Mais ações para entrada de 02/09/2026" }));
    expect(screen.getByRole("menuitem", { name: /^Estornar/ })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Mais ações para despesa de 05/09/2026" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover lançamento" }));
    expect(props.onRemove).toHaveBeenCalledWith("transactions", 8, "Mercado");
    expect(api.bankEntriesPage).toHaveBeenCalledWith(3, { limit: 50, offset: 0 });
  });

  it("MEL-14 · sem movimentações usa o texto neutro", () => {
    render(<ConfirmProvider><AccountsPage {...makePageProps({ state: { ...emptyState, bank_accounts: [
      { id: 4, name: "Carteira", institution: "Dinheiro", account_type: "cash", current_balance_cents: 0, color_label: null, active: true, last_movement_date: null },
    ] } })} /></ConfirmProvider>);
    expect(screen.getByText("Sem movimentações registradas")).toBeTruthy();
  });

  it("MEL-14 · extrato carrega 50 por vez com \"Carregar mais\"", async () => {
    const line = (id: number): BankStatementItem => ({ id, source: "entry", date: "2026-09-02", description: `Entrada ${id}`, kind: "deposit", amount_cents: 100, delta_cents: 100, related_account_id: null, related_account_name: null, notes: null });
    vi.mocked(api.bankEntriesPage)
      .mockResolvedValueOnce({ items: Array.from({ length: 50 }, (_, index) => line(index + 1)), total: 60 })
      .mockResolvedValueOnce({ items: Array.from({ length: 10 }, (_, index) => line(index + 51)), total: 60 });
    render(<ConfirmProvider><AccountsPage {...makePageProps({ state: { ...emptyState, bank_accounts: [
      { id: 3, name: "Conta principal", institution: "Banco Y", account_type: "checking", current_balance_cents: 0, color_label: null, active: true },
    ] } })} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Extrato" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Mostrando 50 de 60")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Carregar mais" }));
    expect(await within(dialog).findByText("Mostrando 60 de 60")).toBeTruthy();
    expect(api.bankEntriesPage).toHaveBeenLastCalledWith(3, { limit: 50, offset: 50 });
    expect(within(dialog).getByText(/Entrada 60/)).toBeTruthy();
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "Carregar mais" })).toBeNull());
  });

  it("MEL-14 · ao atualizar, recarrega as linhas já exibidas", async () => {
    const line = (id: number): BankStatementItem => ({ id, source: "entry", date: "2026-09-02", description: `Entrada ${id}`, kind: "deposit", amount_cents: 100, delta_cents: 100, related_account_id: null, related_account_name: null, notes: null });
    vi.mocked(api.bankEntriesPage)
      .mockResolvedValueOnce({ items: Array.from({ length: 50 }, (_, index) => line(index + 1)), total: 70 })
      .mockResolvedValueOnce({ items: Array.from({ length: 20 }, (_, index) => line(index + 51)), total: 70 })
      .mockResolvedValue({ items: Array.from({ length: 70 }, (_, index) => line(index + 1)), total: 70 });
    const props = makePageProps({ state: { ...emptyState, bank_accounts: [
      { id: 3, name: "Conta principal", institution: "Banco Y", account_type: "checking", current_balance_cents: 0, color_label: null, active: true },
    ] } });
    const view = render(<ConfirmProvider><AccountsPage {...props} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Extrato" }));
    fireEvent.click(await screen.findByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByText("Mostrando 70 de 70")).toBeTruthy();
    view.rerender(<ConfirmProvider><AccountsPage {...props} version={2} /></ConfirmProvider>);
    await waitFor(() => expect(api.bankEntriesPage).toHaveBeenLastCalledWith(3, { limit: 70, offset: 0 }));
  });
});

describe("v1.2 · moedas, logos e menus", () => {
  const usd = { id: 5, name: "Dólares", institution: "Wise", account_type: "payment", current_balance_cents: 10_000, color_label: null, active: true, currency: "USD", brand: "wise" };
  const brl = { id: 6, name: "Principal", institution: "Nubank", account_type: "checking", current_balance_cents: 20_000, color_label: null, active: true };

  it("mostra o saldo nativo, o valor em reais, a variação e o total consolidado", async () => {
    render(<ConfirmProvider><AccountsPage {...makePageProps({ state: { ...emptyState, bank_accounts: [usd, brl] } })} /></ConfirmProvider>);
    const card = screen.getByText("Dólares", { selector: "h3" }).closest("article")!;
    expect(within(card).getByText(/US\$\s100,00/)).toBeTruthy();
    expect(await within(card).findByText(/R\$\s500,00/)).toBeTruthy();
    expect(within(card).getByText("USD +0,4% hoje")).toBeTruthy();
    expect(within(card).getByTitle("USD · Dólar americano")).toBeTruthy();
    expect(card.querySelector(".bank-logo")?.getAttribute("data-brand")).toBe("wise");
    const stats = screen.getByLabelText("Resumo das contas");
    await waitFor(() => expect(within(stats).getAllByText(/R\$\s700,00/).length).toBeGreaterThan(0));
    expect(within(stats).getByText("Em reais, pelas cotações atuais")).toBeTruthy();
  });

  it("edita e remove pelo menu de ações", () => {
    const props = makePageProps({ state: { ...emptyState, bank_accounts: [brl] } });
    render(<ConfirmProvider><AccountsPage {...props} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Mais ações para Nubank · Principal" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Editar" }));
    expect(props.openEdit).toHaveBeenCalledWith("bank-account", brl);
    fireEvent.click(screen.getByRole("button", { name: "Mais ações para Nubank · Principal" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover" }));
    expect(props.onRemove).toHaveBeenCalledWith("bank-accounts", 6, "Principal");
  });

  it("compara com o CDI e bloqueia movimentações com o mês atual fechado (MEL-44)", async () => {
    const month = currentMonth();
    const summary = { month, income_cents: 0, expense_cents: 0, investment_cents: 0, transactions_count: 0, uncategorized_expense_cents: 0, categories: [], bills: { total_count: 0, paid_count: 0, total_cents: 0, paid_cents: 0 }, closed: true, closed_at: `${month}-28T10:00:00` };
    render(<ConfirmProvider><InvestmentsPage {...makePageProps({ month, summary, state: { ...emptyState, investments: [
      { id: 2, name: "CDB Liquidez", institution: "Inter", type: "fixed_income", invested_cents: 100_000, current_cents: 101_000, liquidity: null, benchmark: "110% do CDI", active: true },
    ] } })} /></ConfirmProvider>);
    expect(await screen.findByText("Rende 110% do CDI (≈ 11,72% ao ano hoje)")).toBeTruthy();
    const move = screen.getByRole("button", { name: "Movimentar" }) as HTMLButtonElement;
    expect(move.disabled).toBe(true);
    expect(move.title).toMatch(/^Mês fechado/);
  });
});

describe("CR-25 · alocação e lista de investimentos", () => {
  const investments = [
    { id: 1, name: "CDB", institution: "Banco X", type: "fixed_income", invested_cents: 60_000, current_cents: 60_000, liquidity: "D+0", benchmark: null, active: true },
    { id: 2, name: "Tesouro IPCA", institution: "Tesouro", type: "treasury", invested_cents: 30_000, current_cents: 30_000, liquidity: "No vencimento", benchmark: null, active: true },
    { id: 3, name: "Fundo", institution: "Banco X", type: "fixed_income", invested_cents: 10_000, current_cents: 10_000, liquidity: "diária", benchmark: null, active: true },
  ];

  it("mostra a faixa de alocação por tipo e por liquidez, com percentuais em texto", () => {
    render(<ConfirmProvider><InvestmentsPage {...makePageProps({ state: { ...emptyState, investments } })} /></ConfirmProvider>);
    const section = screen.getByRole("region", { name: "Alocação" });
    expect(within(section).getByRole("img").getAttribute("aria-label")).toBe("Alocação por tipo: Renda fixa 70%, Tesouro Direto 30%");
    fireEvent.click(within(section).getByRole("radio", { name: "Por liquidez" }));
    expect(within(section).getByRole("img").getAttribute("aria-label")).toBe("Alocação por liquidez: Diária (D+0) 70%, No vencimento 30%");
  });

  it("alterna para a lista com as ações no menu", () => {
    const props = makePageProps({ state: { ...emptyState, investments } });
    render(<ConfirmProvider><InvestmentsPage {...props} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("radio", { name: "Lista" }));
    const table = screen.getByRole("table", { name: "Investimentos" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    fireEvent.click(within(table).getByRole("button", { name: "Mais ações para CDB" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Movimentar" }));
    expect(props.openModal).toHaveBeenCalledWith("investment-entry", { investment_id: 1 });
    cleanup();
    // The choice is remembered for this viewer.
    render(<ConfirmProvider><InvestmentsPage {...props} /></ConfirmProvider>);
    expect(screen.getByRole("table", { name: "Investimentos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Cartões" }));
  });
});

describe("CR-20 / MEL-46 · contas", () => {
  const account = (id: number, name: string, balance: number, last: string | null, currency = "BRL") => ({ id, name, institution: "Banco", account_type: "checking", current_balance_cents: balance, color_label: null, active: true, last_movement_date: last, currency });

  it("ordena por maior saldo ou por uso recente", () => {
    render(<ConfirmProvider><AccountsPage {...makePageProps({ state: { ...emptyState, bank_accounts: [account(1, "Carteira", 23_000, "2026-09-10"), account(2, "Principal", 5_480_000, "2026-08-01")] } })} /></ConfirmProvider>);
    const names = () => screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent);
    expect(names()).toEqual(["Principal", "Carteira"]);
    fireEvent.click(screen.getByRole("radio", { name: "Uso recente" }));
    expect(names()).toEqual(["Carteira", "Principal"]);
    fireEvent.click(screen.getByRole("radio", { name: "Maior saldo" }));
  });

  it("moeda sem cotação fica fora do total, com aviso na conta", async () => {
    render(<ConfirmProvider><AccountsPage {...makePageProps({ state: { ...emptyState, missing_rate_currencies: ["EUR"], bank_accounts: [account(1, "Euro", 10_000, null, "EUR"), account(2, "Principal", 20_000, null)] } })} /></ConfirmProvider>);
    const card = screen.getByText("Euro", { selector: "h3" }).closest("article")!;
    expect(within(card).getByText("Sem cotação · fora do total")).toBeTruthy();
    const stats = screen.getByLabelText("Resumo das contas");
    expect(within(stats).getByText(/Sem cotação para EUR/)).toBeTruthy();
    await waitFor(() => expect(within(stats).getAllByText(/R\$\s200,00/).length).toBeGreaterThan(0));
  });
});
