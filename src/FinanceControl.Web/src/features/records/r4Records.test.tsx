// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, NETWORK_ERROR_MESSAGE } from "../../api/client";
import { reportRequestFailure, reportRequestSuccess, resetConnectivity } from "../../api/connectivity";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { DataTable, type DataTableColumn } from "../../components/ui/DataTable";
import { emptyState, makePageProps } from "../../test/fixtures";
import type { Category, Goal, MonthlySummary } from "../../types";
import { CategoriesPage } from "../catalog/CatalogPages";
import { subscriptionForm } from "../catalog/forms";
import { GoalsPage } from "../planning/PlanningPages";
import { RecordModal } from "./RecordModal";

vi.mock("../../api/client", async importOriginal => {
  const original = await importOriginal<typeof import("../../api/client")>();
  return { ...original, api: { ...original.api, closings: vi.fn(async () => []), create: vi.fn(), reopenMonth: vi.fn(), goalEntriesPage: vi.fn(async () => ({ items: [], total: 0 })) } };
});

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 18, 12)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); resetConnectivity(); });

interface Row { id: number; name: string; day: string; }
const rows: Row[] = [{ id: 1, name: "Aluguel", day: "a" }, { id: 2, name: "Mercado", day: "b" }, { id: 3, name: "Padaria", day: "b" }];
const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Nome", cell: row => row.name, sortValue: row => row.name },
  { id: "actions", header: "", actions: true, cell: row => <button type="button">Editar {row.name}</button> },
];
const compact = { title: (row: Row) => row.name, actions: (row: Row) => <button type="button">Menu {row.name}</button> };

describe("R4-X-1 · tabela que rolaria de lado vira a lista compacta", () => {
  function stubWidths(scroll: number, client: number) {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("table-wrap") ? scroll : 0; });
    const clientSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return client; });
    return () => { scrollSpy.mockRestore(); clientSpy.mockRestore(); };
  }

  it("usa as linhas compactas quando a tabela não cabe e volta à tabela quando cabe", () => {
    const restore = stubWidths(905, 692);
    const { container } = render(<DataTable rows={rows} columns={columns} rowKey={row => row.id} caption="Contas" compact={compact} compactOnOverflow />);
    expect(container.querySelector(".table-wrap")).toBeNull();
    expect(container.querySelector(".ui-data-table")!.className).toContain("is-overflow-compact");
    expect(screen.getByRole("button", { name: "Menu Aluguel" })).toBeTruthy();
    restore();

    // Wider container again (≥ the width the table needed): the table comes back on the next resize.
    const restoreWide = stubWidths(0, 1110);
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(container.querySelector(".table-wrap")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Editar Aluguel" })).toBeTruthy();
    restoreWide();
  });

  it("sem compactOnOverflow a tabela continua (rolagem dentro do wrapper)", () => {
    const restore = stubWidths(905, 692);
    const { container } = render(<DataTable rows={rows} columns={columns} rowKey={row => row.id} caption="Contas" compact={compact} />);
    expect(container.querySelector(".table-wrap")).toBeTruthy();
    restore();
  });
});

describe("R4-LANC-1 · grupos só com 2+ linhas", () => {
  it("dias com um lançamento não ganham cabeçalho quando minRows = 2", () => {
    const { container } = render(<DataTable rows={rows} columns={columns} rowKey={row => row.id} caption="Lançamentos"
      groups={{ key: row => row.day, header: key => <span className="ui-group-title">Dia {key}</span>, minRows: 2 }} />);
    expect([...container.querySelectorAll("tr.ui-group-row")].map(row => row.textContent)).toEqual(["Dia b"]);
    expect(container.querySelectorAll("tbody tr:not(.ui-group-row)")).toHaveLength(3);
  });
});

describe("R4-REC-1 · erro de conexão no formulário", () => {
  it("troca o erro por um aviso quando o servidor volta e mantém o que foi digitado", async () => {
    vi.mocked(api.create).mockRejectedValue(new ApiError(NETWORK_ERROR_MESSAGE, 0));
    render(<ConfirmProvider><RecordModal kind="category" mode="create" initial={{}} state={emptyState} month="2026-09" onClose={vi.fn()} onSaved={vi.fn()} /></ConfirmProvider>);
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Pets" } });
    act(() => { reportRequestFailure(); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Salvar" })); });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Sem conexão com o servidor local. Seus dados continuam aqui; salve quando ele voltar.");
    expect(alert.textContent).not.toContain("Verifique se a aplicação");

    act(() => { reportRequestSuccess(); });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByText("Conexão restabelecida. Tente salvar de novo.")).toBeTruthy();
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Pets");
  });
});

describe("R4-REC-2 · data corrigida pelo app não conta como edição", () => {
  it("Usar 01/10/2026 e Cancelar fecha sem perguntar", async () => {
    vi.mocked(api.closings).mockResolvedValue([{ month: "2026-09" }] as never);
    const onClose = vi.fn();
    render(<ConfirmProvider><RecordModal kind="transaction" mode="create" initial={{}} state={emptyState} month="2026-09" onClose={onClose} onSaved={vi.fn()} onReopenMonth={vi.fn(async () => true)} /></ConfirmProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Usar 01/10/2026" }));
    await waitFor(() => expect(screen.queryByText(/O mês 09\/2026 está fechado/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("R4-REC-5 · dia da cobrança", () => {
  it("nova assinatura começa no dia de hoje", () => {
    const form = subscriptionForm.defaults!({ state: emptyState, month: "2026-09", mode: "create" }, {});
    expect(form.billing_day).toBe("18");
  });
});

describe("R4-SET-1 · gasto fora do plano", () => {
  it("com o plano ativo, avisa que um gasto sem categoria ou sem balde não entra no plano", async () => {
    const categories: Category[] = [{ id: 1, name: "Mercado", kind: "expense", monthly_budget_cents: 0, active: true, bucket: null }];
    const state = { ...emptyState, categories, settings: { ...emptyState.settings, plan_fixed_pct: 70, plan_fun_pct: 20, plan_invest_pct: 10 } };
    render(<ConfirmProvider><RecordModal kind="transaction" mode="create" initial={{ kind: "expense" }} state={state} month="2026-09" onClose={vi.fn()} onSaved={vi.fn()} /></ConfirmProvider>);
    expect(await screen.findByText("Sem categoria, este gasto não entra no plano 70-20-10.")).toBeTruthy();
  });
});

const summary: MonthlySummary = {
  month: "2026-09", income_cents: 0, expense_cents: 0, investment_cents: 0, transactions_count: 0, uncategorized_expense_cents: 0,
  categories: [], bills: { total_count: 0, paid_count: 0, total_cents: 0, paid_cents: 0 },
};

describe("R4-CAT-1 · Categorias sem 'Despesa' repetido", () => {
  it("só receitas e investimentos levam o tipo, ao lado do nome", () => {
    const categories: Category[] = [
      { id: 1, name: "Mercado", kind: "expense", monthly_budget_cents: 0, active: true },
      { id: 2, name: "Lazer", kind: "expense", monthly_budget_cents: 0, active: true },
      { id: 3, name: "Salário", kind: "income", monthly_budget_cents: 0, active: true },
    ];
    render(<ConfirmProvider><CategoriesPage {...makePageProps({ state: { ...emptyState, categories }, summary })} /></ConfirmProvider>);
    expect(screen.queryByRole("columnheader", { name: /Tipo/ })).toBeNull();
    expect(screen.queryByText("Despesa")).toBeNull();
    expect(screen.getByText("Receita")).toBeTruthy();
  });
});

describe("R4-METAS-1 · KPIs contam o que os cards mostram", () => {
  it("Falta soma só o que falta por meta e conta as metas em andamento", () => {
    const goal = (over: Partial<Goal>): Goal => ({ id: 1, name: "Viagem", type: "travel", target_cents: 1_000_000, current_cents: 200_000, target_date: null, currency: "BRL", active: true, ...over });
    const goals = [goal({}), goal({ id: 2, name: "Notebook", target_cents: 500_000, current_cents: 600_000 })];
    render(<ConfirmProvider><GoalsPage {...makePageProps({ state: { ...emptyState, goals }, summary })} /></ConfirmProvider>);
    expect(screen.getByText("1 meta em andamento")).toBeTruthy();
    // 10.000 − 2.000 (the reached goal's surplus does not lower what is missing).
    expect(screen.getByText("Falta").closest(".stat")?.textContent).toContain("8.000,00");
  });
});
