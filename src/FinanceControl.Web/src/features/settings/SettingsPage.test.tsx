// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../api/client";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { DEFAULT_PREFERENCES } from "../../lib/preferences";
import { getPreferences, resetPreferencesForTests, setPreferences } from "../../lib/preferencesStore";
import { emptyState, makePageProps } from "../../test/fixtures";
import type { PageProps, Settings } from "../../types";
import { SettingsPage } from "./SettingsPage";
import { activeSection } from "./settingsModel";

vi.mock("../../api/client", async importOriginal => ({
  ...await importOriginal<typeof import("../../api/client")>(),
  api: { settings: vi.fn(), about: vi.fn(), restoreBackup: vi.fn(), closings: vi.fn(), reopenMonth: vi.fn(), createEmergencyGoal: vi.fn(), createFreedomGoal: vi.fn(), plan: vi.fn(), clearPlan: vi.fn(), backupUrl: "/api/backup", databaseBackupUrl: "/api/backup/database" },
}));

const settings: Settings = {
  id: 1, setup_completed: true, display_name: "Lucas", currency: "BRL",
  monthly_net_income_cents: 800000, monthly_spending_limit_cents: 300000, emergency_months_target: 6, tour_completed: true,
};

const renderSettings = (overrides: Partial<PageProps> = {}, onError = vi.fn(), help: { onReplayTour?: () => void; onRevisitSetup?: () => void } = {}) => {
  const props = makePageProps({ state: { ...emptyState, settings }, ...overrides });
  render(<ConfirmProvider><SettingsPage {...props} onError={onError} {...help} /></ConfirmProvider>);
  return props;
};

beforeEach(() => {
  vi.mocked(api.closings).mockResolvedValue([]);
  vi.mocked(api.about).mockResolvedValue({ database_path: "C:\\Projects\\FinanceControl\\src\\FinanceControl.Api\\Data\\finance.db", schema_version: "004_movements" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetPreferencesForTests();
});

describe("perfil e planejamento", () => {
  it("mantém os dados editáveis e calcula a meta da reserva", () => {
    renderSettings();
    expect(screen.getByRole("textbox", { name: "Nome (opcional)" })).toHaveProperty("value", "Lucas");
    expect(screen.getByRole("textbox", { name: "Teto de gastos do mês (opcional)" })).toHaveProperty("value", "3.000,00");
    expect(screen.getByRole("spinbutton", { name: "Meses de reserva" })).toHaveProperty("value", "6");
    const planning = screen.getByRole("region", { name: "Perfil e planejamento" });
    expect(within(planning).getByText("R$ 48.000,00")).toBeTruthy();
    expect(within(planning).getByText("6 meses × R$ 8.000,00 de salário líquido")).toBeTruthy();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Meses de reserva" }), { target: { value: "9" } });
    expect(within(planning).getByText("R$ 72.000,00")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Renda líquida mensal (opcional)" }), { target: { value: "" } });
    expect(within(planning).getByText("Defina o salário líquido para calcular a reserva.")).toBeTruthy();
  });

  it("controla alterações não salvas e permite descartar", () => {
    renderSettings();
    const save = screen.getByRole("button", { name: "Salvar configurações" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.queryByText("Alterações não salvas")).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "Renda líquida mensal (opcional)" }), { target: { value: "8000" } });
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: "Renda líquida mensal (opcional)" }), { target: { value: "8500" } });
    expect(save.disabled).toBe(false);
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Descartar alterações" }));
    expect(screen.getByRole("textbox", { name: "Renda líquida mensal (opcional)" })).toHaveProperty("value", "8.000,00");
    expect(save.disabled).toBe(true);
  });

  it("salva nome e planejamento no mesmo formulário", async () => {
    vi.mocked(api.settings).mockResolvedValue({ ok: true });
    const refresh = vi.fn(async () => undefined);
    renderSettings({ refresh });

    fireEvent.change(screen.getByRole("textbox", { name: "Nome (opcional)" }), { target: { value: "  Lucas M.  " } });
    fireEvent.change(screen.getByRole("textbox", { name: "Renda líquida mensal (opcional)" }), { target: { value: "8500.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));

    await waitFor(() => expect(api.settings).toHaveBeenCalledWith({
      display_name: "Lucas M.",
      monthly_net_income_cents: 850050,
      monthly_spending_limit_cents: 300000,
      emergency_months_target: 6,
    }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("não salva valores inválidos nem meses fora da faixa", () => {
    renderSettings();
    fireEvent.change(screen.getByRole("textbox", { name: "Teto de gastos do mês (opcional)" }), { target: { value: "abc" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Meses de reserva" }), { target: { value: "121" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));

    expect(screen.getByText("Informe um valor válido, por exemplo 1.234,56.")).toBeTruthy();
    expect(screen.getByText("Informe um número inteiro de 1 a 120 meses.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Teto de gastos do mês (opcional)" }).getAttribute("aria-invalid")).toBe("true");
    expect(api.settings).not.toHaveBeenCalled();
  });

  it("leva o erro do servidor para o campo correspondente", async () => {
    vi.mocked(api.settings).mockRejectedValue(new ApiError("Dados inválidos.", 400, { emergency_months_target: "Informe de 1 a 120 meses." }));
    const onError = vi.fn();
    renderSettings({}, onError);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Meses de reserva" }), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));
    expect(await screen.findByText("Informe de 1 a 120 meses.")).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });

  it("sem conexão desabilita o que salva e diz por quê (decisão 4)", () => {
    renderSettings({ offline: true, state: { ...emptyState, settings: { ...settings, plan_fixed_pct: 70, plan_fun_pct: 20, plan_invest_pct: 10 } } });
    fireEvent.change(screen.getByRole("textbox", { name: "Renda líquida mensal (opcional)" }), { target: { value: "8500" } });
    const save = screen.getByRole("button", { name: "Salvar configurações" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(save.title).toBe("Sem conexão com o servidor local.");
    for (const button of screen.getAllByRole("button", { name: /Editar plano/ })) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("switch", { name: "Atualizar cotações automaticamente" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("com plano ativo o teto é do plano: só leitura, com Editar plano (R3-CFG-1)", () => {
    renderSettings({ state: { ...emptyState, settings: { ...settings, monthly_spending_limit_cents: 720000, plan_fixed_pct: 70, plan_fun_pct: 20, plan_invest_pct: 10 } } });
    const limit = screen.getByRole("textbox", { name: "Teto de gastos do mês" }) as HTMLInputElement;
    expect(limit.readOnly).toBe(true);
    expect(limit.value).toMatch(/R\$\s7\.200,00/);
    expect(screen.getByText(/Definido pelo plano 70-20-10: fixos \+ lazer\. Para mudar, edite o plano\./)).toBeTruthy();
    const perfil = screen.getByRole("region", { name: "Perfil e planejamento" });
    fireEvent.click(within(perfil).getByRole("button", { name: "Editar plano" }));
    expect(screen.getByRole("button", { name: "Salvar plano" })).toBeTruthy();
  });

  it("avisa quando o teto é maior que a renda", () => {
    renderSettings();
    fireEvent.change(screen.getByRole("textbox", { name: "Teto de gastos do mês (opcional)" }), { target: { value: "9.000,00" } });
    expect(screen.getByText("Atenção: o teto de gastos é maior que a renda informada.")).toBeTruthy();
  });
});

describe("cópia de segurança", () => {
  const upload = (content: string, name = "backup.json") => {
    const input = screen.getByLabelText("Arquivo da cópia de segurança (JSON)");
    fireEvent.change(input, { target: { files: [new File([content], name, { type: "application/json" })] } });
  };

  it("oferece exportações e mostra o arquivo do banco com \"Copiar caminho\" (CR-22)", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const props = renderSettings();
    expect(screen.getByRole("link", { name: /Exportar dados \(JSON\)/ }).getAttribute("href")).toBe("/api/backup");
    expect(screen.getByRole("link", { name: /Baixar cópia do banco/ }).getAttribute("href")).toBe("/api/backup/database");
    const path = "C:\\Projects\\FinanceControl\\src\\FinanceControl.Api\\Data\\finance.db";
    expect((await screen.findByText("finance.db")).getAttribute("title")).toBe(path);
    expect(screen.getByText(path).closest("details")).toBeTruthy();
    expect(screen.getByText("Versão do esquema: 004_movements")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copiar caminho" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(path));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith("Caminho do banco copiado."));
  });

  it("recusa arquivos que não são JSON de backup com um aviso de erro", async () => {
    const notifyError = vi.fn();
    renderSettings({ notifyError });
    upload("isto não é json");
    await waitFor(() => expect(notifyError).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining("Não foi possível ler o arquivo") })));
    upload(JSON.stringify({ hello: "world" }));
    await waitFor(() => expect(notifyError).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining("não parece uma cópia de segurança") })));
    expect(api.restoreBackup).not.toHaveBeenCalled();
  });

  it("confirma, restaura e informa a cópia automática", async () => {
    vi.mocked(api.restoreBackup).mockResolvedValue({ ok: true, safety_copy: "C:\\dados\\backups\\antes-da-restauracao-20260917-101500.db", restored: { goals: 1 } });
    const props = renderSettings();
    const document = { version: 3, exported_at: new Date(2026, 8, 17, 6, 9).toISOString(), data: { settings: [{ id: 1 }], goals: [{ id: 1 }], transactions: [{ id: 1 }, { id: 2 }] } };
    upload(JSON.stringify(document), "lmm-2026-09-17.json");

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/lmm-2026-09-17\.json/).textContent).toContain("3 registros");
    // R4-CFG-2: when the copy was made (local time).
    expect(within(dialog).getByText(/lmm-2026-09-17\.json/).textContent).toContain("exportada em 17/09/2026 às 06:09");
    fireEvent.click(within(dialog).getByRole("button", { name: "Substituir dados" }));

    await waitFor(() => expect(api.restoreBackup).toHaveBeenCalledWith(document));
    // R1-CFG-7: the file name (not the whole path) and a "Copiar caminho" action; the card keeps the safety copy listed.
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith("Cópia restaurada. Os dados anteriores foram salvos em antes-da-restauracao-20260917-101500.db.", expect.objectContaining({ label: "Copiar caminho" })));
    expect(props.refresh).toHaveBeenCalled();
    expect(screen.getByText("Cópia automática feita antes da última restauração:")).toBeTruthy();
  });

  it("não restaura quando a confirmação é cancelada", async () => {
    renderSettings();
    upload(JSON.stringify({ version: 3, data: {} }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.restoreBackup).not.toHaveBeenCalled();
  });
});

describe("MEL-25 · Ajuda", () => {
  it("oferece rever o tour guiado e revisar o planejamento inicial", () => {
    const onReplayTour = vi.fn();
    const onRevisitSetup = vi.fn();
    renderSettings({}, vi.fn(), { onReplayTour, onRevisitSetup });
    const help = screen.getByRole("region", { name: "Ajuda" });
    fireEvent.click(within(help).getByRole("button", { name: "Rever tour guiado" }));
    expect(onReplayTour).toHaveBeenCalledOnce();
    fireEvent.click(within(help).getByRole("button", { name: "Revisar planejamento inicial" }));
    expect(onRevisitSetup).toHaveBeenCalledOnce();
  });
});

describe("MEL-22 · fechamentos", () => {
  it("lista os meses fechados com observações e resultado e reabre pelo callback", async () => {
    vi.mocked(api.closings).mockResolvedValue([
      { month: "2026-07", closed_at: "2026-08-02T09:00:00", notes: null, summary: null },
      { month: "2026-08", closed_at: "2026-09-01 10:00:00", notes: "Conferido", summary: { month: "2026-08", income_cents: 100_000, expense_cents: 30_000, investment_cents: 20_000, transactions_count: 3, uncategorized_expense_cents: 0, categories: [], bills: { total_count: 0, paid_count: 0, total_cents: 0, paid_cents: 0 } } },
    ]);
    const onReopenMonth = vi.fn(async () => true);
    renderSettings({ onReopenMonth });
    const list = await screen.findByRole("list", { name: "Meses fechados" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]!.textContent).toContain("Agosto de 2026");
    expect(items[0]!.textContent).toContain("Fechado em 01/09/2026 · Conferido");
    expect(within(items[0]!).getByText("+R$ 500,00", { normalizer: text => text.replace(/\s/g, " ") })).toBeTruthy();
    expect(items[1]!.textContent).toContain("Julho de 2026");
    fireEvent.click(within(items[1]!).getByRole("button", { name: "Reabrir julho de 2026" }));
    await waitFor(() => expect(onReopenMonth).toHaveBeenCalledWith("2026-07"));
  });

  it("mostra o estado vazio", async () => {
    renderSettings();
    expect(await screen.findByText("Nenhum mês fechado ainda. Feche um mês pelo Painel ou por Lançamentos.")).toBeTruthy();
  });
});

describe("MEL-43 · reserva de emergência", () => {
  const linkedGoal = { id: 5, name: "Reserva de emergência", type: "emergency", target_cents: 4_800_000, current_cents: 1_000_000, target_date: null, currency: "BRL", active: true };

  it("mostra a meta vinculada sem repetir o cálculo do Perfil (CR-22)", () => {
    renderSettings({ state: { ...emptyState, goals: [linkedGoal], settings: { ...settings, emergency_goal_id: 5, emergency_goal_status: "linked", emergency_goal_auto: true, emergency_reserve_target_cents: 4_800_000 } } });
    const section = screen.getByRole("region", { name: "Reserva de emergência" });
    expect(within(section).queryByText("6 meses × R$ 8.000,00 de salário líquido")).toBeNull();
    expect(section.querySelector(".reserve-calculation")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Perfil e planejamento" })).getByText("6 meses × R$ 8.000,00 de salário líquido")).toBeTruthy();
    expect(within(section).getByText("Vinculada")).toBeTruthy();
    expect(section.textContent).toMatch(/R\$\s10\.000,00 guardados de R\$\s48\.000,00/);
    expect(within(section).getByRole("switch", { name: "Calcular a reserva automaticamente" }).getAttribute("aria-checked")).toBe("true");
  });

  it("oferece criar novamente quando a meta foi removida", async () => {
    vi.mocked(api.createEmergencyGoal).mockResolvedValue({ ok: true, id: 9 });
    const props = renderSettings({ state: { ...emptyState, settings: { ...settings, emergency_goal_id: 5, emergency_goal_status: "removed" } } });
    const section = screen.getByRole("region", { name: "Reserva de emergência" });
    expect(within(section).getByText("Removida")).toBeTruthy();
    fireEvent.click(within(section).getByRole("button", { name: "Criar novamente" }));
    await waitFor(() => expect(api.createEmergencyGoal).toHaveBeenCalledOnce());
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith("Meta de reserva criada e vinculada ao salário."));
    expect(props.refresh).toHaveBeenCalled();
  });

  it("sem salário não cria nada e explica", () => {
    renderSettings({ state: { ...emptyState, settings: { ...settings, monthly_net_income_cents: 0, emergency_goal_status: "none" } } });
    const section = screen.getByRole("region", { name: "Reserva de emergência" });
    expect(within(section).getByText("Informe o salário líquido em Perfil e planejamento para criar a meta.")).toBeTruthy();
    expect(within(section).queryByRole("button", { name: /Criar/ })).toBeNull();
  });

  it("desliga o cálculo automático e avisa falhas com toast", async () => {
    vi.mocked(api.settings).mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error("Sem conexão."));
    const notifyError = vi.fn();
    const props = renderSettings({ notifyError, state: { ...emptyState, settings: { ...settings, emergency_goal_status: "linked", emergency_goal_auto: true } } });
    const toggle = screen.getByRole("switch", { name: "Calcular a reserva automaticamente" });
    fireEvent.click(toggle);
    await waitFor(() => expect(api.settings).toHaveBeenCalledWith({ emergency_goal_auto: false }));
    await waitFor(() => expect(props.notify).toHaveBeenCalled());
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(toggle);
    await waitFor(() => expect(notifyError).toHaveBeenCalled());
  });
});

describe("MEL-30 · aparência e mercado", () => {
  it("troca tema, destaque, densidade e animações salvando as preferências", async () => {
    vi.mocked(api.settings).mockResolvedValue({ ok: true });
    renderSettings();
    const section = screen.getByRole("region", { name: "Aparência" });
    fireEvent.click(within(section).getByRole("button", { name: /Grafite/ }));
    expect(getPreferences().theme).toBe("grafite");
    expect(document.documentElement.dataset.theme).toBe("grafite");
    fireEvent.click(within(section).getByRole("button", { name: "Violeta" }));
    expect(within(section).getByRole("button", { name: "Violeta" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(section).getByRole("radio", { name: "Compacto" }));
    fireEvent.click(within(section).getByRole("switch", { name: "Animações" }));
    fireEvent.click(within(section).getByRole("switch", { name: "Ocultar valores" }));
    expect(getPreferences()).toMatchObject({ theme: "grafite", accent: "violeta", density: "compacto", animations: false, hide_values: true });
    await waitFor(() => expect(api.settings).toHaveBeenLastCalledWith({ ui_preferences: expect.objectContaining({ hide_values: true }) }));
  });

  it("mostra, oculta e reordena os widgets do painel", () => {
    vi.mocked(api.settings).mockResolvedValue({ ok: true });
    setPreferences({ ...DEFAULT_PREFERENCES, dashboard_widgets: ["saldo", "metas"] });
    renderSettings();
    const list = screen.getByRole("list", { name: "Widgets do painel" });
    fireEvent.click(within(list).getByRole("button", { name: "Mover Metas para cima" }));
    expect(getPreferences().dashboard_widgets).toEqual(["metas", "saldo"]);
    fireEvent.click(within(list).getByRole("switch", { name: "Mostrar Fluxo de 6 meses" }));
    expect(getPreferences().dashboard_widgets).toEqual(["metas", "saldo", "fluxo"]);
    fireEvent.click(within(list).getByRole("switch", { name: "Mostrar Metas" }));
    expect(getPreferences().dashboard_widgets).toEqual(["saldo", "fluxo"]);
  });

  it("volta a preferência e avisa quando não consegue salvar", async () => {
    vi.mocked(api.settings).mockRejectedValue(new Error("Falhou."));
    const notifyError = vi.fn();
    renderSettings({ notifyError });
    fireEvent.click(within(screen.getByRole("region", { name: "Aparência" })).getByRole("switch", { name: "Cotações no painel" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(getPreferences().show_market_ticker).toBe(true);
  });

  it("liga e desliga a atualização automática das cotações", async () => {
    vi.mocked(api.settings).mockResolvedValue({ ok: true });
    const navigate = vi.fn();
    const props = renderSettings({ navigate, state: { ...emptyState, settings: { ...settings, market_auto_refresh: true } } });
    const section = screen.getByRole("region", { name: "Mercado" });
    fireEvent.click(within(section).getByRole("switch", { name: "Atualizar cotações automaticamente" }));
    await waitFor(() => expect(api.settings).toHaveBeenCalledWith({ market_auto_refresh: false }));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith("Atualização automática das cotações desligada."));
    fireEvent.click(within(section).getByRole("link", { name: /Abrir Mercado/ }));
    expect(navigate).toHaveBeenCalledWith("market");
  });
});

describe("R1-CFG-4 · seção ativa pela posição", () => {
  it("marca a última seção que passou da linha de 30% da tela (a última no fim da página)", () => {
    const tops = [{ id: "perfil", top: -900 }, { id: "plano", top: -100 }, { id: "reserva", top: 400 }, { id: "aparencia", top: 1200 }];
    expect(activeSection(tops, 1000, false)).toBe("plano");
    expect(activeSection([{ id: "perfil", top: 120 }, { id: "plano", top: 900 }], 1000, false)).toBe("perfil");
    expect(activeSection(tops, 1000, true)).toBe("aparencia");
    expect(activeSection([], 1000, false)).toBeNull();
  });
});

describe("CR-22 · índice das seções", () => {
  it("lista as seções e leva o foco ao título escolhido", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderSettings({}, vi.fn(), { onReplayTour: vi.fn() });
    const index = screen.getByRole("navigation", { name: "Seções das configurações" });
    expect(within(index).getAllByRole("button").map(button => button.textContent)).toEqual(["Perfil", "Plano 70-20-10", "Reserva", "Aparência", "Mercado", "Cópia de segurança", "Fechamentos", "Zerar a conta", "Ajuda"]);
    fireEvent.click(within(index).getByRole("button", { name: "Aparência" }));
    expect(scroll).toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("appearance-title");
    expect(within(index).getByRole("button", { name: "Aparência" }).getAttribute("aria-current")).toBe("true");
  });
});

describe("MEL-45 · plano 70-20-10", () => {
  const withPlan: Settings = { ...settings, monthly_net_income_cents: 1_300_000, plan_fixed_pct: 70, plan_fun_pct: 20, plan_invest_pct: 10, freedom_multiplier: 150, freedom_goal_id: 8, freedom_goal_status: "linked", freedom_goal_auto: true };
  const freedomGoal = { id: 8, name: "Número da liberdade", type: "retirement", target_cents: 195_000_000, current_cents: 5_000_000, target_date: null, currency: "BRL", active: true };

  it("sem plano oferece a sugestão e aplica depois de validar a soma", async () => {
    vi.mocked(api.plan).mockResolvedValue({ ok: true });
    const props = renderSettings({ state: { ...emptyState, settings: { ...settings, monthly_net_income_cents: 1_100_000 } } });
    const section = screen.getByRole("region", { name: "Plano 70-20-10" });
    expect(within(section).getByText("Sem plano")).toBeTruthy();
    fireEvent.click(within(section).getByRole("button", { name: /Ver o plano sugerido/ }));
    const values = [...section.querySelectorAll(".plan-value")].map(cell => cell.textContent!.replace(/\s/g, " "));
    expect(values).toEqual(["R$ 7.700,00", "R$ 2.200,00", "R$ 1.100,00", "R$ 66.000,00", "R$ 1.650.000,00"]);
    // Decision 2: the teto before → after is shown before applying.
    expect(section.querySelector(".settings-apply-note")!.textContent!.replace(/\s/g, " ")).toBe("Teto de gastos: R$ 3.000,00 → R$ 9.900,00");
    expect(section.querySelector(".plan-apply-limit")!.textContent!.replace(/\s/g, " ")).toContain("R$ 9.900,00");
    fireEvent.change(within(section).getByRole("spinbutton", { name: "Percentual do salário para lazer" }), { target: { value: "25" } });
    fireEvent.click(within(section).getByRole("button", { name: "Aplicar plano" }));
    expect(within(section).getByText("Os percentuais devem somar 100%. Agora somam 105%.")).toBeTruthy();
    fireEvent.change(within(section).getByRole("spinbutton", { name: "Percentual do salário para gastos fixos" }), { target: { value: "65" } });
    fireEvent.click(within(section).getByRole("button", { name: "Aplicar plano" }));
    await waitFor(() => expect(api.plan).toHaveBeenCalledWith({ fixed_pct: 65, fun_pct: 25, invest_pct: 10, emergency_months: 6, freedom_multiplier: 150 }));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith(expect.stringMatching(/^Plano aplicado\. Teto de gastos: R\$\s3\.000,00 → R\$\s9\.900,00\.$/), expect.objectContaining({ label: "Desfazer" })));
    const undo = vi.mocked(props.notify).mock.calls.at(-1)![1]!;
    vi.mocked(api.clearPlan).mockResolvedValue(undefined);
    vi.mocked(api.settings).mockResolvedValue({ ok: true });
    await undo.run();
    expect(api.clearPlan).toHaveBeenCalledOnce();
    expect(api.settings).toHaveBeenCalledWith({ monthly_spending_limit_cents: 300000 });
  });

  it("mostra o plano ativo e o número da liberdade vinculado, com recriação e cálculo automático", async () => {
    vi.mocked(api.createFreedomGoal).mockResolvedValue({ ok: true, id: 9 });
    vi.mocked(api.settings).mockResolvedValue({ ok: true });
    renderSettings({ state: { ...emptyState, goals: [freedomGoal], settings: withPlan } });
    const section = screen.getByRole("region", { name: "Plano 70-20-10" });
    expect(within(section).getByText("Ativo")).toBeTruthy();
    // Decision 3: the freedom number progress is the invested wealth.
    expect(section.textContent!.replace(/\s/g, " ")).toContain("Patrimônio investido: R$ 50.000,00 de R$ 1.950.000,00 (2,5%)");
    expect(section.textContent!.replace(/\s/g, " ")).toContain("Teto de gastos do mêsR$ 11.700,00");
    fireEvent.click(within(section).getByRole("switch", { name: "Calcular o número da liberdade automaticamente" }));
    await waitFor(() => expect(api.settings).toHaveBeenCalledWith({ freedom_goal_auto: false }));
    cleanup();
    renderSettings({ state: { ...emptyState, settings: { ...withPlan, freedom_goal_status: "removed" } } });
    fireEvent.click(within(screen.getByRole("region", { name: "Plano 70-20-10" })).getByRole("button", { name: "Criar novamente" }));
    await waitFor(() => expect(api.createFreedomGoal).toHaveBeenCalledOnce());
  });

  it("remove o plano com confirmação e oferece desfazer", async () => {
    vi.mocked(api.clearPlan).mockResolvedValue(undefined);
    vi.mocked(api.plan).mockResolvedValue({ ok: true });
    const props = renderSettings({ state: { ...emptyState, settings: withPlan } });
    fireEvent.click(within(screen.getByRole("region", { name: "Plano 70-20-10" })).getByRole("button", { name: "Remover plano" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover plano" }));
    await waitFor(() => expect(api.clearPlan).toHaveBeenCalledOnce());
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith("Plano removido. O teto de gastos do mês não mudou.", expect.objectContaining({ label: "Desfazer" })));
    const undo = vi.mocked(props.notify).mock.calls.at(-1)![1]!;
    await undo.run();
    expect(api.plan).toHaveBeenCalledWith({ fixed_pct: 70, fun_pct: 20, invest_pct: 10, emergency_months: 6, freedom_multiplier: 150 });
  });
});
