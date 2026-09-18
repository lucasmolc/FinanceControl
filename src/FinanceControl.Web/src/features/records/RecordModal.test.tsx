// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../api/client";
import { todayISO } from "../../lib/date";
import { emptyState } from "../../test/fixtures";
import type { FinanceState, FormState, ModalKind } from "../../types";
import { findOption, hiddenValue, optionLabels, pick } from "../../test/formControls";
import { RecordModal } from "./RecordModal";
import { recordForms } from "./registry";

vi.mock("../../api/client", async importOriginal => {
  const original = await importOriginal<typeof import("../../api/client")>();
  return { ...original, api: { create: vi.fn(), update: vi.fn(), setChecklist: vi.fn(), addBankEntry: vi.fn(), addGoalEntry: vi.fn(), addInvestmentEntry: vi.fn(), payInvoice: vi.fn(), undoInvoicePayment: vi.fn(), closeMonth: vi.fn(), reopenMonth: vi.fn() } };
});

const state: FinanceState = {
  ...emptyState,
  categories: [
    { id: 1, name: "Mercado", kind: "expense", monthly_budget_cents: 0, active: true },
    { id: 2, name: "Salário", kind: "income", monthly_budget_cents: 0, active: true },
  ],
  bills: [{ id: 7, name: "Internet", amount_cents: 9990, due_day: 31, category_id: 1, recurring: true, active: true }],
  bank_accounts: [
    { id: 3, name: "Principal", institution: "Banco A", account_type: "checking", current_balance_cents: 100000, color_label: null, active: true },
    { id: 4, name: "Reserva", institution: "Banco B", account_type: "savings", current_balance_cents: 50000, color_label: null, active: true },
  ],
  cards: [{ id: 9, name: "Visa", closing_day: 25, due_day: 5, real_limit_cents: 0, personal_limit_cents: 0, active: true }],
};

function renderModal(kind: ModalKind, options: { mode?: "create" | "edit"; initial?: FormState; id?: number; onSaved?: () => void; onClose?: () => void } = {}) {
  const onSaved = options.onSaved ?? vi.fn();
  const onClose = options.onClose ?? vi.fn();
  render(<><div className="shell"><button>Origem</button></div><RecordModal kind={kind} mode={options.mode ?? "create"} initial={options.initial ?? {}} id={options.id} state={state} month="2026-09" onClose={onClose} onSaved={onSaved} /></>);
  return { onSaved, onClose };
}

const save = (name = "Salvar") => fireEvent.click(screen.getByRole("button", { name }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("modal de registros", () => {
  it("associa labels, foca o primeiro campo e apresenta validação junto ao controle", async () => {
    const { onSaved } = renderModal("transaction", { initial: { date: "" } });

    // CR-15: the first focus goes to Descrição (the date is usually prefilled).
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Descrição")));
    const date = screen.getByLabelText("Data");
    expect(document.querySelector<HTMLElement>(".shell")?.closest("[inert]")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Novo lançamento" })).toBeTruthy();

    save();
    expect(screen.getByText("Informe a data.")).toBeTruthy();
    expect(date.getAttribute("aria-invalid")).toBe("true");
    expect(api.create).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("fecha com Escape", () => {
    const { onClose } = renderModal("bill");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("bloqueia valor inválido com mensagem no campo", () => {
    renderModal("bill");
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Internet" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "12,5,0" } });
    save();

    expect(screen.getByText("Informe um valor válido, por exemplo 1.234,56.")).toBeTruthy();
    expect(screen.getByLabelText("Valor").getAttribute("aria-invalid")).toBe("true");
    expect(api.create).not.toHaveBeenCalled();
  });

  it("não volta ao padrão ao apagar o dia e informa o erro", () => {
    renderModal("bill");
    const day = screen.getByLabelText("Dia do vencimento") as HTMLInputElement;
    fireEvent.change(day, { target: { value: "" } });
    expect(day.value).toBe("");
    save();
    expect(screen.getByText("Informe um dia entre 1 e 31.")).toBeTruthy();
  });

  it("salva 12.50 como 1250 centavos", async () => {
    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 10 });
    const { onSaved } = renderModal("transaction", { initial: { date: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: " Padaria " } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "12.50" } });
    pick(document.body, "Categoria (opcional)", "Mercado");
    pick(document.body, "Forma de pagamento", "Pix");
    pick(document.body, "Conta bancária (opcional)", "Banco A · Principal");
    save();

    await waitFor(() => expect(api.create).toHaveBeenCalledWith("transactions", {
      date: "2026-09-10", description: "Padaria", kind: "expense", amount_cents: 1250, category_id: 1,
      payment_method: "pix", account_id: 3, card_id: null, notes: null, currency: "BRL", exchange_rate: null, brand: null,
    }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Lançamento registrado."));
  });

  it("filtra categorias pelo tipo e limpa a categoria incompatível", () => {
    renderModal("transaction");
    expect(optionLabels(document.body, "Categoria (opcional)")).toEqual(["Sem categoria", "Mercado"]);
    pick(document.body, "Categoria (opcional)", "Mercado");
    expect(hiddenValue(document.body, "category_id")).toBe("1");
    pick(document.body, "Tipo", "Receita");
    expect(hiddenValue(document.body, "category_id")).toBe("");
    expect(optionLabels(document.body, "Categoria (opcional)")).toEqual(["Sem categoria", "Salário"]);
  });

  it("preenche a edição e envia somente campos editáveis", async () => {
    vi.mocked(api.update).mockResolvedValue({ ok: true });
    const record = { id: 3, name: "Principal", institution: "Banco A", account_type: "checking", current_balance_cents: 100000, color_label: null, active: true };
    const { onSaved } = renderModal("bank-account", { mode: "edit", initial: recordForms["bank-account"].fromRecord!(record), id: 3 });

    expect(screen.getByRole("dialog", { name: "Editar conta bancária" })).toBeTruthy();
    expect((screen.getByLabelText("Nome ou apelido") as HTMLInputElement).value).toBe("Principal");
    expect(screen.queryByLabelText("Saldo inicial")).toBeNull();
    save();

    await waitFor(() => expect(api.update).toHaveBeenCalledWith("bank-accounts", 3, { institution: "Banco A", name: "Principal", account_type: "checking", brand: null, logo_data: null }));
    expect(onSaved).toHaveBeenCalledWith("Conta bancária atualizada.");
  });

  it("pré-preenche valores monetários na edição", () => {
    const bill = state.bills[0]!;
    renderModal("bill", { mode: "edit", initial: recordForms.bill.fromRecord!(bill), id: bill.id });
    expect((screen.getByLabelText("Valor") as HTMLInputElement).value).toBe("99,90");
    expect(screen.getByText("Em meses mais curtos, vence no último dia do mês.")).toBeTruthy();
  });

  it("mapeia erros da API para os campos e usa mensagem geral para os demais", async () => {
    vi.mocked(api.create).mockRejectedValue(new ApiError("Dados inválidos.", 400, { amount_cents: "O valor deve ser maior que zero.", color_label: "Campo não permitido." }));
    const { onSaved } = renderModal("bill");
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Aluguel" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "1.500,00" } });
    save();

    expect(await screen.findByText("O valor deve ser maior que zero.")).toBeTruthy();
    expect(screen.getByLabelText("Valor").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain("Campo não permitido.");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("paga conta lançando despesa com os dados informados", async () => {
    vi.mocked(api.setChecklist).mockResolvedValue({ ok: true, transaction_id: 99 });
    const { onSaved } = renderModal("bill-payment", { initial: { bill_id: 7, month: "2026-08", name: "Internet", amount: 9990 } });

    expect(screen.getByRole("dialog", { name: "Pagar Internet" })).toBeTruthy();
    expect((screen.getByLabelText("Data do pagamento") as HTMLInputElement).value).toBe("31/08/2026");
    expect((screen.getByLabelText("Valor pago") as HTMLInputElement).value).toBe("99,90");
    pick(document.body, "Conta bancária (opcional)", "Banco B · Reserva");
    save("Confirmar pagamento");

    await waitFor(() => expect(api.setChecklist).toHaveBeenCalledWith({
      bill_id: 7, month: "2026-08", paid: true, register_transaction: true, date: "2026-08-31", amount_cents: 9990, account_id: 4, payment_method: "pix",
    }));
    expect(onSaved).toHaveBeenCalledWith("Conta paga e lançada como despesa.");
  });

  it("transfere entre contas exigindo o destino e aceita saldo negativo no ajuste", async () => {
    vi.mocked(api.addBankEntry).mockResolvedValue({ ok: true, id: 1 });
    renderModal("bank-entry", { initial: { account_id: 3, date: "2026-09-01" } });
    expect(screen.getByRole("dialog", { name: "Nova movimentação · Principal" })).toBeTruthy();

    pick(document.body, "Tipo", "Transferência enviada");
    expect(optionLabels(document.body, "Conta de destino")).toEqual(["Selecione a conta", "Banco B · Reserva"]);
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "100" } });
    save("Registrar movimentação");
    expect(screen.getByText("Selecione a conta de destino.")).toBeTruthy();

    pick(document.body, "Tipo", "Ajuste de saldo");
    fireEvent.change(screen.getByLabelText("Novo saldo"), { target: { value: "-250,00" } });
    save("Registrar movimentação");
    await waitFor(() => expect(api.addBankEntry).toHaveBeenCalledWith(3, expect.objectContaining({ kind: "adjustment", amount_cents: -25000, related_account_id: null })));
  });
});

describe("MEL-16 · lançamento vinculado a conta removida", () => {
  const record = { id: 21, date: "2026-09-10", description: "Mercado", category_id: null, category_name: null, kind: "expense", amount_cents: 5_000, payment_method: "pix", account_id: 5, account_name: "Conta antiga", notes: null, card_id: null, card_name: null };

  it("lista a conta removida desabilitada e leva o erro da API ao campo", async () => {
    const message = "A conta vinculada foi removida. Restaure a conta ou escolha outra.";
    vi.mocked(api.update).mockRejectedValue(new ApiError(message, 400, { account_id: message }));
    renderModal("transaction", { mode: "edit", id: 21, initial: recordForms.transaction.fromRecord!(record) });

    const select = screen.getByLabelText("Conta bancária (opcional)");
    expect(select.textContent).toContain("Conta antiga (removida)");
    expect(findOption(document.body, "Conta bancária (opcional)", "Conta antiga (removida)").getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(select, { key: "Escape" });
    expect(screen.getByText(/A conta vinculada foi removida\. Escolha outra conta/)).toBeTruthy();

    save();
    await waitFor(() => expect(select.getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText("Não foi possível salvar.")).toBeNull();

    vi.mocked(api.update).mockResolvedValue({ ok: true });
    pick(document.body, "Conta bancária (opcional)", "Não movimentar conta");
    save();
    await waitFor(() => expect(api.update).toHaveBeenLastCalledWith("transactions", 21, expect.objectContaining({ account_id: null, card_id: null })));
  });
});

describe("MEL-23 · compra no cartão", () => {
  it("mostra o cartão com \"Cartão de crédito\" e esconde a conta quando um cartão é escolhido", async () => {
    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 30 });
    renderModal("transaction", { initial: { date: "2026-09-10", payment_method: "pix" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Livro" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "80" } });
    pick(document.body, "Conta bancária (opcional)", "Banco A · Principal");

    // CR-06: choosing the credit card picks the only card right away.
    pick(document.body, "Forma de pagamento", "Cartão de crédito");
    expect(hiddenValue(document.body, "card_id")).toBe("9");
    expect(screen.queryByLabelText("Conta bancária (opcional)")).toBeNull();
    expect(screen.getByText(/A compra entra na fatura do cartão/)).toBeTruthy();
    save();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("transactions", expect.objectContaining({ payment_method: "card", card_id: 9, account_id: null, amount_cents: 8_000 })));
  });

  it("some com o cartão ao trocar a forma de pagamento", () => {
    renderModal("transaction", { initial: { date: "2026-09-10", card_id: "9" } });
    expect(screen.queryByLabelText("Conta bancária (opcional)")).toBeNull();
    pick(document.body, "Forma de pagamento", "Pix");
    expect(screen.queryByLabelText("Cartão")).toBeNull();
    expect(screen.getByLabelText("Conta bancária (opcional)")).toBeTruthy();
  });
});

describe("MEL-23 · pagamento de fatura", () => {
  it("exige a conta, usa o total como padrão e oferece desfazer", async () => {
    vi.mocked(api.payInvoice).mockResolvedValue({ ok: true, bank_entry_id: 40 });
    vi.mocked(api.undoInvoicePayment).mockResolvedValue(undefined);
    const onSaved = vi.fn();
    renderModal("invoice-payment", { initial: { card_id: 9, card_name: "Visa", month: "2026-10", total_cents: 150_000, due_date: "2026-10-05" }, onSaved });

    const dialog = screen.getByRole("dialog", { name: "Pagar fatura de Outubro/2026 · Visa" });
    expect(within(dialog).getByText(/Total da fatura: R\$\s1\.500,00 · vence em 05\/10\/2026/)).toBeTruthy();
    expect((screen.getByLabelText("Valor pago") as HTMLInputElement).value).toBe("1.500,00");
    save("Pagar fatura");
    expect(screen.getByText("Selecione a conta usada no pagamento.")).toBeTruthy();
    expect(api.payInvoice).not.toHaveBeenCalled();

    pick(document.body, "Conta de pagamento", "Banco A · Principal");
    save("Pagar fatura");
    await waitFor(() => expect(api.payInvoice).toHaveBeenCalledWith(9, "2026-10", { account_id: 3, date: todayISO(), amount_cents: 150_000 }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Fatura paga. A saída foi registrada na conta escolhida.", expect.objectContaining({ message: "Pagamento da fatura desfeito." })));
    const undo = vi.mocked(onSaved).mock.calls[0]![1] as { run: () => Promise<void> };
    await undo.run();
    expect(api.undoInvoicePayment).toHaveBeenCalledWith(9, "2026-10");
  });

  it("mostra \"Esta fatura já foi paga.\" como erro do formulário", async () => {
    vi.mocked(api.payInvoice).mockRejectedValue(new ApiError("Esta fatura já foi paga.", 400, { month: "Esta fatura já foi paga." }));
    renderModal("invoice-payment", { initial: { card_id: 9, month: "2026-10", total_cents: 1_000, account_id: "3" } });
    save("Pagar fatura");
    expect((await screen.findByRole("alert")).textContent).toContain("Esta fatura já foi paga.");
  });
});

describe("MEL-22 · fechamento do mês", () => {
  it("mostra receitas, despesas e resultado, grava as observações e desfaz reabrindo", async () => {
    vi.mocked(api.closeMonth).mockResolvedValue({ ok: true, month: "2026-08", closed_at: "2026-09-01T10:00:00" });
    vi.mocked(api.reopenMonth).mockResolvedValue({ ok: true });
    const onSaved = vi.fn();
    renderModal("month-close", { initial: { month: "2026-08", income_cents: 500_000, expense_cents: 200_000, investment_cents: 50_000 }, onSaved });

    const dialog = screen.getByRole("dialog", { name: "Fechar agosto de 2026" });
    const summary = within(dialog).getByLabelText("Resumo de agosto de 2026");
    expect(within(summary).getByText("Receitas")).toBeTruthy();
    expect(within(summary).getByText("Despesas")).toBeTruthy();
    expect(within(summary).getByText("+R$ 2.500,00", { normalizer: text => text.replace(/\s/g, " ") })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Observações do fechamento (opcional)"), { target: { value: " Conferido " } });
    save("Fechar mês");

    await waitFor(() => expect(api.closeMonth).toHaveBeenCalledWith("2026-08", "Conferido"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Agosto de 2026 foi fechado.", expect.objectContaining({ message: "Agosto de 2026 foi reaberto." })));
    await (vi.mocked(onSaved).mock.calls[0]![1] as { run: () => Promise<void> }).run();
    expect(api.reopenMonth).toHaveBeenCalledWith("2026-08");
  });

  it("mostra o erro da API quando o mês já está fechado", async () => {
    vi.mocked(api.closeMonth).mockRejectedValue(new ApiError("Este mês já está fechado.", 400, { month: "Este mês já está fechado." }));
    renderModal("month-close", { initial: { month: "2026-08" } });
    expect(screen.getByText(/O resumo do mês não está disponível/)).toBeTruthy();
    save("Fechar mês");
    expect((await screen.findByRole("alert")).textContent).toContain("Este mês já está fechado.");
  });
});
