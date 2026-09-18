// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { emptyState, makePageProps } from "../../test/fixtures";
import type { Card, CardInvoice, Category, MonthlySummary, PageProps, Subscription } from "../../types";
import { CardsPage, CategoriesPage, SubscriptionsPage } from "./CatalogPages";
import { cardInk } from "./cardInk";
import { cardLimitView, currentInvoice, groupInvoices, invoiceMonthLabel, invoicePhase, invoicesToPay } from "./invoiceModel";

vi.mock("../../api/client", async importOriginal => ({
  ...await importOriginal<typeof import("../../api/client")>(),
  api: { cardInvoices: vi.fn(async () => []), cardInvoice: vi.fn(), undoInvoicePayment: vi.fn() },
}));

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 17, 12)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const renderCards = (props: PageProps) => render(<ConfirmProvider><CardsPage {...props} /></ConfirmProvider>);

const categories: Category[] = [
  { id: 1, name: "Mercado", kind: "expense", monthly_budget_cents: 100_000, active: true },
  { id: 2, name: "Lazer", kind: "expense", monthly_budget_cents: 50_000, active: true },
  { id: 3, name: "Salário", kind: "income", monthly_budget_cents: 0, active: true },
];
const summary = {
  month: "2026-09", income_cents: 0, expense_cents: 0, investment_cents: 0, transactions_count: 0, uncategorized_expense_cents: 1_500,
  categories: [{ category_id: 1, name: "Mercado", monthly_budget_cents: 100_000, spent_cents: 85_000, active: true }, { category_id: 2, name: "Lazer", monthly_budget_cents: 50_000, spent_cents: 60_000, active: true }],
  bills: { total_count: 0, paid_count: 0, total_cents: 0, paid_cents: 0 },
} satisfies MonthlySummary;

const sub = (overrides: Partial<Subscription>): Subscription => ({ id: 1, name: "Streaming", amount_cents: 6_000, billing_day: 10, category_id: null, category_name: null, card_id: null, card_name: null, frequency: "monthly", next_billing_date: null, active: true, ...overrides });

describe("CategoriesPage", () => {
  it("shows budget status with text, the month competency and filters by kind", () => {
    render(<CategoriesPage {...makePageProps({ state: { ...emptyState, categories }, summary })} />);
    // R2-CAT-2: the pill only when the limit was passed; otherwise bar + "85% · Restam …".
    expect(screen.queryByText("Perto do limite · 85%")).toBeNull();
    expect([...document.querySelectorAll(".budget-status small")].some(element => /^85% · Restam/.test(element.textContent ?? ""))).toBe(true);
    expect([...document.querySelectorAll(".budget-status .badge")].some(element => /^Excedido · 120% · R\$\s100,00 acima$/.test(element.textContent ?? ""))).toBe(true);
    // CR-11: short month in the header (the page title carries the full month).
    expect(screen.getByRole("columnheader", { name: "Realizado em set." })).toBeTruthy();
    expect(screen.getByText("Sem limite (não é despesa)")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Receitas" }));
    expect(screen.getByRole("radio", { name: "Receitas" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText("Mercado")).toBeNull();
    expect(screen.getByText("Salário")).toBeTruthy();
  });
});

describe("SubscriptionsPage", () => {
  it("shows totals, monthly equivalent and next billing sorted by date", () => {
    render(<SubscriptionsPage {...makePageProps({ state: { ...emptyState, subscriptions: [
      sub({ id: 1, name: "Anual", amount_cents: 120_000, frequency: "yearly", next_billing_date: "2027-03-01" }),
      sub({ id: 2, name: "Música", billing_day: 20, card_id: 9, card_name: "Cartão antigo" }),
    ] } })} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]!.textContent).toContain("Música");
    expect(rows[0]!.textContent).toContain("20/09/2026");
    expect(rows[0]!.textContent).toContain("(removido)");
    expect(rows[1]!.textContent).toContain("01/03/2027");
    expect(screen.getByText("Anual", { selector: ".entity-name" })).toBeTruthy();
    // R1-ASSIN-2: the charged amount and its frequency sit under the monthly equivalent in reais.
    expect(rows[1]!.textContent).toMatch(/R\$\s1\.200,00 · anual/);
  });
});

describe("CardsPage", () => {
  it("shows the best purchase day and subscriptions against the personal limit", () => {
    renderCards(makePageProps({ state: { ...emptyState,
      cards: [{ id: 9, name: "Visa", closing_day: 31, due_day: 8, real_limit_cents: 0, personal_limit_cents: 10_000, active: true }],
      subscriptions: [sub({ card_id: 9, amount_cents: 9_000 })],
    } }));
    expect(screen.getByText("Melhor dia de compra: dia 1")).toBeTruthy();
    expect(screen.getByText("Não informado")).toBeTruthy();
    expect(screen.getByText("Perto do limite")).toBeTruthy();
    // R1-CARD-4: the subscriptions share of the limit is text only (a 1–2% bar said nothing).
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("Perto do limite").closest(".badge")!.className).toContain("warning");
  });
});

describe("MEL-11 · realizado de receitas e investimentos", () => {
  it("mostra o valor recebido/aplicado no mês e adapta o rótulo ao filtro", () => {
    const withInvestment: Category[] = [...categories, { id: 4, name: "Tesouro", kind: "investment", monthly_budget_cents: 0, active: true }];
    const full = {
      ...summary,
      income_categories: [{ category_id: 3, name: "Salário", monthly_budget_cents: 0, spent_cents: 800_000, active: true }],
      investment_categories: [{ category_id: 4, name: "Tesouro", monthly_budget_cents: 0, spent_cents: 100_000, active: true }],
      uncategorized_income_cents: 0, uncategorized_investment_cents: 0,
    } satisfies MonthlySummary;
    render(<CategoriesPage {...makePageProps({ state: { ...emptyState, categories: withInvestment }, summary: full })} />);
    const salary = screen.getByText("Salário").closest("tr")!;
    expect(salary.querySelector("td[data-label='Realizado em set.']")?.textContent).toMatch(/^R\$\s8\.000,00$/);
    const treasury = screen.getByText("Tesouro").closest("tr")!;
    expect(treasury.querySelector("td[data-label='Realizado em set.']")?.textContent).toMatch(/^R\$\s1\.000,00$/);

    fireEvent.click(screen.getByRole("radio", { name: "Receitas" }));
    expect(screen.getByRole("columnheader", { name: "Recebido em set." })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Investimentos" }));
    expect(screen.getByRole("columnheader", { name: "Aplicado em set." })).toBeTruthy();
    expect(screen.queryByText("Salário")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Despesas" }));
    expect(screen.getByRole("columnheader", { name: "Gasto em set." })).toBeTruthy();
  });
});

describe("MEL-05/MEL-12 · assinaturas", () => {
  it("oferece lançar cobrança, mostra o selo do mês e avança a próxima cobrança", () => {
    const props = makePageProps({ state: { ...emptyState, subscriptions: [
      sub({ id: 1, name: "Música", last_charge_date: "2026-09-10" }),
      sub({ id: 2, name: "Domínio", frequency: "yearly", amount_cents: 60_00, next_billing_date: "2025-03-01" }),
      sub({ id: 3, name: "Academia", frequency: "weekly", amount_cents: 25_00, next_billing_date: "2026-09-01" }),
    ] } });
    render(<SubscriptionsPage {...props} />);
    const music = screen.getByText("Música").closest("tr")!;
    expect(music.textContent).toContain("Cobrada em 10/09");
    // CR-26: already charged this month — the action waits in the row menu.
    expect(screen.queryByRole("button", { name: "Lançar cobrança de Música" })).toBeNull();
    fireEvent.click(within(music).getByRole("button", { name: "Mais ações para Música" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Lançar cobrança" }));
    expect(props.openModal).toHaveBeenCalledWith("subscription-charge", { subscription_id: 1 });

    expect(screen.getByText("Domínio").closest("tr")!.textContent).toContain("01/03/2027");
    expect(screen.getByText("Academia").closest("tr")!.textContent).toContain("22/09/2026");
  });

  it("pede a próxima cobrança de anuais/semanais sem data e oferece editar", () => {
    const item = sub({ id: 5, name: "Anuidade", frequency: "yearly", next_billing_date: null });
    const props = makePageProps({ state: { ...emptyState, subscriptions: [item] } });
    render(<SubscriptionsPage {...props} />);
    const row = screen.getByText("Anuidade").closest("tr")!;
    expect(row.textContent).toContain("Informe a próxima cobrança");
    fireEvent.click(screen.getByRole("button", { name: "Informar data" }));
    expect(props.openEdit).toHaveBeenCalledWith("subscription", item);
  });
});

// ── MEL-23 · faturas ───────────────────────────────────────────────────────

const visa: Card = { id: 9, name: "Visa", closing_day: 25, due_day: 5, real_limit_cents: 500_000, personal_limit_cents: 100_000, active: true, open_invoice_cents: 30_000, unpaid_invoices_cents: 85_000, available_limit_cents: 15_000 };

const invoice = (overrides: Partial<CardInvoice>): CardInvoice => ({
  month: "2026-10", period_start: "2026-08-26", period_end: "2026-09-25", closing_date: "2026-09-25", due_date: "2026-10-05",
  total_cents: 30_000, items_count: 2, status: "aberta", paid: null, ...overrides,
});

const invoices: CardInvoice[] = [
  invoice({ month: "2026-09", period_start: "2026-07-26", period_end: "2026-08-25", closing_date: "2026-08-25", due_date: "2026-09-05", total_cents: 55_000, status: "vencida" }),
  invoice({}),
  invoice({ month: "2026-08", period_start: "2026-06-26", period_end: "2026-07-25", closing_date: "2026-07-25", due_date: "2026-08-05", total_cents: 40_000, status: "paga", paid: { amount_cents: 40_000, date: "2026-08-04", account_id: 3, account_name: "Conta principal", bank_entry_id: 12 } }),
];

describe("MEL-23 · invoiceModel", () => {
  it("calcula o uso do limite pelas faturas em aberto e as faturas fechadas a pagar", () => {
    expect(cardLimitView(visa)).toMatchObject({ limitCents: 100_000, usedCents: 85_000, availableCents: 15_000, tone: "warning", label: "Perto do limite" });
    expect(cardLimitView({ ...visa, personal_limit_cents: 0 })).toMatchObject({ limitCents: 500_000 });
    expect(cardLimitView({ ...visa, personal_limit_cents: 0, real_limit_cents: 0 })).toBeNull();
    expect(cardLimitView({ ...visa, unpaid_invoices_cents: undefined })).toBeNull();
    expect(invoicesToPay([visa, { ...visa, id: 10, unpaid_invoices_cents: 30_000 }])).toEqual([{ card: visa, cents: 55_000 }]);
    expect(currentInvoice(invoices)?.month).toBe("2026-10");
    expect(currentInvoice([])).toBeNull();
  });
});

describe("MEL-23 · faturas no cartão", () => {
  beforeEach(() => { vi.mocked(api.cardInvoices).mockResolvedValue(invoices); });

  it("mostra o uso do limite, a fatura atual e as demais com status", async () => {
    renderCards(makePageProps({ state: { ...emptyState, cards: [visa] } }));
    expect(screen.getByText("Perto do limite · 85%")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Uso do limite de Visa" }).getAttribute("aria-valuenow")).toBe("85");
    const panel = screen.getByRole("region", { name: "Faturas de Visa" });
    expect(await within(panel).findByText("Fatura de Outubro/2026")).toBeTruthy();
    expect(within(panel).getByText("Atual")).toBeTruthy();
    expect(within(panel).getByText(/Compras de 26\/08\/2026 a 25\/09\/2026 · fecha em 25\/09\/2026 · vence em 05\/10\/2026/)).toBeTruthy();
    // CR-05: the overdue invoice leads, in coral, with "Pagar fatura" as the main action; the paid one is folded.
    const blocks = panel.querySelectorAll(".invoice-block");
    expect(blocks[0]!.className).toContain("is-vencida");
    expect(blocks[0]!.textContent).toContain("Fatura de Setembro/2026");
    expect(within(blocks[0] as HTMLElement).getByText("Vencida")).toBeTruthy();
    expect(within(blocks[0] as HTMLElement).getByRole("button", { name: "Pagar fatura de Setembro/2026 de Visa" }).className).toContain("primary");
    expect(blocks[1]!.className).toContain("is-atual");
    const others = within(panel).getByRole("list", { name: "Outras faturas de Visa" });
    expect(others.closest("details")!.open).toBe(false);
    expect(within(others).getByText("Paga")).toBeTruthy();
    expect(within(others).getByText(/paga em 04\/08\/2026/)).toBeTruthy();
    expect(api.cardInvoices).toHaveBeenCalledWith(9);
  });

  it("paga pela fatura vencida e desfaz o pagamento da paga", async () => {
    vi.mocked(api.undoInvoicePayment).mockResolvedValue(undefined);
    const props = makePageProps({ state: { ...emptyState, cards: [visa] } });
    renderCards(props);
    fireEvent.click(await screen.findByRole("button", { name: "Pagar fatura de Setembro/2026 de Visa" }));
    expect(props.openModal).toHaveBeenCalledWith("invoice-payment", { card_id: 9, card_name: "Visa", month: "2026-09", total_cents: 55_000, due_date: "2026-09-05" });
    expect(screen.queryByRole("button", { name: "Pagar fatura de Agosto/2026 de Visa" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Desfazer pagamento da fatura de Agosto/2026 de Visa" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Desfazer pagamento" }));
    await waitFor(() => expect(api.undoInvoicePayment).toHaveBeenCalledWith(9, "2026-08"));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith("Pagamento da fatura desfeito."));
    expect(props.refresh).toHaveBeenCalled();
  });

  it("\"Ver fatura\" lista os itens com data, categoria e valor com sinal", async () => {
    vi.mocked(api.cardInvoice).mockResolvedValue({ ...invoices[1]!, items: [
      { id: 2, date: "2026-09-12", description: "Estorno loja", category_id: null, category_name: null, kind: "income", amount_cents: 5_000, payment_method: "card", account_id: null, account_name: null, card_id: 9, card_name: "Visa" },
      { id: 1, date: "2026-09-01", description: "Mercado", category_id: 1, category_name: "Alimentação", kind: "expense", amount_cents: 35_000, payment_method: "card", account_id: null, account_name: null, card_id: 9, card_name: "Visa" },
    ] });
    renderCards(makePageProps({ state: { ...emptyState, cards: [visa] } }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver fatura de Outubro/2026 de Visa" }));
    const dialog = await screen.findByRole("dialog", { name: "Fatura de Outubro/2026 · Visa" });
    const rows = await within(dialog).findAllByRole("row");
    expect(rows[1]!.textContent).toContain("01/09/2026");
    expect(rows[1]!.textContent).toContain("Alimentação");
    expect(within(rows[1]!).getByText("−R$ 350,00", { normalizer: text => text.replace(/\s/g, " ") })).toBeTruthy();
    expect(within(rows[2]!).getByText("+R$ 50,00", { normalizer: text => text.replace(/\s/g, " ") })).toBeTruthy();
    expect(within(rows[2]!).getByText("Sem categoria")).toBeTruthy();
    expect(within(dialog).getByText(/Total da fatura/).textContent).toContain("300,00");
    expect(api.cardInvoice).toHaveBeenCalledWith(9, "2026-10");
  });

  it("mostra o erro ao carregar as faturas", async () => {
    vi.mocked(api.cardInvoices).mockRejectedValue(new Error("Falha na rede."));
    renderCards(makePageProps({ state: { ...emptyState, cards: [visa] } }));
    expect((await screen.findByRole("alert")).textContent).toContain("Falha na rede.");
  });
});

describe("v1.2 · cartões visuais, assinaturas e categorias", () => {
  it("desenha o cartão com emissor, bandeira e tinta legível (MEL-35)", () => {
    renderCards(makePageProps({ state: { ...emptyState, cards: [{ id: 3, name: "Roxinho", closing_day: 3, due_day: 10, real_limit_cents: 0, personal_limit_cents: 0, active: true, brand: "nubank", network: "mastercard", color: "#f2c94c" }] } }));
    const visual = document.querySelector<HTMLElement>(".visual-card")!;
    expect(visual.className).toContain("network-mastercard");
    expect(visual.getAttribute("data-contrast")).toBe("dark");
    expect(visual.style.getPropertyValue("--card-color")).toBe("#f2c94c");
    expect(within(visual).getByText("Nubank")).toBeTruthy();
    expect(within(visual).getByText("Mastercard")).toBeTruthy();
    expect(within(visual).getByText("Vence dia 10")).toBeTruthy();
  });

  it("mostra a marca do serviço e o débito automático na assinatura (MEL-29/39)", () => {
    render(<SubscriptionsPage {...makePageProps({ state: { ...emptyState, subscriptions: [
      sub({ id: 7, name: "Netflix", brand: "netflix", auto_debit: true, account_id: 3, account_name: "Nubank", currency: "USD", amount_cents: 1_599 }),
    ] } })} />);
    const row = screen.getByText("Netflix", { selector: ".entity-name" }).closest("tr")!;
    expect(row.querySelector(".bank-logo")?.getAttribute("data-brand")).toBe("netflix");
    expect(within(row).getByText("Débito automático · Nubank")).toBeTruthy();
    expect(row.textContent).toContain("Lançada automaticamente");
    expect(within(row).getAllByText(/US\$\s15,99/).length).toBeGreaterThan(0);
    expect(screen.getByText("1 em débito automático")).toBeTruthy();
  });

  it("mostra o ícone e a cor da categoria (MEL-39)", () => {
    render(<CategoriesPage {...makePageProps({ state: { ...emptyState, categories: [{ id: 9, name: "Academia", kind: "expense", monthly_budget_cents: 0, active: true, icon: "academia", color: "#57c785" }] } })} />);
    const cell = screen.getByText("Academia", { selector: ".entity-name" }).closest("td")!;
    expect(cell.querySelector("[data-icon='academia']")).toBeTruthy();
  });
});

describe("CR-05 · competência e estados das faturas", () => {
  it("um formato de competência e os estados Vencida · Fechada · Atual · Futura · Paga", () => {
    expect(invoiceMonthLabel("2026-09")).toBe("Setembro/2026");
    const today = "2026-09-17";
    expect(invoicePhase(invoice({ status: "aberta", period_start: "2026-08-26" }), today)).toBe("atual");
    expect(invoicePhase(invoice({ status: "aberta", period_start: "2026-09-26" }), today)).toBe("futura");
    expect(invoicePhase(invoice({ status: "fechada" }), today)).toBe("fechada");
    expect(invoicePhase(invoice({ status: "vencida" }), today)).toBe("vencida");
    expect(invoicePhase(invoice({ status: "aberta", paid: { amount_cents: 1, date: today, account_id: null, account_name: null, bank_entry_id: null } }), today)).toBe("paga");
    const future = invoice({ month: "2026-11", period_start: "2026-09-26" });
    const closed = invoice({ month: "2026-09", status: "fechada" });
    const groups = groupInvoices([future, ...invoices, closed], today);
    expect(groups.due.map(item => item.status)).toEqual(["vencida", "fechada"]);
    expect(groups.current?.month).toBe("2026-10");
    expect(groups.others.map(item => item.month)).toEqual(["2026-11", "2026-08"]);
    // Nothing to pay: an empty closed invoice is folded.
    expect(groupInvoices([invoice({ month: "2026-09", status: "fechada", total_cents: 0 })], today)).toMatchObject({ due: [], current: null });
  });
});

describe("CR-16 · despesas sem categoria levam a Lançamentos", () => {
  it("o KPI âmbar abre Lançamentos filtrado por \"Sem categoria\"", () => {
    const navigate = vi.fn();
    render(<CategoriesPage {...makePageProps({ state: { ...emptyState, categories }, summary, navigate })} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver despesas sem categoria em Lançamentos" }));
    expect(navigate).toHaveBeenCalledWith("transactions", { categoria: "sem", tipo: "expense" });
  });

  it("ordena pelo uso do limite", () => {
    render(<CategoriesPage {...makePageProps({ state: { ...emptyState, categories }, summary })} />);
    fireEvent.click(screen.getByRole("button", { name: "Uso do limite" }));
    fireEvent.click(screen.getByRole("button", { name: "Uso do limite" }));
    const names = screen.getAllByRole("row").slice(1).map(row => row.querySelector(".entity-name")?.textContent);
    expect(names.slice(0, 2)).toEqual(["Lazer", "Mercado"]);
  });
});

describe("CR-21 / MEL-46 · cartões", () => {
  it("sem cor escolhida, o cartão usa a cor do emissor e fica compacto", () => {
    renderCards(makePageProps({ state: { ...emptyState, cards: [{ id: 3, name: "Roxinho", closing_day: 3, due_day: 10, real_limit_cents: 0, personal_limit_cents: 0, active: true, brand: "nubank" }] } }));
    const visual = document.querySelector<HTMLElement>(".visual-card")!;
    expect(visual.style.getPropertyValue("--card-color")).toBe(cardInk("#820ad1").surface);
    expect(visual.className).toContain("is-compact");
    expect(visual.querySelector(".visual-card-number")).toBeNull();
    // R2-CARD-2: issuer and dates live on the card art only.
    expect(screen.queryByText(/^Nubank · Fecha dia 3/)).toBeNull();
    expect(visual.textContent).toContain("Fecha dia 3");
    expect(screen.getByRole("button", { name: "Mais ações para Roxinho" })).toBeTruthy();
  });

  it("soma as assinaturas do cartão em reais e avisa a moeda sem cotação", () => {
    renderCards(makePageProps({ state: { ...emptyState,
      cards: [{ id: 9, name: "Visa", closing_day: 25, due_day: 5, real_limit_cents: 0, personal_limit_cents: 0, active: true }],
      subscriptions: [sub({ id: 1, card_id: 9, amount_cents: 5_000 }), sub({ id: 2, name: "Nuvem", card_id: 9, amount_cents: 1_000, currency: "XYZ" })],
    } }));
    expect(screen.getByText(/^Total mensal equivalente/).textContent).toMatch(/R\$\s50,00/);
    expect(screen.getByText(/Sem cotação para XYZ/)).toBeTruthy();
  });
});

describe("CR-26 · lançar cobrança só quando pendente", () => {
  it("mostra o botão na linha só para a cobrança vencida e não lançada", () => {
    render(<SubscriptionsPage {...makePageProps({ state: { ...emptyState, subscriptions: [
      sub({ id: 1, name: "Pendente", billing_day: 5 }),
      sub({ id: 2, name: "Cobrada", billing_day: 5, last_charge_date: "2026-09-05" }),
      sub({ id: 3, name: "Futura", billing_day: 25 }),
      sub({ id: 4, name: "Automática", billing_day: 5, auto_debit: true, account_id: 1 }),
    ] } })} />);
    expect(screen.getByRole("button", { name: "Lançar cobrança de Pendente" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lançar cobrança de Cobrada" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lançar cobrança de Futura" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lançar cobrança de Automática" })).toBeNull();
    expect(screen.getByText("Cobranças a lançar").closest(".stat")!.textContent).toContain("1");
  });
});
