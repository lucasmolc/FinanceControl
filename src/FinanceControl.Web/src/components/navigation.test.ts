import { describe, expect, it } from "vitest";
import { navGroups, navItem, pageFromHash, paramsFromHash, routeFor, visibleNavigation } from "./navigation";

describe("navegação (v1.2)", () => {
  it("reconhece as páginas de Análises e ignora a query na rota", () => {
    expect(pageFromHash("#/relatorios")).toBe("reports");
    expect(pageFromHash("#/projecoes")).toBe("projections");
    expect(pageFromHash("#/mercado")).toBe("market");
    expect(pageFromHash("#/lancamentos?categoria=3&tipo=expense")).toBe("transactions");
    expect(pageFromHash("#/desconhecida")).toBe("dashboard");
    expect(navGroups.find(group => group.label === "Análises")?.items).toEqual(["reports", "projections", "market"]);
    expect(navItem("market").subtitle).toBe("Cotações de moedas, cripto e indicadores.");
  });

  it("lê e monta parâmetros da hash", () => {
    expect(paramsFromHash("#/lancamentos?categoria=3&tipo=expense")).toEqual({ categoria: "3", tipo: "expense" });
    expect(paramsFromHash("#/lancamentos?categoria=&tipo=%20")).toEqual({});
    expect(paramsFromHash("#/lancamentos")).toEqual({});
    expect(routeFor("transactions", { tipo: "expense", categoria: "3" })).toBe("#/lancamentos?categoria=3&tipo=expense");
    expect(routeFor("transactions", { categoria: "" })).toBe("#/lancamentos");
    expect(routeFor("goals")).toBe("#/metas");
  });

  it("a galeria de componentes existe só em desenvolvimento e nunca aparece nos menus", () => {
    expect(pageFromHash("#/componentes")).toBe(import.meta.env.DEV ? "components" : "dashboard");
    expect(visibleNavigation.some(item => item.id === "components")).toBe(false);
  });
});
