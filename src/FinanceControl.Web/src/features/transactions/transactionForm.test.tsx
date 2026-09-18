// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { emptyState } from "../../test/fixtures";
import { hiddenValue, pick } from "../../test/formControls";
import type { FinanceState, FormState, Transaction } from "../../types";
import { RecordModal } from "../records/RecordModal";
import { recordForms } from "../records/registry";
import { nextTransactionForm, paymentDefaults } from "./formModel";

vi.mock("../../api/client", async importOriginal => ({ ...await importOriginal<typeof import("../../api/client")>(), api: { create: vi.fn(), update: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 1, date: "2026-09-10", description: "Item", category_id: null, category_name: null, kind: "expense", amount_cents: 1000, payment_method: "pix", account_id: null, account_name: null, ...overrides,
});

const card = (id: number, name: string) => ({ id, name, closing_day: 25, due_day: 5, real_limit_cents: 0, personal_limit_cents: 0, active: true });

const base: FinanceState = {
  ...emptyState,
  categories: [
    { id: 1, name: "Mercado", kind: "expense", monthly_budget_cents: 0, active: true },
    { id: 2, name: "Assinaturas", kind: "expense", monthly_budget_cents: 0, active: true },
  ],
  cards: [card(9, "Visa"), card(10, "Master")],
};

function renderForm(state: FinanceState, options: { initial?: FormState; mode?: "create" | "edit"; id?: number } = {}) {
  const onSaved = vi.fn(async () => undefined);
  render(<RecordModal kind="transaction" mode={options.mode ?? "create"} initial={options.initial ?? { date: "2026-09-10" }} id={options.id} state={state} month="2026-09" onClose={vi.fn()} onSaved={onSaved} />);
  return { onSaved, dialog: screen.getByRole("dialog") };
}

describe("CR-06 · forma de pagamento e cartão", () => {
  it("usa a forma do último lançamento e só pré-seleciona o cartão quando existe um", () => {
    expect(paymentDefaults({ ...base, transactions: [tx({ id: 3, payment_method: "debit" }), tx({ id: 7, payment_method: "pix" })] })).toEqual({ payment_method: "pix", card_id: "" });
    expect(paymentDefaults({ ...base, transactions: [] })).toEqual({ payment_method: "card", card_id: "" });
    expect(paymentDefaults({ ...base, cards: [card(9, "Visa")], transactions: [] })).toEqual({ payment_method: "card", card_id: "9" });
    expect(paymentDefaults({ ...base, transactions: [tx({ id: 4, payment_method: "card", card_id: 10 })] })).toEqual({ payment_method: "card", card_id: "10" });
    // Without any card a card purchase cannot be the default.
    expect(paymentDefaults({ ...base, cards: [], transactions: [tx({ id: 4, payment_method: "card" })] })).toEqual({ payment_method: "pix", card_id: "" });
  });

  it("exige o cartão quando a forma é cartão de crédito", async () => {
    const { dialog } = renderForm(base);
    fireEvent.change(within(dialog).getByLabelText("Descrição"), { target: { value: "Livro" } });
    fireEvent.change(within(dialog).getByLabelText("Valor"), { target: { value: "80" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(within(dialog).getByText("Escolha o cartão da compra.")).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();

    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 1 });
    pick(dialog, "Cartão", "Master");
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("transactions", expect.objectContaining({ payment_method: "card", card_id: 10 })));
  });

  it("sem cartão cadastrado, explica como seguir", () => {
    const { dialog } = renderForm({ ...base, cards: [] }, { initial: { date: "2026-09-10", payment_method: "card" } });
    expect(within(dialog).getByText("Cadastre um cartão em Cartões ou escolha outra forma de pagamento.")).toBeTruthy();
  });
});

describe("CR-15 · formulário enxuto e em sequência", () => {
  it("guarda moeda, serviço e observações em \"Mais detalhes\", aberto só quando há algo ali", () => {
    const { dialog } = renderForm(base);
    const details = dialog.querySelector("details.form-more") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(dialog).getByText("Mais detalhes")).toBeTruthy();
    cleanup();

    const record = tx({ id: 5, description: "Café", notes: "Com amigos" });
    const edit = renderForm(base, { mode: "edit", id: 5, initial: recordForms.transaction.fromRecord!(record) });
    expect((edit.dialog.querySelector("details.form-more") as HTMLDetailsElement).open).toBe(true);
  });

  it("\"Salvar e lançar outro\" mantém data e forma, limpa o resto e volta o foco à descrição", async () => {
    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 11 });
    const { dialog, onSaved } = renderForm(base, { initial: { date: "2026-09-12", payment_method: "pix" } });
    fireEvent.change(within(dialog).getByLabelText("Descrição"), { target: { value: "Padaria" } });
    fireEvent.change(within(dialog).getByLabelText("Valor"), { target: { value: "12,50" } });
    pick(dialog, "Categoria (opcional)", "Mercado");
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar e lançar outro" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Lançamento registrado.", undefined, { keepOpen: true }));
    await waitFor(() => expect((within(dialog).getByLabelText("Descrição") as HTMLInputElement).value).toBe(""));
    expect((within(dialog).getByLabelText("Valor") as HTMLInputElement).value).toBe("");
    expect(hiddenValue(dialog, "category_id")).toBe("");
    expect(hiddenValue(dialog, "payment_method")).toBe("pix");
    expect((within(dialog).getByLabelText("Data") as HTMLInputElement).value).toBe("12/09/2026");
    expect(within(dialog).getByRole("status").textContent).toContain("Lançamento registrado.");
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText("Descrição")));
  });

  it("nextTransactionForm repete só quando e como foi pago", () => {
    expect(nextTransactionForm({ date: "2026-09-12", kind: "expense", payment_method: "card", card_id: "9", description: "X", amount: "1", notes: "n", brand: "netflix" }))
      .toMatchObject({ date: "2026-09-12", kind: "expense", payment_method: "card", card_id: "9", description: "", amount: "", notes: "", brand: "" });
  });

  it("não oferece \"Salvar e lançar outro\" na edição", () => {
    const record = tx({ id: 5 });
    const { dialog } = renderForm(base, { mode: "edit", id: 5, initial: recordForms.transaction.fromRecord!(record) });
    expect(within(dialog).queryByRole("button", { name: "Salvar e lançar outro" })).toBeNull();
  });
});

describe("CR-26 · categoria sugerida pela marca", () => {
  it("Netflix preenche a categoria Assinaturas, editável", () => {
    const { dialog } = renderForm(base, { initial: { date: "2026-09-10", payment_method: "pix" } });
    fireEvent.change(within(dialog).getByLabelText("Descrição"), { target: { value: "Netflix" } });
    expect(hiddenValue(dialog, "category_id")).toBe("2");
    expect(within(dialog).getByText("Sugerida pelo serviço; você pode trocar.")).toBeTruthy();
    pick(dialog, "Categoria (opcional)", "Mercado");
    expect(hiddenValue(dialog, "category_id")).toBe("1");
    fireEvent.click(within(dialog).getByRole("button", { name: "Usar sugestão: Assinaturas" }));
    expect(hiddenValue(dialog, "category_id")).toBe("2");
  });

  it("na edição só oferece a sugestão, sem trocar a categoria", () => {
    const record = tx({ id: 5, description: "Spotify", brand: "spotify" });
    const { dialog } = renderForm(base, { mode: "edit", id: 5, initial: recordForms.transaction.fromRecord!(record) });
    expect(hiddenValue(dialog, "category_id")).toBe("");
    expect(within(dialog).getByRole("button", { name: "Usar sugestão: Assinaturas" })).toBeTruthy();
  });
});
