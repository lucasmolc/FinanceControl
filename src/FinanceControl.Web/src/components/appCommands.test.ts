import { describe, expect, it, vi } from "vitest";
import { emptyState } from "../test/fixtures";
import { buildAppCommands, type AppCommandContext } from "./appCommands";
import { rankCommands } from "./ui/CommandPalette/rankCommands";

const context = (extra: Partial<AppCommandContext> = {}): AppCommandContext => ({
  state: emptyState, navigate: vi.fn(), openModal: vi.fn(), openEdit: vi.fn(), refresh: vi.fn(), hideValues: false, toggleHideValues: vi.fn(), query: "",
  page: "transactions", theme: "noite", density: "confortavel", setTheme: vi.fn(), setDensity: vi.fn(), closeMonth: vi.fn(), monthLabel: "setembro de 2026",
  replayTour: vi.fn(), openSettingsSection: vi.fn(), ...extra,
});

describe("R1-CMD · paleta de comandos", () => {
  it("sem busca: Criar primeiro (Novo lançamento no topo, atalho N), depois ações e só então as páginas", () => {
    const commands = buildAppCommands(context());
    expect(commands[0]).toMatchObject({ label: "Novo lançamento", group: "Criar", shortcut: ["N"] });
    const groups = [...new Set(commands.map(command => command.group))];
    expect(groups).toEqual(["Criar", "Ações", "Ir para"]);
  });

  it("encontra tema, backup, fechar o mês, tour, plano e densidade", () => {
    const commands = buildAppCommands(context());
    const first = (query: string) => rankCommands(commands, query)[0]?.id;
    expect(first("tema")).toBe("action:theme");
    expect(first("backup")).toBe("action:backup");
    expect(first("fechar")).toBe("action:close-month");
    expect(first("tour")).toBe("action:tour");
    expect(first("plano")).toBe("action:plan");
    expect(first("densidade")).toBe("action:density");
    expect(first("n")).toBe("new:transaction");
  });

  it("alterna o tema e marca a página atual", () => {
    const setTheme = vi.fn();
    const commands = buildAppCommands(context({ theme: "claro", setTheme }));
    const theme = commands.find(command => command.id === "action:theme")!;
    expect(theme.label).toBe("Usar tema escuro (Noite)");
    theme.run();
    expect(setTheme).toHaveBeenCalledWith("noite");
    expect(commands.find(command => command.id === "go:transactions")?.description).toBe("Você está aqui");
    expect(commands.find(command => command.id === "go:bills")?.description).not.toBe("Você está aqui");
  });

  it("sem mês para fechar, a ação não aparece", () => {
    expect(buildAppCommands(context({ closeMonth: undefined })).some(command => command.id === "action:close-month")).toBe(false);
  });

  it("R3-CMD-3: sem busca, as últimas páginas abertas aparecem em Recentes (sem a atual)", () => {
    const commands = buildAppCommands(context({ recentPages: ["transactions", "bills", "goals", "cards", "market"] }));
    const recent = commands.filter(command => command.group === "Recentes").map(command => command.label);
    expect(recent).toEqual(["Contas a pagar", "Metas", "Cartões"]);
    expect(commands[0]?.group).toBe("Recentes");
    expect(buildAppCommands(context({ recentPages: ["bills"], query: "met" })).some(command => command.group === "Recentes")).toBe(false);
    // R4-CMD-1: not repeated under "Ir para"
    expect(commands.some(command => command.id === "go:bills")).toBe(false);
    expect(commands.some(command => command.id === "go:reports")).toBe(true);
  });
});

