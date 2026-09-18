import { describe, expect, it } from "vitest";
import type { Command } from "./CommandPalette";
import { rankCommands } from "./rankCommands";

const noop = () => undefined;
const pages: Command[] = ["Visão geral", "Lançamentos", "Contas a pagar", "Assinaturas", "Contas bancárias", "Investimentos", "Cartões", "Configurações"]
  .map(label => ({ id: `go:${label}`, label, group: "Ir para", description: "Página", run: noop }));
const create: Command[] = [{ id: "new:tx", label: "Novo lançamento", group: "Criar", run: noop }];
const records: Command[] = [{ id: "edit:sub:1", label: "Netflix", group: "Registros", description: "Assinatura", run: noop }];
const all = [...pages, ...create, ...records];

describe("CR-17 · ranking da paleta", () => {
  it("“net” põe o registro Netflix primeiro e descarta páginas que só casam por subsequência", () => {
    const ranked = rankCommands(all, "net", { "Ir para": 3 });
    expect(ranked[0]?.label).toBe("Netflix");
    expect(ranked.map(command => command.label)).not.toContain("Configurações");
    expect(ranked.map(command => command.label)).not.toContain("Investimentos");
  });

  it("prefixo e palavra inteira vencem ocorrências no meio da palavra", () => {
    const ranked = rankCommands(all, "contas", { "Ir para": 3 });
    expect(ranked.slice(0, 2).map(command => command.label)).toEqual(["Contas a pagar", "Contas bancárias"]);
  });

  it("com consulta mostra no máximo 3 páginas; sem consulta mantém a ordem", () => {
    const ranked = rankCommands(all, "a", { "Ir para": 3 });
    expect(ranked.filter(command => command.group === "Ir para").length).toBeLessThanOrEqual(3);
    expect(rankCommands(all, "  ")).toEqual(all);
  });

  it("R3-CMD-2: quem casa pelo nome vem antes de páginas que só citam a busca na descrição", () => {
    const list: Command[] = [
      { id: "new:cat", label: "Nova categoria", group: "Criar", run: noop },
      { id: "go:cat", label: "Categorias", group: "Ir para", description: "Limites por categoria", run: noop },
      { id: "go:rel", label: "Relatórios", group: "Ir para", description: "Gastos por categoria e mês", run: noop },
    ];
    const ranked = rankCommands(list, "categoria", { "Ir para": 3 });
    expect(ranked.map(command => command.label)).toEqual(["Categorias", "Nova categoria", "Relatórios"]);
    expect(ranked[2]?.group).toBe("Relacionados");
  });
});
