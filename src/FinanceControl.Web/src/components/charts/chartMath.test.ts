import { describe, expect, it } from "vitest";
import { arcPath, areaPath, bandIndex, bandLayout, barPath, chartColor, compactBrl, cumulative, distinctTicks, donutSlices, extent, firstLast, formatShare, HIDDEN_VALUE, labelIndexes, linearScale, linePath, maskFormat, nearestIndex, niceStep, niceTicks, tickBudget, topWithOther } from "./chartMath";
import { seriesColor } from "./seriesColors";

describe("chartMath", () => {
  it("arredonda passos e ticks para números limpos incluindo o zero", () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(180)).toBe(200);
    expect(niceStep(2300)).toBe(2500);
    expect(niceStep(0)).toBe(1);
    const ticks = niceTicks(120, 980, 4);
    expect(ticks.values[0]).toBe(0);
    expect(ticks.max).toBeGreaterThanOrEqual(980);
    expect(ticks.values).toEqual([0, 250, 500, 750, 1000]);
    const negative = niceTicks(-300, 700, 4);
    expect(negative.min).toBeLessThanOrEqual(-300);
    expect(negative.values).toContain(0);
    expect(niceTicks(0, 0).values).toEqual([0]); // CR-09: flat domain → one tick
  });

  it("mapeia escalas lineares (inclusive invertidas)", () => {
    const y = linearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
  });

  it("divide faixas e encontra o índice mais próximo", () => {
    const bands = bandLayout(4, 400, 0.5);
    expect(bands).toHaveLength(4);
    expect(bands[0]).toEqual({ start: 25, size: 50, center: 50 });
    expect(bandIndex(399, 4, 400)).toBe(3);
    expect(bandIndex(-5, 4, 400)).toBe(0);
    expect(nearestIndex(0, 5, 400)).toBe(0);
    expect(nearestIndex(160, 5, 400)).toBe(2);
    expect(nearestIndex(900, 5, 400)).toBe(4);
    expect(bandLayout(0, 100)).toEqual([]);
  });

  it("gera linhas com lacunas para valores nulos e áreas fechadas", () => {
    expect(linePath([[0, 10], [10, null], [20, 30], [30, 40]])).toBe("M0,10M20,30L30,40");
    expect(areaPath([[0, 10], [10, 20]], 50)).toBe("M0,10L10,20L10,50L0,50Z");
    expect(areaPath([[0, 10], [10, null]], 50)).toBe("");
    expect(areaPath([[0, 10], [10, 20]], [[0, 30], [10, 40]])).toBe("M0,10L10,20L10,40L0,30Z");
  });

  it("desenha barras com ponta arredondada e base reta", () => {
    expect(barPath(0, 0, 10, 0, "top")).toBe("");
    const top = barPath(0, 0, 20, 100, "top");
    expect(top.startsWith("M0,100")).toBe(true);
    expect(top).toContain("Q");
    expect(barPath(0, 0, 100, 20, "right")).toMatch(/^M0,0L96,0Q100,0/);
    expect(barPath(0, 0, 100, 20, "left")).toMatch(/^M100,0L100,20/);
  });

  it("calcula fatias da rosca em proporção e ignora zeros", () => {
    const slices = donutSlices([{ value: 1 }, { value: 0 }, { value: 3 }], 0);
    expect(slices).toHaveLength(2);
    expect(slices[0]?.share).toBeCloseTo(0.25);
    expect(slices[1]?.end).toBeCloseTo(Math.PI * 2);
    expect(donutSlices([{ value: 0 }])).toEqual([]);
    expect(arcPath(50, 50, 40, 20, 0, Math.PI / 2)).toMatch(/^M50,10A40,40 0 0 1 90,50/);
    expect(arcPath(50, 50, 40, 20, 1, 1)).toBe("");
  });

  it("mantém as maiores fatias e agrupa o resto em Outros com cor neutra", () => {
    const items = Array.from({ length: 9 }, (_, index) => ({ id: index, label: `C${index}`, value: (index + 1) * 10 }));
    const top = topWithOther(items, 6);
    expect(top).toHaveLength(6);
    expect(top[0]?.label).toBe("C8");
    expect(top[0]?.color).toBe(chartColor(0));
    const other = top[5];
    expect(other).toMatchObject({ id: "outros", label: "Outros", other: true, color: "var(--muted)" });
    expect(other?.value).toBe(10 + 20 + 30 + 40);
    expect(topWithOther(items.slice(0, 3), 6)).toHaveLength(3);
    expect(topWithOther([{ id: 1, label: "A", value: 0 }])).toEqual([]);
  });

  it("nunca recicla cores: acima de 8 posições usa a cor neutra", () => {
    expect(chartColor(0)).toContain("--chart-1");
    expect(chartColor(7)).toContain("--chart-8");
    expect(chartColor(8)).toBe("var(--muted)");
  });

  it("acumula valores, formata participação e valores compactos", () => {
    expect(cumulative([10, null, 5, 5])).toEqual([10, null, 15, 20]);
    expect(formatShare(0.125)).toBe("12,5%");
    expect(formatShare(1)).toBe("100%");
    expect(compactBrl(50000)).toBe("R$ 500");
    expect(compactBrl(250000)).toMatch(/^R\$ 2,5\s?mil$/);
  });

  it("reduz rótulos do eixo mantendo o primeiro e o último", () => {
    expect(labelIndexes(5, 10)).toEqual([0, 1, 2, 3, 4]);
    const thinned = labelIndexes(31, 6);
    expect(thinned[0]).toBe(0);
    expect(thinned[thinned.length - 1]).toBe(30);
    expect(thinned.length).toBeLessThanOrEqual(6);
  });

  it("calcula extremos, primeiro/último e mascara valores ocultos", () => {
    expect(extent([3, null, -2], [10])).toEqual([-2, 10]);
    expect(extent([])).toEqual([0, 0]);
    expect(firstLast([null, 4, 8, null])).toEqual([4, 8]);
    expect(firstLast([null])).toBeNull();
    expect(maskFormat(value => String(value), true)(10)).toBe(HIDDEN_VALUE);
    expect(maskFormat(value => String(value), false)(10)).toBe("10");
  });

  it("CR-03: fatia única (100%) desenha o anel inteiro em dois arcos, com o furo", () => {
    const [slice] = donutSlices([{ value: 500 }]);
    expect(slice!.end - slice!.start).toBeCloseTo(Math.PI * 2, 6);
    const path = arcPath(100, 100, 94, 60, slice!.start, slice!.end);
    // Two outer half arcs (clockwise) + two inner half arcs (counter-clockwise), each subpath closed.
    expect(path.match(/A94,94 0 1 1 /g)).toHaveLength(2);
    expect(path.match(/A60,60 0 1 0 /g)).toHaveLength(2);
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path).toContain("M100,6A94,94 0 1 1 100,194");
    // a partial slice is still one ring segment
    expect(arcPath(100, 100, 94, 60, 0, Math.PI).match(/A/g)).toHaveLength(2);
  });

  it("CR-09: domínio sem variação tem um único tique; money nunca subdivide abaixo de R$ 1", () => {
    expect(niceTicks(0, 0).values).toEqual([0]);
    expect(niceTicks(0, 0, 4, 100)).toMatchObject({ min: 0, max: 100, values: [0] });
    expect(niceTicks(0, 50, 4, 100).values).toEqual([0, 100]);
    expect(distinctTicks([0, 25, 50, 75, 100], compactBrl)).toEqual([0, 50]); // "R$ 0", "R$ 1" once each
  });

  it("CR-11: número de tiques limitado pela largura disponível", () => {
    expect(tickBudget(140, 72)).toBe(1);
    expect(tickBudget(300, 72)).toBe(3);
    expect(tickBudget(1000, 72, 4)).toBe(4);
    expect(tickBudget(0, 72)).toBe(1);
  });

  it("CR-29: sinal antes do símbolo no eixo, como nos valores (-R$ 4.500,00)", () => {
    expect(compactBrl(-500000)).toMatch(/^-R\$ 5\s?mil$/);
    expect(compactBrl(-45000)).toBe("-R$ 450");
    expect(compactBrl(-10)).toBe("R$ 0");
  });

  it("CR-10: cada série financeira tem uma cor fixa, igual no Painel e em Relatórios", () => {
    expect(seriesColor("income")).toBe("var(--gain)");
    expect(seriesColor("expense")).toBe("var(--loss)");
    // investments: a fixed hue that never follows the accent (so it never collides with the income green)
    expect(seriesColor("investment")).toContain("--hue-blue");
    expect(seriesColor("investments")).toBe(seriesColor("investment"));
    expect(seriesColor("investment")).not.toContain("--chart-1,");
  });
});
