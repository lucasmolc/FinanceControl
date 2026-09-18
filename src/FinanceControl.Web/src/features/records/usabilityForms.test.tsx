// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { emptyState } from "../../test/fixtures";
import type { FinanceState, FormState, ModalKind } from "../../types";
import { goalEntryRows } from "../history/historyRows";
import { hiddenValue, pick, typeDate } from "../../test/formControls";
import { RecordModal } from "./RecordModal";
import type { SavedUndo } from "./types";

vi.mock("../../api/client", async importOriginal => {
  const original = await importOriginal<typeof import("../../api/client")>();
  return { ...original, api: { create: vi.fn(), update: vi.fn(), addBankEntry: vi.fn(), addGoalEntry: vi.fn(), addInvestmentEntry: vi.fn(), chargeSubscription: vi.fn(), undoSubscriptionCharge: vi.fn(), removeGoalEntry: vi.fn() } };
});

const principal = { id: 3, name: "Principal", institution: "Banco A", account_type: "checking", current_balance_cents: 100_000, color_label: null, active: true };
const reserva = { id: 4, name: "Reserva", institution: "Banco B", account_type: "savings", current_balance_cents: 50_000, color_label: null, active: true };

const baseState: FinanceState = {
  ...emptyState,
  bank_accounts: [principal],
  goals: [{ id: 5, name: "Viagem", type: "travel", target_cents: 500_000, current_cents: 120_000, target_date: null, currency: "BRL", active: true }],
  investments: [{ id: 6, name: "CDB", institution: null, type: "fixed_income", invested_cents: 1_000_000, current_cents: 1_200_000, liquidity: null, benchmark: null, active: true }],
  cards: [{ id: 7, name: "Visa", closing_day: 1, due_day: 8, real_limit_cents: 0, personal_limit_cents: 0, active: true }],
  subscriptions: [{ id: 8, name: "Streaming", amount_cents: 5_990, billing_day: 10, category_id: null, category_name: null, card_id: 7, card_name: "Visa", frequency: "monthly", next_billing_date: null, active: true }],
};

function renderModal(kind: ModalKind, initial: FormState = {}, state: FinanceState = baseState) {
  const onSaved = vi.fn<(message: string, undo?: SavedUndo) => void>();
  render(<><div className="shell"><main><div className="page-header"><h2>Página</h2></div></main></div>
    <RecordModal kind={kind} mode="create" initial={initial} state={state} month="2026-09" onClose={vi.fn()} onSaved={onSaved} /></>);
  return { onSaved };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 17, 12)); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

describe("MEL-02 · transferência entre contas", () => {
  it("desabilita a transferência quando não há outra conta ativa e explica o motivo", () => {
    renderModal("bank-entry", { account_id: 3 });
    const transfer = screen.getByRole("radio", { name: "Transferência enviada" }) as HTMLInputElement;
    expect(transfer.disabled).toBe(true);
    expect(screen.getByText("Cadastre outra conta para transferir.")).toBeTruthy();
  });

  it("permite transferir quando existe outra conta", () => {
    renderModal("bank-entry", { account_id: 3 }, { ...baseState, bank_accounts: [principal, reserva] });
    expect((screen.getByRole("radio", { name: "Transferência enviada" }) as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText("Cadastre outra conta para transferir.")).toBeNull();
  });
});

describe("MEL-03 · resgate de investimento", () => {
  it("explica o custo médio, mostra a prévia e bloqueia resgate acima do saldo", () => {
    renderModal("investment-entry", { investment_id: 6 });
    pick(document.body, "Movimentação", "Resgate");
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "6.000,00" } });
    expect(screen.getByText(/O valor aplicado é reduzido na proporção do resgate \(custo médio\)\./).textContent)
      .toMatch(/Depois do resgate: aplicado R\$\s5\.000,00 · atual R\$\s6\.000,00\./);

    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "12.000,01" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar movimentação" }));
    expect(screen.getByText("O resgate é maior que o saldo atual.")).toBeTruthy();
    expect(api.addInvestmentEntry).not.toHaveBeenCalled();
  });
});

describe("MEL-04 · resgate de meta", () => {
  it("troca título e rótulos, mostra o disponível e envia kind withdrawal", async () => {
    vi.mocked(api.addGoalEntry).mockResolvedValue({ ok: true, id: 1 });
    const { onSaved } = renderModal("goal-entry", { goal_id: 5 });
    expect(screen.getByRole("dialog", { name: "Novo aporte · Viagem" })).toBeTruthy();

    pick(document.body, "Movimentação", "Resgate");
    expect(screen.getByRole("dialog", { name: "Resgate · Viagem" })).toBeTruthy();
    expect(screen.getByText("Disponível para resgate: R$ 1.200,00.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Valor do resgate"), { target: { value: "1.500,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar resgate" }));
    expect(screen.getByText("O resgate é maior que o valor guardado na meta.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Valor do resgate"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar resgate" }));
    await waitFor(() => expect(api.addGoalEntry).toHaveBeenCalledWith(5, expect.objectContaining({ kind: "withdrawal", amount_cents: 20_000, date: "2026-09-17" })));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Resgate registrado na meta."));
  });

  it("mostra o tipo e o valor com sinal no histórico", () => {
    const rows = goalEntryRows(5, [
      { id: 1, goal_id: 5, date: "2026-09-01", amount_cents: 30_000, notes: null, kind: "contribution" },
      { id: 2, goal_id: 5, date: "2026-09-02", amount_cents: 10_000, notes: null, kind: "withdrawal" },
    ]);
    expect(rows.map(row => [row.kindLabel, row.deltaCents])).toEqual([["Aporte", 30_000], ["Resgate", -10_000]]);
  });
});

describe("MEL-05 · lançar cobrança de assinatura", () => {
  it("preenche data de hoje, valor e cartão; envia a cobrança e devolve o desfazer", async () => {
    vi.mocked(api.chargeSubscription).mockResolvedValue({ ok: true, transaction_id: 99, charge_date: "2026-09-17" });
    vi.mocked(api.undoSubscriptionCharge).mockResolvedValue(undefined);
    const { onSaved } = renderModal("subscription-charge", { subscription_id: 8 });

    expect(screen.getByRole("dialog", { name: "Lançar cobrança · Streaming" })).toBeTruthy();
    expect((screen.getByLabelText("Data da cobrança") as HTMLInputElement).value).toBe("17/09/2026");
    expect((screen.getByLabelText("Valor cobrado") as HTMLInputElement).value).toBe("59,90");
    expect(hiddenValue(document.body, "payment_method")).toBe("card");
    expect(screen.getByLabelText("Conta bancária (opcional)").textContent).toBe("Não movimentar conta");

    fireEvent.click(screen.getByRole("button", { name: "Lançar cobrança" }));
    await waitFor(() => expect(api.chargeSubscription).toHaveBeenCalledWith(8, { date: "2026-09-17", amount_cents: 5_990, account_id: null, payment_method: "card" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Cobrança lançada.", expect.objectContaining({ message: "Cobrança desfeita." })));

    await onSaved.mock.calls[0]![1]!.run();
    expect(api.undoSubscriptionCharge).toHaveBeenCalledWith(8, "2026-09-17");
  });

  it("usa \"Outro\" como forma de pagamento quando a assinatura não tem cartão", () => {
    renderModal("subscription-charge", { subscription_id: 8 }, { ...baseState, subscriptions: [{ ...baseState.subscriptions[0]!, card_id: null, card_name: null }] });
    expect(hiddenValue(document.body, "payment_method")).toBe("other");
  });
});

describe("MEL-06 · campos opcionais e obrigatórios", () => {
  it("marca opcionais no rótulo e obrigatórios com aria-required", () => {
    renderModal("transaction", { date: "2026-09-10" });
    const description = screen.getByLabelText("Descrição");
    expect(description.getAttribute("aria-required")).toBe("true");
    expect(screen.getByLabelText("Valor").getAttribute("aria-required")).toBe("true");
    expect(screen.getByLabelText("Observações (opcional)").getAttribute("aria-required")).toBeNull();
    expect(screen.getByLabelText("Categoria (opcional)")).toBeTruthy();
    expect(screen.getAllByText("(opcional)").every(element => element.classList.contains("field-optional"))).toBe(true);
  });
});

describe("MEL-12 · próxima cobrança de assinaturas", () => {
  it("exige a próxima cobrança para anuais e semanais e mantém opcional para mensais", async () => {
    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 1 });
    renderModal("subscription");
    expect(screen.getByLabelText("Próxima cobrança (opcional)")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Assinatura"), { target: { value: "Domínio" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "60,00" } });
    pick(document.body, "Periodicidade", "Anual");
    const date = screen.getByLabelText("Próxima cobrança");
    expect(date.getAttribute("aria-required")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Informe a data da próxima cobrança.")).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();

    typeDate(document.body, "Próxima cobrança", "2027-03-01");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("subscriptions", expect.objectContaining({ frequency: "yearly", next_billing_date: "2027-03-01" })));
  });
});
