import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./client";
import { connectivityStatus, resetConnectivity } from "./connectivity";

const respond = (status: number, body?: unknown) => vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

afterEach(() => { vi.unstubAllGlobals(); });

describe("api client", () => {
  it("expõe a primeira mensagem de cada campo do ProblemDetails", async () => {
    vi.stubGlobal("fetch", respond(400, { title: "Dados inválidos.", errors: { amount_cents: ["Informe um valor maior que zero.", "outra"], name: ["Informe o nome."] } }));
    const error = await api.create("bills", {}).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).fields).toEqual({ amount_cents: "Informe um valor maior que zero.", name: "Informe o nome." });
    expect((error as ApiError).message).toBe("Informe um valor maior que zero.");
  });

  it("usa o título quando não há campos", async () => {
    vi.stubGlobal("fetch", respond(404, { title: "Registro não encontrado.", status: 404 }));
    await expect(api.restore("bills", 1)).rejects.toMatchObject({ status: 404, message: "Registro não encontrado.", fields: {} });
  });

  it("aceita 204 sem corpo", async () => {
    const fetchMock = respond(204);
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.remove("goals", 5)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/goals/5", expect.objectContaining({ method: "DELETE" }));
  });

  it("informa falha de conexão", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(api.state()).rejects.toMatchObject({ status: 0 });
  });

  it("codifica o mês nas consultas", async () => {
    const fetchMock = respond(200, []);
    vi.stubGlobal("fetch", fetchMock);
    await api.transactions("2026-09");
    expect(fetchMock).toHaveBeenCalledWith("/api/transactions?month=2026-09", undefined);
  });

  it("chama os endpoints de cobrança de assinatura e de reatribuição (MEL-05/MEL-09)", async () => {
    const fetchMock = respond(201, { ok: true, transaction_id: 9, charge_date: "2026-09-17" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.chargeSubscription(3, { date: "2026-09-17", amount_cents: 5_990, account_id: null, payment_method: "card" })).resolves.toMatchObject({ transaction_id: 9 });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/subscriptions/3/charge", expect.objectContaining({ method: "POST", body: JSON.stringify({ date: "2026-09-17", amount_cents: 5_990, account_id: null, payment_method: "card" }) }));
    await api.reassignCategory(4, null);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/categories/4/reassign", expect.objectContaining({ method: "POST", body: JSON.stringify({ target_id: null }) }));
    await api.reassignCard(5, 6);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/cards/5/reassign", expect.objectContaining({ body: JSON.stringify({ target_id: 6 }) }));

    const undoMock = respond(204);
    vi.stubGlobal("fetch", undoMock);
    await expect(api.undoSubscriptionCharge(3, "2026-09-17")).resolves.toBeUndefined();
    expect(undoMock).toHaveBeenCalledWith("/api/subscriptions/3/charge?date=2026-09-17", expect.objectContaining({ method: "DELETE" }));
  });
});

describe("api client · plataforma (MEL-13/14/22/23/41)", () => {
  it("restaura movimentações estornadas", async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await api.restoreGoalEntry(1, 2);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/goals/1/entries/2/restore", expect.objectContaining({ method: "POST" }));
    await api.restoreInvestmentEntry(3, 4);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/investments/3/entries/4/restore", expect.objectContaining({ method: "POST" }));
    await api.restoreBankEntry(5, 6);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/bank-accounts/5/entries/6/restore", expect.objectContaining({ method: "POST" }));
  });

  it("pagina os extratos e lê o total do cabeçalho X-Total-Count", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { "Content-Type": "application/json", "X-Total-Count": "120" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.bankEntriesPage(7, { limit: 50, offset: 50 })).resolves.toEqual({ items: [{ id: 1 }], total: 120 });
    expect(fetchMock).toHaveBeenCalledWith("/api/bank-accounts/7/entries?limit=50&offset=50", undefined);

    vi.stubGlobal("fetch", respond(200, []));
    await expect(api.goalEntriesPage(1, { limit: 50, offset: 0 })).resolves.toEqual({ items: [], total: null });
    await expect(api.investmentEntriesPage(1, { limit: 50, offset: 0 })).resolves.toEqual({ items: [], total: null });
  });

  it("fecha, reabre e lista fechamentos", async () => {
    const fetchMock = respond(200, { ok: true, month: "2026-08", closed_at: "2026-09-01T10:00:00" });
    vi.stubGlobal("fetch", fetchMock);
    await api.closeMonth("2026-08", "Conferido");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/months/2026-08/close", expect.objectContaining({ method: "POST", body: JSON.stringify({ notes: "Conferido" }) }));
    await api.closeMonth("2026-08", null);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/months/2026-08/close", expect.objectContaining({ body: JSON.stringify({}) }));
    await api.reopenMonth("2026-08");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/months/2026-08/reopen", expect.objectContaining({ method: "POST" }));
    await api.closings();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/months/closings", undefined);
  });

  it("chama os endpoints de fatura e de vínculos", async () => {
    const fetchMock = respond(200, []);
    vi.stubGlobal("fetch", fetchMock);
    await api.cardInvoices(9);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/cards/9/invoices", undefined);
    await api.cardInvoices(9, { from: "2026-08", to: "2026-10" });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/cards/9/invoices?from=2026-08&to=2026-10", undefined);
    await api.cardInvoice(9, "2026-10");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/cards/9/invoices/2026-10", undefined);
    await api.payInvoice(9, "2026-10", { account_id: 3, date: "2026-10-04", amount_cents: 1_000 });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/cards/9/invoices/2026-10/pay", expect.objectContaining({ method: "POST", body: JSON.stringify({ account_id: 3, date: "2026-10-04", amount_cents: 1_000 }) }));
    await api.categoryLinks(4);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/categories/4/links", undefined);
    await api.cardLinks(9);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/cards/9/links", undefined);

    const undoMock = respond(204);
    vi.stubGlobal("fetch", undoMock);
    await expect(api.undoInvoicePayment(9, "2026-10")).resolves.toBeUndefined();
    expect(undoMock).toHaveBeenCalledWith("/api/cards/9/invoices/2026-10/pay", expect.objectContaining({ method: "DELETE" }));
  });

  it("chama os endpoints da v1.2 (moedas, débitos automáticos, preferências e reserva)", async () => {
    const fetchMock = respond(200, { created: [] });
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.runAutoDebits()).resolves.toEqual({ created: [] });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/auto-debits/run", expect.objectContaining({ method: "POST" }));

    await api.currencies();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/currencies", undefined);

    await api.settings({ ui_preferences: { hide_values: true }, market_auto_refresh: false });
    const [url, init] = fetchMock.mock.lastCall as unknown as [string, RequestInit];
    expect(url).toBe("/api/settings");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ ui_preferences: { hide_values: true }, market_auto_refresh: false });

    await api.createEmergencyGoal();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/settings/emergency-goal", expect.objectContaining({ method: "POST" }));
  });
});

describe("api client · conectividade com o proxy de desenvolvimento", () => {
  afterEach(() => { resetConnectivity(); });

  it("500 sem ProblemDetails (proxy do Vite com a API parada) conta como falha de conexão e confirma pelo /api/health", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(api.state()).rejects.toMatchObject({ status: 0, message: expect.stringContaining("servidor local") });
    expect(connectivityStatus()).toBe("checking");
    // The health probe gets the same proxy error: the server is down.
    await expect(api.health()).rejects.toMatchObject({ status: 0 });
  });

  it("500 com ProblemDetails é um erro da API: a conexão continua online e a mensagem vem do servidor", async () => {
    vi.stubGlobal("fetch", respond(500, { title: "Não foi possível concluir a operação.", status: 500 }));
    await expect(api.state()).rejects.toMatchObject({ status: 500, message: "Não foi possível concluir a operação." });
    expect(connectivityStatus()).toBe("online");
  });
});

