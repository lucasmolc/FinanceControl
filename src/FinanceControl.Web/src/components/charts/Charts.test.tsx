// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetPreferencesForTests, setPreferences } from "../../lib/preferencesStore";
import { DEFAULT_PREFERENCES } from "../../lib/preferences";
import { AreaChart, BarChart, DonutChart, Sparkline } from ".";

afterEach(() => { cleanup(); resetPreferencesForTests(); });

const categories = [
  { id: 1, label: "Aluguel", detail: "Moradia · 05/09/2026" },
  { id: 2, label: "Mercado", detail: "Alimentação · 10/09/2026" },
  { id: 3, label: "Farmácia" },
];

describe("charts", () => {
  it("barras: resumo acessível, tabela oculta e navegação por teclado com drill-down", () => {
    const onSelect = vi.fn();
    render(<BarChart title="Maiores gastos" orientation="horizontal" categories={categories} series={[{ id: "v", label: "Valor", values: [150000, 42050, 3000] }]} onSelect={onSelect} />);
    const img = screen.getByRole("img", { name: /Maiores gastos\. 3 itens; maior: Aluguel \(R\$\s1\.500,00\)/ });
    expect(img).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("Mercado — Alimentação · 10/09/2026")).toBeTruthy();

    const plot = screen.getByRole("group", { name: "Maiores gastos" });
    fireEvent.keyDown(plot, { key: "ArrowRight" });
    fireEvent.keyDown(plot, { key: "ArrowRight" });
    expect(document.querySelector(".chart-tooltip")?.textContent).toContain("Mercado");
    expect(document.querySelector("[aria-live='polite']")?.textContent).toMatch(/Mercado\. Valor: R\$\s420,50\. Alimentação/);
    fireEvent.keyDown(plot, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.keyDown(plot, { key: "Escape" });
    expect(document.querySelector(".chart-tooltip")).toBeNull();
  });

  it("barras agrupadas com valores negativos e linha de resultado exibem legenda", () => {
    render(<BarChart title="Fluxo" categories={[{ id: "a", label: "ago" }, { id: "b", label: "set" }]}
      series={[{ id: "in", label: "Receitas", values: [100, 200] }, { id: "out", label: "Despesas", values: [150, 50] }]}
      line={{ label: "Resultado", values: [-50, 150] }} highlightIndex={1} />);
    const legend = screen.getByRole("list", { name: "Legenda" });
    expect(within(legend).getByText("Receitas")).toBeTruthy();
    expect(within(legend).getByText("Resultado")).toBeTruthy();
    expect(document.querySelectorAll(".chart-bar-rect").length).toBe(4);
    expect(document.querySelector(".chart-highlight")).toBeTruthy();
  });

  it("R3-X-2: barras agrupadas resumem o maior valor de cada série, sem somar as séries", () => {
    render(<BarChart title="Receitas × despesas" categories={[{ id: "a", label: "ago", title: "agosto de 2026" }, { id: "b", label: "set", title: "setembro de 2026" }]}
      series={[{ id: "in", label: "Receitas", values: [1_100_000, 900_000] }, { id: "out", label: "Despesas", values: [500_000, 700_000] }]} />);
    const label = document.querySelector("svg.chart-svg")?.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/maior de Receitas: agosto de 2026 \(R\$\s11\.000,00\)/);
    expect(label).toMatch(/maior de Despesas: setembro de 2026 \(R\$\s7\.000,00\)/);
    expect(label).not.toContain("16.000,00");
  });

  it("empilha séries sem pintar valores zerados", () => {
    render(<BarChart title="Empilhado" mode="stacked" categories={categories} series={[{ id: "a", label: "A", values: [1, 0, 2] }, { id: "b", label: "B", values: [3, 4, 0] }]} />);
    expect(document.querySelectorAll(".chart-bar-rect").length).toBe(4);
  });

  it("rosca: agrupa em Outros, mostra o centro e chama o clique com o item", () => {
    const onSelect = vi.fn();
    const items = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, label: `Categoria ${index + 1}`, value: (index + 1) * 1000 }));
    render(<DonutChart title="Gastos por categoria" items={items} maxSlices={6} onSelect={onSelect} />);
    const legend = screen.getByRole("list", { name: "Legenda" });
    expect(within(legend).getAllByRole("listitem")).toHaveLength(6);
    expect(within(legend).getByText("Outros")).toBeTruthy();
    expect(document.querySelector(".donut-value")?.textContent).toMatch(/R\$\s360,00/);
    const slices = document.querySelectorAll(".chart-slice");
    fireEvent.pointerEnter(slices[0] as Element);
    expect(document.querySelector(".donut-label")?.textContent).toBe("Categoria 8");
    fireEvent.click(slices[0] as Element);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 8, label: "Categoria 8" }));
    const plot = screen.getByRole("group", { name: "Gastos por categoria" });
    fireEvent.keyDown(plot, { key: "End" });
    fireEvent.keyDown(plot, { key: " " });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "outros", other: true }));
  });

  it("rosca vazia continua acessível", () => {
    render(<DonutChart title="Vazio" items={[]} />);
    expect(screen.getByRole("img", { name: "Vazio. Sem dados no período." })).toBeTruthy();
  });

  it("área: projeção tracejada, faixa, linha de referência e resumo", () => {
    render(<AreaChart title="Patrimônio" labels={["jul", "ago", "set"]} series={[
      { id: "n", label: "Nominal", values: [100, 200, 300], fill: true, projectFrom: 1 },
      { id: "r", label: "Real", values: [null, 200, 280], dashed: true },
    ]} band={{ label: "Faixa", lower: [null, 200, 250], upper: [null, 200, 350] }} references={[{ label: "Reserva", value: 250 }]} />);
    expect(screen.getByRole("img", { name: /Patrimônio\. Nominal: de R\$\s1,00 a R\$\s3,00; Real: de R\$\s2,00 a R\$\s2,80\./ })).toBeTruthy();
    expect(document.querySelectorAll(".chart-line.dashed")).toHaveLength(2);
    expect(document.querySelector(".chart-band")?.getAttribute("d")).toBeTruthy();
    expect(document.querySelector(".chart-reference")).toBeTruthy();
    const plot = screen.getByRole("group", { name: "Patrimônio" });
    fireEvent.keyDown(plot, { key: "Home" });
    const tooltip = document.querySelector(".chart-tooltip");
    expect(tooltip?.textContent).toContain("jul");
    expect(tooltip?.textContent).not.toContain("Real");
    expect(tooltip?.textContent).toContain("Reserva");
  });

  it("oculta valores e rótulos de eixo no modo privacidade", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, hide_values: true });
    render(<AreaChart title="Saldo" labels={["a", "b"]} series={[{ id: "s", label: "Saldo", values: [100, 200] }]} />);
    expect(screen.getByRole("img", { name: "Saldo. Valores ocultos." })).toBeTruthy();
    expect(document.querySelectorAll(".chart-axis").length).toBe(2); // only x labels
    expect(screen.getByRole("table").textContent).toContain("R$ •••••");
  });

  it("não marca animação quando as animações estão desligadas", () => {
    setPreferences({ ...DEFAULT_PREFERENCES, animations: false });
    render(<Sparkline title="Patrimônio" values={[1, 3, 2]} labels={["jul", "ago", "set"]} />);
    expect(document.querySelector(".chart-animate")).toBeNull();
    expect(screen.getByRole("img", { name: /Patrimônio\. De R\$\s0,01 a R\$\s0,02\./ })).toBeTruthy();
  });

  it("CR-03: rosca com uma única fatia desenha o anel (caminho com dois arcos)", () => {
    render(<DonutChart title="Formas de pagamento" items={[{ id: "card", label: "Cartão de crédito", value: 12_000 }]} />);
    const slice = document.querySelector(".chart-slice");
    expect(slice?.getAttribute("d")?.match(/A/g)?.length).toBe(4);
    expect(document.querySelector(".donut-value")?.textContent).toMatch(/R\$\s120,00/);
  });

  it("CR-09: histórico com um só ponto desenha marcador, valor e a nota", () => {
    render(<AreaChart title="Evolução do patrimônio" labels={["set/26"]} series={[{ id: "t", label: "Patrimônio", values: [1_234_500], fill: true }]} />);
    expect(document.querySelector(".chart-single-point .chart-dot")).toBeTruthy();
    expect(document.querySelector(".chart-single-point text")?.textContent).toMatch(/R\$\s12\.345,00/);
    expect(screen.getByText("O histórico começa neste mês.")).toBeTruthy();
  });

  it("CR-09: patrimônio zerado não repete “R$ 0” no eixo", () => {
    render(<AreaChart title="Zerado" labels={["ago", "set"]} series={[{ id: "t", label: "Total", values: [0, 0] }]} />);
    const yLabels = Array.from(document.querySelectorAll(".chart-y-label")).map(label => label.textContent);
    expect(yLabels).toEqual(["R$ 0"]);
    expect(screen.queryByText("O histórico começa neste mês.")).toBeNull();
  });

  it("CR-11: barras horizontais estreitas não empilham rótulos do eixo", () => {
    render(<BarChart title="Maiores gastos" orientation="horizontal" categories={categories} series={[{ id: "v", label: "Valor", values: [300_000, 120_000, 90_000] }]} />);
    // fallback width 640 → value axis ~330px → at most 3 intervals (4 labels), all distinct
    const labels = Array.from(document.querySelectorAll(".chart-axis:not(.chart-category)")).map(label => label.textContent);
    expect(labels.length).toBeLessThanOrEqual(4);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
