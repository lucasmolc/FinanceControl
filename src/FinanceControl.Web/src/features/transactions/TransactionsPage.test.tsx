// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { pick } from "../../test/formControls";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { makePageProps } from "../../test/fixtures";
import type { MonthlySummary, Transaction } from "../../types";
import { TransactionsPage } from "./TransactionsPage";
import { matchesTransaction, transactionTotals } from "./transactionsModel";

vi.mock("../../api/client", async importOriginal => ({ ...await importOriginal<typeof import("../../api/client")>(), api: { transactions: vi.fn(), update: vi.fn(), remove: vi.fn(), restore: vi.fn() } }));

/** Header + data rows (day group headers left out, CR-16). */
const rowsOf = (table: HTMLElement) => Array.from(table.querySelectorAll("tr:not(.ui-group-row)"));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 1, date: "2026-09-10", description: "Item", category_id: null, category_name: null, kind: "expense", amount_cents: 1000, payment_method: "card", account_id: null, account_name: null, notes: null, ...overrides,
});

const items: Transaction[] = [
  tx({ id: 1, date: "2026-09-05", description: "Salário", kind: "income", amount_cents: 800_000, payment_method: "transfer", account_id: 2, account_name: "Conta Nubank" }),
  tx({ id: 2, date: "2026-09-08", description: "Supermercado", category_id: 3, category_name: "Alimentação", amount_cents: 45_050, payment_method: "debit", notes: "Compra do mês" }),
  tx({ id: 3, date: "2026-09-09", description: "Tesouro Selic", kind: "investment", amount_cents: 100_000, payment_method: "pix" }),
  tx({ id: 4, date: "2026-09-12", description: "Farmácia", amount_cents: 8_000, payment_method: "pix", notes: "Remédio de crédito" }),
];

describe("filtros de lançamentos", () => {
  it("busca sem acentos em descrição, categoria e observações", () => {
    expect(matchesTransaction(items[1]!, "alimentacao", "all")).toBe(true);
    expect(matchesTransaction(items[3]!, "CREDITO", "all")).toBe(true);
    expect(matchesTransaction(items[3]!, "credito", "income")).toBe(false);
    expect(matchesTransaction(items[0]!, "", "income")).toBe(true);
  });

  it("calcula o saldo do mês", () => {
    expect(transactionTotals(items)).toEqual({ income: 800_000, expense: 53_050, investment: 100_000, balance: 646_950 });
  });
});

describe("página de lançamentos", () => {
  it("lista o mês com datas, sinais, conta ou forma de pagamento e totais", async () => {
    vi.mocked(api.transactions).mockResolvedValue(items);
    render(<TransactionsPage {...makePageProps()} />);

    const table = await screen.findByRole("table");
    expect(api.transactions).toHaveBeenCalledWith("2026-09");
    expect(screen.queryByRole("heading", { name: "Lançamentos" })).toBeNull();
    const rows = rowsOf(table);
    expect(rows).toHaveLength(5);
    const salary = within(table).getByText("Salário").closest("tr")!;
    // R1-LANC-4: the date lives in the day header while grouped by day.
    expect(salary.closest("tbody")!.textContent).toContain("5 de setembro");
    expect(within(salary).getByText("+R$ 8.000,00").className).toContain("positive");
    expect(within(salary).getByText("Conta Nubank")).toBeTruthy();
    const market = within(table).getByText("Supermercado").closest("tr")!;
    expect(within(market).getByText("−R$ 450,50").className).toBe("money");
    expect(within(market).getByText("Cartão de débito")).toBeTruthy();
    expect(within(market).getByText("Compra do mês")).toBeTruthy();
    const invest = within(table).getByText("Tesouro Selic").closest("tr")!;
    expect(within(invest).getByText("Investimento")).toBeTruthy();
    // R1-LANC-1: the investment carries the same "−" as the day total.
    expect(within(invest).getByText("−R$ 1.000,00").className).toBe("money");

    const stats = screen.getByLabelText("Totais de setembro de 2026");
    expect(within(stats).getByText("+R$ 6.469,50")).toBeTruthy();
    expect(within(stats).getByText("−R$ 530,50")).toBeTruthy();
  });

  it("filtra por tipo e busca, com estado vazio próprio", async () => {
    vi.mocked(api.transactions).mockResolvedValue(items);
    render(<TransactionsPage {...makePageProps()} />);
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("radio", { name: "Despesas" }));
    expect(screen.getByRole("radio", { name: "Despesas" }).getAttribute("aria-checked")).toBe("true");
    expect(rowsOf(screen.getByRole("table"))).toHaveLength(3);
    expect(screen.getByText("2 de 4 lançamentos")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar lançamentos" }), { target: { value: "remedio" } });
    expect(within(screen.getByRole("table")).getByText("Farmácia")).toBeTruthy();
    expect(rowsOf(screen.getByRole("table"))).toHaveLength(2);

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar lançamentos" }), { target: { value: "inexistente" } });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("heading", { name: "Nenhum lançamento encontrado" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(rowsOf(screen.getByRole("table"))).toHaveLength(5);
  });

  it("edita e remove pelo lançamento da linha", async () => {
    vi.mocked(api.transactions).mockResolvedValue(items);
    const props = makePageProps();
    render(<TransactionsPage {...props} />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Editar Farmácia" }));
    expect(props.openEdit).toHaveBeenCalledWith("transaction", items[3]);
    fireEvent.click(screen.getByRole("button", { name: "Remover Farmácia" }));
    expect(props.onRemove).toHaveBeenCalledWith("transactions", 4, "Farmácia");
  });

  it("diferencia mês sem lançamentos e falha de carregamento", async () => {
    vi.mocked(api.transactions).mockResolvedValue([]);
    const props = makePageProps();
    render(<TransactionsPage {...props} />);
    expect(await screen.findByRole("heading", { name: "Nenhum lançamento neste mês" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Novo lançamento" })[0]!);
    expect(props.openModal).toHaveBeenCalledWith("transaction");
    cleanup();

    vi.mocked(api.transactions).mockRejectedValueOnce(new Error("Servidor indisponível."));
    render(<TransactionsPage {...makePageProps()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Servidor indisponível.");
    vi.mocked(api.transactions).mockResolvedValue(items);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("table")).toBeTruthy();
  });
});

describe("MEL-07/MEL-09 · estados da lista de lançamentos", () => {
  it("troca de mês sem mostrar as linhas do mês anterior", async () => {
    vi.mocked(api.transactions).mockResolvedValueOnce(items);
    const props = makePageProps();
    const { rerender } = render(<TransactionsPage {...props} />);
    await screen.findByRole("table");

    let resolveAugust: (value: Transaction[]) => void = () => undefined;
    vi.mocked(api.transactions).mockReturnValueOnce(new Promise(resolve => { resolveAugust = resolve; }));
    rerender(<TransactionsPage {...props} month="2026-08" />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Salário")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Carregando lançamentos…");
    expect(document.querySelectorAll(".skeleton-line").length).toBeGreaterThan(0);

    await act(async () => { resolveAugust([tx({ id: 9, date: "2026-08-20", description: "Aluguel de agosto" })]); });
    expect(within(screen.getByRole("table")).getByText("Aluguel de agosto")).toBeTruthy();
  });

  it("desabilita a linha em remoção e marca categorias removidas", async () => {
    vi.mocked(api.transactions).mockResolvedValue(items);
    render(<TransactionsPage {...makePageProps({ removing: { module: "transactions", id: 4 } })} />);
    const table = await screen.findByRole("table");
    const pharmacy = within(table).getByText("Farmácia").closest("tr")!;
    expect(pharmacy.className).toContain("is-removing");
    expect(within(pharmacy).getByText("Removendo…")).toBeTruthy();
    expect(within(pharmacy).queryByRole("button", { name: "Remover Farmácia" })).toBeNull();
    const market = within(table).getByText("Supermercado").closest("tr")!;
    expect(market.textContent).toContain("Alimentação (removido)");
  });
});

const monthSummary = (overrides: Partial<MonthlySummary> = {}): MonthlySummary => ({
  month: "2026-09", income_cents: 800_000, expense_cents: 53_050, investment_cents: 100_000, transactions_count: 4, uncategorized_expense_cents: 0, categories: [],
  bills: { total_count: 0, paid_count: 0, total_cents: 0, paid_cents: 0 }, ...overrides,
});

describe("MEL-22 · mês fechado em Lançamentos", () => {
  it("desabilita incluir, editar e remover e oferece reabrir", async () => {
    vi.mocked(api.transactions).mockResolvedValue(items);
    const onReopenMonth = vi.fn(async () => true);
    render(<TransactionsPage {...makePageProps({ summary: monthSummary({ closed: true, closed_at: "2026-10-01T09:00:00" }), onReopenMonth, onCloseMonth: vi.fn() })} />);
    await screen.findByRole("table");
    const add = screen.getByRole("button", { name: "Novo lançamento" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(add.title).toBe("Mês fechado");
    for (const button of screen.getAllByRole("button", { name: /^(Editar|Remover) / })) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Fechado em 01\/10\/2026/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fechar mês" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reabrir mês" }));
    expect(onReopenMonth).toHaveBeenCalledWith("2026-09");
  });

  it("oferece fechar o mês aberto e nada para meses futuros", async () => {
    vi.mocked(api.transactions).mockResolvedValue(items);
    const onCloseMonth = vi.fn();
    render(<TransactionsPage {...makePageProps({ summary: monthSummary({ closed: false }), onCloseMonth })} />);
    await screen.findByRole("table");
    expect((screen.getByRole("button", { name: "Novo lançamento" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Editar Salário" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Fechar mês" }));
    expect(onCloseMonth).toHaveBeenCalledOnce();
    cleanup();

    vi.mocked(api.transactions).mockResolvedValue([]);
    render(<TransactionsPage {...makePageProps({ month: "2999-01", summary: monthSummary({ month: "2999-01" }), onCloseMonth })} />);
    expect(await screen.findByText("Nenhum lançamento neste mês")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fechar mês" })).toBeNull();
  });
});

describe("MEL-23 · compra no cartão na lista", () => {
  it("mostra o nome do cartão e a forma de pagamento", async () => {
    vi.mocked(api.transactions).mockResolvedValue([tx({ id: 9, description: "Livraria", payment_method: "card", card_id: 3, card_name: "Visa" })]);
    render(<TransactionsPage {...makePageProps()} />);
    const row = (await screen.findByText("Livraria")).closest("tr")!;
    expect(within(row).getByText("Visa")).toBeTruthy();
    expect(row.textContent).toContain("Visa · Cartão de crédito");
  });
});

describe("MEL-38/MEL-26 · filtros por rota e moedas", () => {
  it("aplica categoria e tipo vindos da rota e sincroniza a mudança de filtro", async () => {
    vi.mocked(api.transactions).mockResolvedValue(items);
    const navigate = vi.fn();
    const state = { ...makePageProps().state, categories: [{ id: 3, name: "Alimentação", kind: "expense" as const, monthly_budget_cents: 0, active: true }] };
    const { rerender } = render(<TransactionsPage {...makePageProps({ state, navigate, routeParams: { categoria: "3", tipo: "expense" } })} />);
    const table = await screen.findByRole("table");
    expect(rowsOf(table)).toHaveLength(2);
    expect(within(table).getByText("Supermercado")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Despesas" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Filtrar por categoria" }).textContent).toContain("Alimentação");
    expect(screen.getByText("1 de 4 lançamentos")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Todos" }));
    expect(navigate).toHaveBeenLastCalledWith("transactions", { categoria: "3" });

    // A new drill-down (hash change while on the page) replaces the filters.
    rerender(<TransactionsPage {...makePageProps({ state, navigate, routeParams: { categoria: "sem" } })} />);
    expect(rowsOf(screen.getByRole("table"))).toHaveLength(4);
    expect(within(screen.getByRole("table")).getByText("Salário")).toBeTruthy();
    expect(within(screen.getByRole("table")).queryByText("Supermercado")).toBeNull();
  });

  it("ignora parâmetros inválidos", async () => {
    vi.mocked(api.transactions).mockResolvedValue(items);
    render(<TransactionsPage {...makePageProps({ routeParams: { categoria: "abc", tipo: "outro" } })} />);
    expect(rowsOf(await screen.findByRole("table"))).toHaveLength(5);
  });

  it("mostra o valor na moeda original e o equivalente em reais nos totais", async () => {
    vi.mocked(api.transactions).mockResolvedValue([tx({ id: 7, description: "Hotel", amount_cents: 10_000, currency: "USD", base_amount_cents: 52_000, exchange_rate: "5.2" })]);
    render(<TransactionsPage {...makePageProps()} />);
    const row = (await screen.findByText("Hotel")).closest("tr")!;
    expect(row.textContent).toMatch(/US\$\s100,00/);
    expect(row.textContent).toMatch(/≈ R\$\s520,00/);
    expect(within(screen.getByLabelText("Totais de setembro de 2026")).getAllByText(/R\$\s520,00/).length).toBeGreaterThan(0);
  });
});

describe("CR-16 · lançamentos por dia e em lote", () => {
  const categories = [
    { id: 3, name: "Alimentação", kind: "expense" as const, monthly_budget_cents: 0, active: true },
    { id: 5, name: "Salário", kind: "income" as const, monthly_budget_cents: 0, active: true },
  ];
  const state = { ...makePageProps().state, categories };

  it("agrupa por dia com o saldo do dia", async () => {
    vi.mocked(api.transactions).mockResolvedValue([
      tx({ id: 1, date: "2026-09-12", description: "Farmácia", amount_cents: 8_000 }),
      tx({ id: 2, date: "2026-09-12", description: "Pix recebido", kind: "income", amount_cents: 20_000 }),
      tx({ id: 3, date: "2026-09-08", description: "Padaria", amount_cents: 1_500 }),
    ]);
    render(<TransactionsPage {...makePageProps({ state })} />);
    const table = await screen.findByRole("table");
    const headers = within(table).getAllByRole("rowheader");
    expect(headers).toHaveLength(2);
    expect(headers[0]!.textContent).toContain("sábado, 12 de setembro");
    expect(headers[0]!.textContent).toContain("2 lançamentos");
    expect(headers[0]!.textContent).toMatch(/\+R\$\s120,00/);
    expect(headers[1]!.textContent).toMatch(/−R\$\s15,00/);
    // Sorting by another column shows a flat list.
    fireEvent.click(within(table).getByRole("button", { name: "Valor" }));
    expect(within(table).queryAllByRole("rowheader")).toHaveLength(0);
  });

  it("categoriza vários de uma vez só com categorias do mesmo tipo, com desfazer", async () => {
    vi.mocked(api.transactions).mockResolvedValue([
      tx({ id: 1, description: "Farmácia" }),
      tx({ id: 2, description: "Mercado" }),
      tx({ id: 3, description: "Bônus", kind: "income" }),
    ]);
    vi.mocked(api.update).mockResolvedValue({ ok: true });
    const notify = vi.fn();
    const refresh = vi.fn(async () => undefined);
    render(<ConfirmProvider><TransactionsPage {...makePageProps({ state, notify, refresh })} /></ConfirmProvider>);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos" }));
    const bar = screen.getByRole("region", { name: "Ações em lote" });
    expect(bar.textContent).toContain("3 selecionados");
    fireEvent.click(within(bar).getByRole("button", { name: "Categorizar" }));
    const dialog = screen.getByRole("dialog", { name: "Categorizar 3 lançamentos" });
    pick(dialog, "Categoria", "Alimentação");
    expect(within(dialog).getByRole("status").textContent).toBe("2 lançamentos mudam para Alimentação; 1 lançamento de outro tipo fica como está.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Categorizar" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
    expect(api.update).toHaveBeenCalledWith("transactions", 1, { category_id: 3 });
    expect(api.update).toHaveBeenCalledWith("transactions", 2, { category_id: 3 });
    await waitFor(() => expect(notify).toHaveBeenCalledWith("2 lançamentos em Alimentação.", expect.objectContaining({ label: "Desfazer" })));
    expect(screen.queryByRole("dialog", { name: "Categorizar 3 lançamentos" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Ações em lote" })).toBeNull();
    await notify.mock.calls[0]![1].run();
    expect(api.update).toHaveBeenLastCalledWith("transactions", 2, { category_id: null });
  });

  it("remove vários com uma confirmação e um desfazer", async () => {
    vi.mocked(api.transactions).mockResolvedValue([tx({ id: 1, description: "A" }), tx({ id: 2, description: "B" })]);
    vi.mocked(api.remove).mockResolvedValue(undefined);
    vi.mocked(api.restore).mockResolvedValue({ ok: true });
    const notify = vi.fn();
    render(<ConfirmProvider><TransactionsPage {...makePageProps({ state, notify })} /></ConfirmProvider>);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Ações em lote" })).getByRole("button", { name: "Remover" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover 2" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("2 lançamentos removidos.", expect.objectContaining({ label: "Desfazer" })));
    expect(api.remove).toHaveBeenCalledWith("transactions", 1);
    expect(api.remove).toHaveBeenCalledWith("transactions", 2);
    await notify.mock.calls[0]![1].run();
    expect(api.restore).toHaveBeenCalledTimes(2);
  });

  it("no filtro \"Sem categoria\" convida a categorizar em lote", async () => {
    vi.mocked(api.transactions).mockResolvedValue([tx({ id: 1, description: "A" }), tx({ id: 2, description: "B", category_id: 3, category_name: "Alimentação" })]);
    render(<TransactionsPage {...makePageProps({ state, routeParams: { categoria: "sem" } })} />);
    await screen.findByRole("table");
    const hint = screen.getByRole("note");
    expect(hint.textContent).toContain("1 lançamento sem categoria");
    fireEvent.click(within(hint).getByRole("button", { name: "Selecionar todos" }));
    expect(screen.getByRole("region", { name: "Ações em lote" }).textContent).toContain("1 selecionado");
  });
});
