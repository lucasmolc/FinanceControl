import { describe, expect, it } from "vitest";
import { detectIcon, ICON_GROUPS, ICONS, iconById, resolveIcon, searchIcons } from "./icons";

describe("MEL-39 · catálogo de ícones de categoria", () => {
  it("tem ids únicos e válidos, rótulos pt-BR e grupos conhecidos", () => {
    const ids = ICONS.map(icon => icon.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const icon of ICONS) {
      expect(icon.id).toMatch(/^[a-z0-9_-]{1,40}$/);
      expect(icon.label.length).toBeGreaterThan(1);
      expect(ICON_GROUPS.some(group => group.id === icon.group)).toBe(true);
      expect(icon.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(icon.icon).toBeTruthy();
    }
  });

  it("cobre os gastos comuns do dia a dia (MEL-39)", () => {
    for (const id of ["aluguel", "condominio", "energia", "agua", "gas", "internet", "mercado", "restaurante", "delivery", "cafe", "padaria", "combustivel", "taxi", "onibus", "estacionamento", "pedagio", "farmacia", "plano-saude", "consulta", "academia", "cursos", "livros", "escola", "cinema", "viagem", "jogos", "shows", "bares", "roupas", "eletronicos", "presentes", "pets", "streaming", "software", "nuvem", "celular", "impostos", "tarifas", "juros", "seguros", "investimentos", "salario", "freelas", "reembolso", "presentes-recebidos", "doacoes", "outros"]) {
      expect(iconById(id), id).toBeDefined();
    }
  });

  it("detecta o ícone pelo texto, sem acento e por palavra inteira", () => {
    expect(detectIcon("Conta de luz")).toBe("energia");
    expect(detectIcon("SUPERMERCADO BOM PREÇO")).toBe("mercado");
    expect(detectIcon("Academia do bairro")).toBe("academia");
    expect(detectIcon("Farmácia São João")).toBe("farmacia");
    expect(detectIcon("Salário setembro", "income")).toBe("salario");
    expect(detectIcon("Plano de saúde Unimed")).toBe("plano-saude");
    expect(detectIcon("barbearia")).toBe("cabeleireiro");
    expect(detectIcon("xyz")).toBeNull();
    expect(detectIcon("")).toBeNull();
  });

  it("resolveIcon cai em 'outros' para ids desconhecidos e a busca usa aliases", () => {
    expect(resolveIcon("nao-existe").id).toBe("outros");
    expect(searchIcons("gasolina").map(icon => icon.id)).toContain("combustivel");
    expect(searchIcons("saude").length).toBeGreaterThan(3);
    expect(searchIcons("", "income").every(icon => icon.kinds.includes("income"))).toBe(true);
  });
});
