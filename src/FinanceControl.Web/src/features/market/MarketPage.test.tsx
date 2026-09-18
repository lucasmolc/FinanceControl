// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketData } from "../../api/insights";
import { makePageProps } from "../../test/fixtures";
import { MarketPage } from "./MarketPage";

const market = (overrides: Partial<MarketData> = {}): MarketData => ({
  base: "BRL", auto_refresh: true, last_refresh_at: "2026-09-18T12:00:00Z", last_error: null,
  rates: [
    { currency: "USD", rate_brl: "5.25", change_pct: 0.8, source: "AwesomeAPI", fetched_at: "2026-09-18T12:00:00Z", manual: false, stale: false },
    { currency: "EUR", rate_brl: "6", change_pct: -0.3, source: "Manual", fetched_at: "2026-09-18T12:00:00Z", manual: true, stale: false },
    { currency: "BTC", rate_brl: "350000", change_pct: 2.1, source: "CoinGecko", fetched_at: "2026-09-15T12:00:00Z", manual: false, stale: true },
  ],
  indicators: [
    { code: "ipca_12m", label: "IPCA 12 meses", value: 5.1, unit: "% em 12 meses", reference_date: "2026-08-01", source: "Banco Central (SGS)", fetched_at: "2026-09-18T12:00:00Z", stale: false },
    { code: "selic", label: "Selic", value: 15, unit: "% a.a.", reference_date: "2026-09-17", source: "Banco Central (SGS)", fetched_at: "2026-09-18T12:00:00Z", stale: false },
  ],
  ...overrides,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/market" && method === "GET") return json(market());
    if (url === "/api/market/refresh") return json({ ...market(), refreshed: { rates: 3, indicators: 2 } });
    if (url.startsWith("/api/market/rates/")) return method === "PUT" ? json({ ok: true }) : new Response(null, { status: 204 });
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("MarketPage", () => {
  it("mostra primeiro as suas moedas, fontes uma vez só e recolhe o restante (CR-23)", async () => {
    render(<MarketPage {...makePageProps()} />);
    const yours = await screen.findByRole("region", { name: "Suas moedas" });
    expect(within(yours).getByText(/referências mais usadas/)).toBeTruthy();
    const usd = within(yours).getByText("Dólar americano").closest(".market-card") as HTMLElement;
    expect(usd.textContent).toContain("R$ 5,25");
    expect(usd.textContent).toContain("+0,8%");
    expect(usd.textContent).not.toContain("AwesomeAPI");
    expect(usd.querySelector('.market-card-head .ui-currency-icon[data-currency="USD"]')).toBeTruthy();
    const change = usd.querySelector(".market-change") as HTMLElement;
    expect(change.className).toContain("up");
    expect(change.querySelector("svg[aria-hidden='true']")).toBeTruthy();
    expect(change.textContent).not.toMatch(/[▲▼]/);
    const eur = within(yours).getByText("Euro").closest(".market-card") as HTMLElement;
    expect(within(eur).getByText("Manual")).toBeTruthy();
    expect(within(eur).getByRole("button", { name: "Voltar Euro para a cotação automática" })).toBeTruthy();
    expect(within(yours).getByText("Desatualizada")).toBeTruthy();
    expect(screen.getByText(/fontes: AwesomeAPI \(moedas\) · CoinGecko \(cripto\)/)).toBeTruthy();
    // R1-MKT-1: one timestamp (the status line), no page H2 repeating it.
    expect(screen.queryByRole("heading", { level: 2, name: "Cotações e indicadores" })).toBeNull();
    const others = document.querySelector("details.market-others") as HTMLDetailsElement;
    expect(others.open).toBe(false);
    expect(within(others).getByText("Libra esterlina").closest(".market-card")?.textContent).toContain("Sem cotação");
    const cards = document.querySelectorAll(".indicator");
    expect(cards[0]?.textContent).toContain("Selic");
    expect(cards[0]?.textContent).toContain("vigente em 17/09/2026");
    expect(cards[1]?.textContent).toContain("5,1%");
    expect(cards[1]?.textContent).not.toContain("em 12 meses");
    expect(screen.getByText(/nenhum dado seu é enviado/)).toBeTruthy();
    expect(screen.getByText("Atualização automática ligada")).toBeTruthy();
    // The converter comes before the rest of the catalog.
    const converter = screen.getByRole("region", { name: "Conversor" });
    expect(converter.compareDocumentPosition(others) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("usa as moedas das contas e nunca mostra data de referência futura", async () => {
    fetchMock.mockImplementation(async () => json(market({ indicators: [{ code: "selic", label: "Selic", value: 15, unit: "% a.a.", reference_date: "2999-11-04", source: "Banco Central (SGS)", fetched_at: "2026-09-18T12:00:00Z", stale: false }] })));
    const props = makePageProps();
    const state = { ...props.state, bank_accounts: [{ id: 1, name: "Wise", institution: "Wise", account_type: "checking", current_balance_cents: 1000, color_label: null, active: true, currency: "GBP" }] };
    render(<MarketPage {...props} state={state} />);
    const yours = await screen.findByRole("region", { name: "Suas moedas" });
    expect(within(yours).getByText("Libra esterlina")).toBeTruthy();
    expect(within(yours).queryByText("Dólar americano")).toBeNull();
    const selic = document.querySelector(".indicator") as HTMLElement;
    expect(selic.textContent).not.toContain("2999");
    expect(selic.textContent).toContain("consultado em 18/09/2026");
  });

  it("atualiza agora e avisa o resultado", async () => {
    const props = makePageProps();
    render(<MarketPage {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Atualizar agora" }));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith("Cotações atualizadas: 3 moedas e 2 indicadores."));
    expect(fetchMock).toHaveBeenCalledWith("/api/market/refresh", expect.objectContaining({ method: "POST" }));
  });

  it("mostra a falha da atualização sem perder os valores salvos", async () => {
    const props = makePageProps();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => String(input) === "/api/market/refresh"
      ? json({ ...market({ last_error: "Não foi possível atualizar as cotações agora. Os últimos valores salvos continuam valendo." }), refreshed: { rates: 0, indicators: 0 } })
      : json(market()));
    render(<MarketPage {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Atualizar agora" }));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith(expect.stringMatching(/últimos valores salvos/)));
    expect(screen.getByRole("alert").textContent).toMatch(/últimos valores salvos/);
    expect(screen.getAllByText(/R\$ 5,25/).length).toBeGreaterThan(0);
  });

  it("define uma cotação manual validando o valor", async () => {
    render(<MarketPage {...makePageProps()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Definir cotação manual de Dólar americano" }));
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText("Quanto vale 1 USD em reais");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar cotação" }));
    expect(within(dialog).getByText(/maior que zero/)).toBeTruthy();
    fireEvent.change(input, { target: { value: "5,4321" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar cotação" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/market/rates/USD", expect.objectContaining({ method: "PUT", body: JSON.stringify({ rate_brl: "5.4321" }) })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("volta uma moeda manual para o automático", async () => {
    render(<MarketPage {...makePageProps()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Voltar Euro para a cotação automática" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/market/rates/EUR", expect.objectContaining({ method: "DELETE" })));
  });

  it("sem o servidor local mostra os últimos valores salvos, só para leitura (R1-MKT-3)", async () => {
    window.localStorage.removeItem("lmm.market.last");
    const first = render(<MarketPage {...makePageProps()} />);
    await screen.findByRole("region", { name: "Suas moedas" });
    first.unmount();
    fetchMock.mockImplementation(async () => { throw new TypeError("Failed to fetch"); });
    render(<MarketPage {...makePageProps()} />);
    expect(await screen.findByText(/^Mostrando os valores salvos de/)).toBeTruthy();
    // R3-MKT-1: the global banner owns the retry; no second "Tentar novamente" on the page.
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    expect(screen.getAllByText(/R\$ 5,25/).length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Atualizar agora" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Definir cotação manual de Dólar americano" }) as HTMLButtonElement).disabled).toBe(true);
    window.localStorage.removeItem("lmm.market.last");
  });

  it("converte valores entre moedas e inverte a direção", async () => {
    render(<MarketPage {...makePageProps()} />);
    const converter = await screen.findByRole("region", { name: "Conversor" });
    const result = converter.querySelector("output") as HTMLElement;
    expect(result.textContent).toMatch(/US\$\s100,00 =\s?R\$\s525,00/);
    fireEvent.click(within(converter).getByRole("button", { name: "Inverter moedas" }));
    expect(result.textContent).toMatch(/R\$\s100,00 =\s?US\$\s19,05/);
    const to = within(converter).getByRole("combobox", { name: "Para" });
    expect(to.textContent).toContain("Dólar");
    expect(to.querySelector('.ui-currency-icon[data-currency="USD"]')).toBeTruthy();
    fireEvent.click(to);
    const gbp = screen.getByRole("option", { name: /Libra esterlina/ });
    expect(gbp.querySelector('.ui-currency-icon[data-currency="GBP"]')).toBeTruthy();
    fireEvent.click(gbp);
    expect(to.textContent).toContain("Libra esterlina");
    expect(result.textContent).toMatch(/Sem cotação/);
    fireEvent.change(within(converter).getByLabelText("Valor"), { target: { value: "1,2,3" } });
    expect(within(converter).getByText(/Informe um valor válido em BRL/)).toBeTruthy();
  });

  it("com menos de três moedas próprias mostra as de referência na primeira tela (R3-MKT-2/3)", async () => {
    const props = makePageProps();
    render(<MarketPage {...props} state={{ ...props.state, subscriptions: [{ id: 1, name: "iCloud", currency: "USD" }] as unknown as typeof props.state.subscriptions }} />);
    const yours = await screen.findByRole("region", { name: "Suas moedas" });
    expect(within(yours).getByText("Moedas usadas nas suas contas, contas a pagar, assinaturas, investimentos e metas.")).toBeTruthy();
    const references = screen.getByRole("region", { name: "Referência" });
    expect(within(references).getByText("Euro")).toBeTruthy();
    expect(within(references).getByText("Bitcoin")).toBeTruthy();
    const others = screen.queryByText(/Outras moedas e cripto/)?.closest("details");
    if (others) expect(within(others as HTMLElement).queryByText("Euro")).toBeNull();
  });
});
