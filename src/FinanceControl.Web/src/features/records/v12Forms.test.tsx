// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../api/client";
import { market } from "../../api/insights";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { emptyState } from "../../test/fixtures";
import type { FinanceState, FormState, ModalKind } from "../../types";
import { hiddenValue, pick, typeDate } from "../../test/formControls";
import { RecordModal } from "./RecordModal";
import { recordForms } from "./registry";

vi.mock("../../api/client", async importOriginal => {
  const original = await importOriginal<typeof import("../../api/client")>();
  return { ...original, api: { create: vi.fn(), update: vi.fn(), addBankEntry: vi.fn(), addGoalEntry: vi.fn(), addInvestmentEntry: vi.fn(), closings: vi.fn() } };
});
vi.mock("../../api/insights", () => ({ market: vi.fn() }));

const brl = { id: 3, name: "Principal", institution: "Banco A", account_type: "checking", current_balance_cents: 100_000, color_label: null, active: true, currency: "BRL" };
const usd = { id: 4, name: "Dólares", institution: "Wise", account_type: "payment", current_balance_cents: 50_000, color_label: null, active: true, currency: "USD" };
const btc = { id: 5, name: "Carteira", institution: "Binance", account_type: "brokerage", current_balance_cents: 500_000, color_label: null, active: true, currency: "BTC" };

const state: FinanceState = {
  ...emptyState,
  settings: { ...emptyState.settings, monthly_net_income_cents: 800_000, emergency_months_target: 6, emergency_goal_id: 11, emergency_goal_auto: true, emergency_goal_status: "linked", emergency_reserve_target_cents: 4_800_000 },
  bank_accounts: [brl, usd, btc],
  goals: [
    { id: 11, name: "Reserva de emergência", type: "emergency", target_cents: 4_800_000, current_cents: 100_000, target_date: null, currency: "BRL", active: true },
    { id: 12, name: "Viagem", type: "travel", target_cents: 500_000, current_cents: 0, target_date: null, currency: "BRL", active: true },
  ],
  investments: [{ id: 6, name: "Bitcoin", institution: "Binance", type: "crypto", invested_cents: 1_000_000, current_cents: 1_200_000, liquidity: null, benchmark: null, active: true, currency: "BTC" }],
  cards: [{ id: 9, name: "Visa", closing_day: 25, due_day: 5, real_limit_cents: 0, personal_limit_cents: 0, active: true }],
};

function renderModal(kind: ModalKind, options: { mode?: "create" | "edit"; initial?: FormState; id?: number } = {}) {
  const onSaved = vi.fn();
  render(<ConfirmProvider><div className="shell"><button>Origem</button></div>
    <RecordModal kind={kind} mode={options.mode ?? "create"} initial={options.initial ?? {}} id={options.id} state={state} month="2026-09" onClose={vi.fn()} onSaved={onSaved} />
  </ConfirmProvider>);
  return { onSaved };
}

const dialog = () => screen.getAllByRole("dialog")[0]!;
const change = (label: string | RegExp, value: string) => fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });
const save = (name = "Salvar") => fireEvent.click(within(dialog()).getByRole("button", { name }));
const chooseIcon = (query: string) => {
  fireEvent.click(within(dialog()).getByLabelText("Ícone (opcional)"));
  const search = screen.getByRole("combobox", { name: "Buscar ícone" });
  fireEvent.change(search, { target: { value: query } });
  fireEvent.keyDown(search, { key: "Enter" });
};

beforeEach(() => {
  vi.mocked(market).mockResolvedValue({ base: "BRL", auto_refresh: true, last_refresh_at: null, last_error: null, indicators: [], rates: [
    { currency: "USD", rate_brl: "5.1234", change_pct: 0.1, source: "AwesomeAPI", fetched_at: "2026-09-17T10:00:00", manual: false, stale: false },
    { currency: "EUR", rate_brl: "6", change_pct: null, source: "Manual", fetched_at: "2026-09-17T10:00:00", manual: true, stale: false },
  ] });
  vi.mocked(api.closings).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MEL-26 · moedas nos formulários", () => {
  it("lançamento em dólar sem conta: cotação preenchida pelo mercado e valor em reais", async () => {
    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 1 });
    renderModal("transaction", { initial: { date: "2026-09-10", payment_method: "pix" } });
    change("Descrição", "Hotel");
    pick(dialog(), "Moeda", /^USD · Dólar americano/);
    expect(within(dialog()).getByText("US$")).toBeTruthy();
    change("Valor", "10,00");
    await waitFor(() => expect((within(dialog()).getByLabelText("Cotação usada (opcional)") as HTMLInputElement).value).toBe("5,1234"));
    expect(within(dialog()).getByText(/Em reais: R\$\s51,23\./)).toBeTruthy();
    save();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("transactions", expect.objectContaining({ currency: "USD", amount_cents: 1000, exchange_rate: "5.1234", account_id: null })));
  });

  it("a conta define a moeda e a cotação editada é mantida", async () => {
    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 1 });
    renderModal("transaction", { initial: { date: "2026-09-10", payment_method: "pix" } });
    change("Descrição", "Compra");
    pick(dialog(), "Conta bancária (opcional)", "Wise · Dólares · USD");
    const currency = within(dialog()).getByLabelText("Moeda") as HTMLButtonElement;
    expect(hiddenValue(dialog(), "currency")).toBe("USD");
    expect(currency.disabled).toBe(true);
    await waitFor(() => expect((within(dialog()).getByLabelText("Cotação usada (opcional)") as HTMLInputElement).value).toBe("5,1234"));
    change("Cotação usada (opcional)", "5,30");
    change("Valor", "2,50");
    save();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("transactions", expect.objectContaining({ currency: "USD", amount_cents: 250, exchange_rate: "5.3", account_id: 4 })));
  });

  it("compra no cartão é sempre em reais", () => {
    renderModal("transaction", { initial: { date: "2026-09-10", currency: "USD" } });
    // CR-06: the only card comes preselected for a card purchase.
    expect(hiddenValue(dialog(), "card_id")).toBe("9");
    const currency = within(dialog()).getByLabelText("Moeda") as HTMLButtonElement;
    expect(hiddenValue(dialog(), "currency")).toBe("BRL");
    expect(currency.disabled).toBe(true);
    expect(within(dialog()).queryByLabelText(/Cotação usada/)).toBeNull();
  });

  it("valida a cotação digitada", () => {
    renderModal("transaction", { initial: { date: "2026-09-10", payment_method: "pix", currency: "EUR", exchange_rate: "abc", exchange_rate_touched: true } });
    change("Descrição", "Museu");
    change("Valor", "5");
    save();
    expect(within(dialog()).getByText("Informe a cotação em reais por unidade, por exemplo 5,1234.")).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("conta em bitcoin aceita 8 casas no saldo inicial", async () => {
    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 1 });
    renderModal("bank-account");
    change("Instituição", "Binance");
    change("Nome ou apelido", "Cripto");
    pick(dialog(), "Moeda", /^BTC · Bitcoin/);
    change("Saldo inicial (opcional)", "0,005");
    save();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("bank-accounts", expect.objectContaining({ currency: "BTC", current_balance_cents: 500_000, brand: "binance" })));
  });

  it("transferência entre moedas pede o valor recebido na conta destino", async () => {
    vi.mocked(api.addBankEntry).mockResolvedValue({ ok: true, id: 1 });
    renderModal("bank-entry", { initial: { account_id: 3, date: "2026-09-01" } });
    pick(dialog(), "Tipo", "Transferência enviada");
    pick(dialog(), "Conta de destino", "Wise · Dólares · USD");
    change("Valor enviado", "520,00");
    save("Registrar movimentação");
    expect(within(dialog()).getByText("Informe o valor recebido na conta de destino.")).toBeTruthy();
    change("Valor recebido na conta destino", "100,00");
    expect(within(dialog()).getByText("Cotação usada: 1 USD = 5,2 BRL")).toBeTruthy();
    save("Registrar movimentação");
    await waitFor(() => expect(api.addBankEntry).toHaveBeenCalledWith(3, expect.objectContaining({ kind: "transfer_out", amount_cents: 52_000, related_account_id: 4, related_amount_cents: 10_000 })));
  });

  it("só pede o valor recebido quando o destino tem outra moeda", () => {
    renderModal("bank-entry", { initial: { account_id: 4, date: "2026-09-01" } });
    pick(dialog(), "Tipo", "Transferência enviada");
    expect(within(dialog()).queryByLabelText(/Valor recebido/)).toBeNull();
    pick(dialog(), "Conta de destino", "Binance · Carteira · BTC");
    expect(within(dialog()).getByLabelText("Valor recebido na conta destino")).toBeTruthy();
    expect(within(dialog()).getByText("₿")).toBeTruthy();
  });

  it("edição em moeda estrangeira formata com as casas da moeda", () => {
    const record = { id: 20, date: "2026-09-02", description: "Café", category_id: null, category_name: null, kind: "expense", amount_cents: 350, payment_method: "pix", account_id: null, account_name: null, currency: "EUR", exchange_rate: "6.1", base_amount_cents: 2135 };
    renderModal("transaction", { mode: "edit", id: 20, initial: recordForms.transaction.fromRecord!(record) });
    expect((within(dialog()).getByLabelText("Valor") as HTMLInputElement).value).toBe("3,50");
    expect((within(dialog()).getByLabelText("Cotação usada (opcional)") as HTMLInputElement).value).toBe("6,1");
  });
});

describe("MEL-29 · débito automático", () => {
  it("conta a pagar com débito automático exige a conta debitada", async () => {
    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 1 });
    renderModal("bill");
    change("Nome", "Netflix");
    change("Valor", "55,90");
    pick(dialog(), "Débito automático");
    expect(within(dialog()).getByRole("switch", { name: "Débito automático" }).getAttribute("aria-checked")).toBe("true");
    expect(within(dialog()).getByText("Lançado automaticamente no vencimento.")).toBeTruthy();
    save();
    expect(within(dialog()).getByText("Escolha a conta que será debitada.")).toBeTruthy();
    pick(dialog(), "Conta debitada", "Banco A · Principal");
    save();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("bills", expect.objectContaining({ auto_debit: true, account_id: 3, currency: "BRL", brand: "netflix", amount_cents: 5590 })));
  });

  it("assinatura com cartão não exige conta", async () => {
    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 1 });
    renderModal("subscription");
    change("Assinatura", "Spotify");
    change("Valor", "21,90");
    pick(dialog(), "Cartão (opcional)", "Visa");
    pick(dialog(), "Débito automático");
    expect(within(dialog()).queryByLabelText("Conta debitada")).toBeNull();
    save();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("subscriptions", expect.objectContaining({ auto_debit: true, card_id: 9, account_id: null, brand: "spotify" })));
  });
});

describe("MEL-33/35/39 · marcas, logos, ícones e cartões", () => {
  it("cartão envia emissor, bandeira e cor", async () => {
    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 1 });
    renderModal("card");
    change("Nome", "Nubank Ultravioleta");
    expect(hiddenValue(dialog(), "brand")).toBe("nubank");
    expect((within(dialog()).getByLabelText("Emissor (opcional)") as HTMLInputElement).value).toBe("Nubank");
    expect(within(dialog()).getByText("Sugerido pelo nome; você pode trocar.")).toBeTruthy();
    pick(dialog(), "Bandeira (opcional)", "Mastercard");
    fireEvent.click(within(dialog()).getByRole("radio", { name: "Roxo" }));
    save();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("cards", expect.objectContaining({ brand: "nubank", network: "mastercard", color: "#820ad1" })));
  });

  it("categoria sugere o ícone pelo nome até o usuário escolher", async () => {
    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 1 });
    renderModal("category");
    change("Nome", "Academia");
    expect(hiddenValue(dialog(), "icon")).toBe("academia");
    chooseIcon("pets");
    change("Nome", "Academia e pets");
    expect(hiddenValue(dialog(), "icon")).toBe("pets");
    fireEvent.click(within(dialog()).getByRole("button", { name: /Usar sugestão: Academia/ }));
    expect(hiddenValue(dialog(), "icon")).toBe("academia");
    chooseIcon("pets");
    save();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("categories", expect.objectContaining({ icon: "pets", color: null })));
  });

  it("recusa logo em formato ou tamanho inválido", async () => {
    renderModal("bank-account");
    const input = within(dialog()).getByLabelText("Logo (opcional)") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "logo.gif", { type: "image/gif" })] } });
    expect((await within(dialog()).findByRole("alert")).textContent).toMatch(/Use uma imagem PNG, JPG, WEBP ou SVG de até 150 KB\./);
  });
});

describe("MEL-43 · meta de reserva automática", () => {
  const reserve = state.goals[0]!;

  it("confirma antes de desligar o cálculo automático e envia detach_auto", async () => {
    vi.mocked(api.update).mockResolvedValue({ ok: true });
    renderModal("goal", { mode: "edit", id: 11, initial: recordForms.goal.fromRecord!(reserve) });
    expect(within(dialog()).getByText(/Calculado automaticamente: 6 meses × R\$\s8\.000,00 de salário líquido\./)).toBeTruthy();
    change("Valor da meta", "50.000,00");
    save();
    const confirm = await screen.findByRole("alertdialog", { name: "Desligar o cálculo automático da reserva?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Desligar e salvar" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith("goals", 11, expect.objectContaining({ target_cents: 5_000_000, detach_auto: true })));
  });

  it("manter automático não salva e explica no campo", async () => {
    renderModal("goal", { mode: "edit", id: 11, initial: recordForms.goal.fromRecord!(reserve) });
    change("Valor da meta", "50.000,00");
    save();
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Manter automático" }));
    expect(await within(dialog()).findByText("Esta meta acompanha o salário. Confirme para desligar o cálculo automático.")).toBeTruthy();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("sem mudar o alvo salva direto", async () => {
    vi.mocked(api.update).mockResolvedValue({ ok: true });
    renderModal("goal", { mode: "edit", id: 11, initial: recordForms.goal.fromRecord!(reserve) });
    change("Nome da meta", "Reserva");
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith("goals", 11, expect.not.objectContaining({ detach_auto: true })));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("trata o 400 do servidor quando a meta vinculada não era conhecida", async () => {
    const message = "Esta meta acompanha o salário. Confirme para desligar o cálculo automático.";
    vi.mocked(api.update).mockRejectedValueOnce(new ApiError(message, 400, { target_cents: message })).mockResolvedValueOnce({ ok: true });
    renderModal("goal", { mode: "edit", id: 12, initial: recordForms.goal.fromRecord!(state.goals[1]!) });
    change("Valor da meta", "6.000,00");
    save();
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Desligar e salvar" }));
    await waitFor(() => expect(api.update).toHaveBeenLastCalledWith("goals", 12, expect.objectContaining({ detach_auto: true })));
  });
});

describe("MEL-44 · movimentações em mês fechado", () => {
  it("desabilita aporte em meta com data em mês fechado", async () => {
    vi.mocked(api.closings).mockResolvedValue([{ month: "2026-08", closed_at: "2026-09-01T10:00:00", notes: null, summary: null }]);
    renderModal("goal-entry", { initial: { goal_id: 12, date: "2026-08-15" } });
    const button = within(dialog()).getByRole("button", { name: "Registrar aporte" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(within(dialog()).getByText("O mês 08/2026 está fechado. Reabra-o para registrar movimentações.")).toBeTruthy();
    typeDate(dialog(), "Data", "2026-09-02");
    expect(button.disabled).toBe(false);
  });

  it("desabilita movimentação de investimento em mês fechado", async () => {
    vi.mocked(api.closings).mockResolvedValue([{ month: "2026-09", closed_at: "2026-09-30T10:00:00", notes: null, summary: null }]);
    renderModal("investment-entry", { initial: { investment_id: 6, date: "2026-09-10" } });
    const button = within(dialog()).getByRole("button", { name: "Registrar movimentação" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(button.title).toBe("O mês 09/2026 está fechado. Reabra-o para registrar movimentações.");
  });

  it("valor de investimento em bitcoin usa 8 casas", async () => {
    vi.mocked(api.addInvestmentEntry).mockResolvedValue({ ok: true, id: 1 });
    renderModal("investment-entry", { initial: { investment_id: 6, date: "2026-09-10" } });
    change("Valor", "0,001");
    save("Registrar movimentação");
    await waitFor(() => expect(api.addInvestmentEntry).toHaveBeenCalledWith(6, expect.objectContaining({ amount_cents: 100_000 })));
  });
});
