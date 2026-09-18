import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { brl } from "../../lib/money";
import { ChartFrame } from "./ChartFrame";
import { bandIndex, bandLayout, barPath, chartColor, compactBrl, distinctTicks, extent, labelIndexes, linearScale, linePath, maskFormat, niceTicks, tickBudget } from "./chartMath";
import type { LegendItem, TooltipData, ValueFormatter } from "./chartTypes";
import { useChartEnv, useElementWidth } from "./useChartEnv";

export interface BarCategory {
  id: string | number;
  /** Axis label (short). */
  label: string;
  /** Tooltip/table title (defaults to `label`). */
  title?: string;
  /** Secondary line in the tooltip (e.g. "Mercado · 12/09/2026"). */
  detail?: string;
}

export interface BarSeries { id: string; label: string; values: number[]; color?: string }

export interface BarLine { label: string; values: number[]; color?: string }

export interface BarChartProps {
  title: string;
  categories: BarCategory[];
  series: BarSeries[];
  mode?: "grouped" | "stacked";
  orientation?: "vertical" | "horizontal";
  /** Line drawn over vertical bars on the same axis (e.g. monthly net result). */
  line?: BarLine;
  /** Height of a vertical chart; horizontal charts grow with the number of categories. */
  height?: number;
  /** Value formatter (defaults to BRL from cents). */
  format?: ValueFormatter;
  axisFormat?: ValueFormatter;
  summary?: string;
  xLabel?: string;
  /** Emphasized category (e.g. the selected month). */
  highlightIndex?: number;
  /** Click / Enter on a category (drill-down). */
  onSelect?: (index: number) => void;
  /** Value labels at the bar tips (horizontal default true). */
  showValues?: boolean;
  className?: string;
}

const BAR_MAX = 24;
const GAP = 2;
const ROW = 34;
const series$ = (color: string) => ({ "--series": color }) as CSSProperties;

/** Grouped or stacked bars, vertical or horizontal, supporting negative values; a single baseline at zero. */
export function BarChart({ title, categories, series, mode = "grouped", orientation = "vertical", line, height = 220, format = brl, axisFormat = compactBrl, summary, xLabel = "Categoria", highlightIndex, onSelect, showValues, className }: BarChartProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(frameRef, 640);
  const { hidden, animate } = useChartEnv();
  const [active, setActive] = useState<number | null>(null);
  const fmt = maskFormat(format, hidden);
  const horizontal = orientation === "horizontal";
  const stacked = mode === "stacked" && series.length > 1;
  const count = categories.length;
  const colored = series.map((item, index) => ({ ...item, color: item.color ?? chartColor(index) }));
  const lineColor = line?.color ?? "var(--text)";
  const valuesAt = (index: number) => colored.map(item => item.values[index] ?? 0);
  const labelsVisible = (showValues ?? horizontal) && !hidden;

  // Value domain: stacked sums positive and negative parts separately.
  const totals = categories.map((_, index) => {
    const values = valuesAt(index);
    return stacked
      ? [values.filter(value => value > 0).reduce((sum, value) => sum + value, 0), values.filter(value => value < 0).reduce((sum, value) => sum + value, 0)]
      : values;
  });
  const [min, max] = extent(...totals, line?.values ?? []);
  const minStep = axisFormat === compactBrl ? 100 : 0;

  // Layout. Horizontal charts know their value axis length before the ticks: CR-11 caps the ticks so the compact labels
  // ("R$ 1 mil", ~64px) never collide on narrow cards.
  const labelWidth = horizontal ? Math.min(Math.max(90, width * 0.34), 190) : 0;
  const right = horizontal && labelsVisible ? 84 : 14;
  const ticks = horizontal
    ? niceTicks(min, max, tickBudget(width - labelWidth - 8 - right, 72, 3), minStep)
    : niceTicks(min, max, height < 160 ? 2 : 4, minStep);
  const left = horizontal ? labelWidth + 8 : hidden ? 12 : Math.max(44, ...ticks.values.map(value => axisFormat(value).length * 6.4 + 12));
  const top = 10;
  const bottom = horizontal ? (hidden ? 6 : 22) : 26;
  const chartHeight = horizontal ? top + bottom + Math.max(1, count) * ROW : height;
  const innerWidth = Math.max(10, width - left - right);
  const innerHeight = Math.max(10, chartHeight - top - bottom);
  const valueScale = horizontal ? linearScale([ticks.min, ticks.max], [left, left + innerWidth]) : linearScale([ticks.min, ticks.max], [top + innerHeight, top]);
  const zero = valueScale(0);
  const bands = bandLayout(count, horizontal ? innerHeight : innerWidth, horizontal ? 0.35 : 0.28);
  const bandStart = (index: number) => (horizontal ? top : left) + (bands[index]?.start ?? 0);
  const bandCenter = (index: number) => (horizontal ? top : left) + (bands[index]?.center ?? 0);

  interface Rect { key: string; d: string; color: string; seriesIndex: number; index: number }
  const rects: Rect[] = [];
  categories.forEach((category, index) => {
    const band = bands[index];
    if (!band) return;
    const values = valuesAt(index);
    if (stacked) {
      const thickness = Math.min(BAR_MAX, band.size);
      const offset = bandStart(index) + (band.size - thickness) / 2;
      let positive = 0;
      let negative = 0;
      const lastPositive = values.reduce((last, value, seriesIndex) => (value > 0 ? seriesIndex : last), -1);
      const lastNegative = values.reduce((last, value, seriesIndex) => (value < 0 ? seriesIndex : last), -1);
      values.forEach((value, seriesIndex) => {
        if (!value) return;
        const from = value > 0 ? positive : negative;
        const to = from + value;
        if (value > 0) positive = to; else negative = to;
        const outer = value > 0 ? seriesIndex === lastPositive : seriesIndex === lastNegative;
        const a = valueScale(from);
        const b = valueScale(to);
        // 2px surface gap between touching segments (taken from the segment's far side).
        const gapFix = outer ? 0 : GAP;
        const color = colored[seriesIndex]?.color ?? chartColor(seriesIndex);
        let d: string;
        if (horizontal) {
          const x0 = Math.min(a, b);
          const w = Math.max(0, Math.abs(b - a) - gapFix);
          d = outer ? barPath(value > 0 ? x0 : x0 + gapFix, offset, w, thickness, value > 0 ? "right" : "left") : `M${value > 0 ? x0 : x0 + gapFix},${offset}h${w}v${thickness}h${-w}Z`;
        } else {
          const y0 = Math.min(a, b);
          const h = Math.max(0, Math.abs(b - a) - gapFix);
          d = outer ? barPath(offset, value > 0 ? y0 : y0, thickness, h, value > 0 ? "top" : "bottom") : `M${offset},${value > 0 ? y0 + gapFix : y0}h${thickness}v${h}h${-thickness}Z`;
        }
        rects.push({ key: `${category.id}-${seriesIndex}`, d, color, seriesIndex, index });
      });
    } else {
      const groups = Math.max(1, values.length);
      const thickness = Math.min(BAR_MAX, (band.size - GAP * (groups - 1)) / groups);
      const groupSize = thickness * groups + GAP * (groups - 1);
      const offset = bandStart(index) + (band.size - groupSize) / 2;
      values.forEach((value, seriesIndex) => {
        if (!value) return;
        const position = offset + seriesIndex * (thickness + GAP);
        const end = valueScale(value);
        const color = colored[seriesIndex]?.color ?? chartColor(seriesIndex);
        const d = horizontal
          ? barPath(Math.min(zero, end), position, Math.abs(end - zero), thickness, value > 0 ? "right" : "left")
          : barPath(position, Math.min(zero, end), thickness, Math.abs(end - zero), value > 0 ? "top" : "bottom");
        rects.push({ key: `${category.id}-${seriesIndex}`, d, color, seriesIndex, index });
      });
    }
  });

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!count) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setActive(horizontal ? bandIndex(event.clientY - rect.top - top, count, innerHeight) : bandIndex(event.clientX - rect.left - left, count, innerWidth));
  };

  const activeCategory = active === null ? undefined : categories[active];
  const tooltip: TooltipData | null = active === null || !activeCategory ? null : {
    title: activeCategory.title ?? activeCategory.label,
    rows: [
      ...colored.map(item => ({ label: item.label, value: fmt(item.values[active] ?? 0), color: item.color })),
      ...(line ? [{ label: line.label, value: fmt(line.values[active] ?? 0), color: lineColor }] : []),
    ],
    note: activeCategory.detail,
  };
  const activeTotals = active === null ? [] : [...valuesAt(active), line?.values[active] ?? 0];
  const tooltipAt = active === null ? null : horizontal
    ? { x: valueScale(Math.max(0, ...activeTotals)), y: bandCenter(active) }
    : { x: bandCenter(active), y: valueScale(Math.max(0, stacked ? (totals[active]?.[0] ?? 0) : Math.max(...activeTotals))) };

  // R3-X-2: stacked (or single-series) bars add up per category; grouped bars are separate quantities, so the summary
  // names the largest value of each series instead of a meaningless sum ("maior de Receitas: agosto (R$ 11.000,00)").
  const nameAt = (index: number) => categories[index]?.title ?? categories[index]?.label ?? "";
  const largestOf = (valueAt: (index: number) => number) => {
    let best: { index: number; value: number } | null = null;
    categories.forEach((_, index) => {
      const value = valueAt(index);
      if (!best || value > best.value) best = { index, value };
    });
    return best as { index: number; value: number } | null;
  };
  const largestText = (() => {
    if (!count) return "";
    if (stacked || colored.length <= 1) {
      const best = largestOf(index => valuesAt(index).reduce((sum, item) => sum + item, 0));
      return best ? `; maior: ${nameAt(best.index)} (${fmt(best.value)})` : "";
    }
    return colored.map(item => {
      const best = largestOf(index => item.values[index] ?? 0);
      return best ? `; maior de ${item.label}: ${nameAt(best.index)} (${fmt(best.value)})` : "";
    }).join("");
  })();
  const defaultSummary = !count ? "Sem dados." : hidden
    ? `${count} ${count === 1 ? "item" : "itens"}; valores ocultos.`
    : `${count} ${count === 1 ? "item" : "itens"}${largestText}.`;
  const legend: LegendItem[] | undefined = colored.length > 1 || line
    ? [...colored.map(item => ({ label: item.label, color: item.color, shape: "rect" as const })), ...(line ? [{ label: line.label, color: lineColor, shape: "line" as const }] : [])]
    : undefined;
  const table = {
    columns: [xLabel, ...colored.map(item => item.label), ...(line ? [line.label] : [])],
    rows: categories.map((category, index) => [
      [category.title ?? category.label, category.detail].filter(Boolean).join(" — "),
      ...colored.map(item => fmt(item.values[index] ?? 0)),
      ...(line ? [fmt(line.values[index] ?? 0)] : []),
    ]),
  };
  const axisTicks = distinctTicks(ticks.values, axisFormat);
  const categoryLabels = horizontal ? categories.map((_, index) => index) : labelIndexes(count, Math.max(2, Math.floor(innerWidth / 56)));
  const truncate = (text: string) => { const max = Math.max(6, Math.floor(labelWidth / 7)); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };

  return <ChartFrame kind="bar" title={title} summary={summary ?? defaultSummary} frameRef={frameRef} count={count} active={active} onActiveChange={setActive}
    onActivate={onSelect} tooltip={tooltip} tooltipAt={tooltipAt} table={table} legend={legend} className={className} plotWidth={width}>
    <svg className={`chart-svg${animate ? " chart-animate" : ""}${horizontal ? " is-horizontal" : ""}${onSelect ? " is-clickable" : ""}`} width={width} height={chartHeight} viewBox={`0 0 ${width} ${chartHeight}`} role="img" aria-label={`${title}. ${summary ?? defaultSummary}`}
      onPointerMove={onPointerMove} onClick={() => { if (active !== null && onSelect) onSelect(active); }}>
      {categories.map((category, index) => {
        const band = bands[index];
        if (!band || (index !== highlightIndex && index !== active)) return null;
        const slot = horizontal ? innerHeight / count : innerWidth / count;
        const start = (horizontal ? top : left) + slot * index;
        return <rect key={`hl-${category.id}`} className={index === highlightIndex ? "chart-highlight" : "chart-hover"} fill={index === highlightIndex ? "var(--accent-soft)" : "var(--panel-3)"} fillOpacity={index === highlightIndex ? 1 : 0.6}
          {...(horizontal ? { x: 0, y: start, width, height: slot } : { x: start, y: top, width: slot, height: innerHeight })} rx="6" />;
      })}
      <g className="chart-grid" aria-hidden="true">
        {axisTicks.map(value => {
          const position = valueScale(value);
          return <g key={value}>
            {horizontal
              ? <line x1={position} x2={position} y1={top} y2={top + innerHeight} stroke={value === 0 ? "var(--line-strong)" : "var(--line)"} strokeWidth="1" shapeRendering="crispEdges" />
              : <line x1={left} x2={left + innerWidth} y1={position} y2={position} stroke={value === 0 ? "var(--line-strong)" : "var(--line)"} strokeWidth="1" shapeRendering="crispEdges" />}
            {!hidden && (horizontal
              ? <text className="chart-axis" x={position} y={chartHeight - 6} textAnchor="middle" fill="var(--muted)">{axisFormat(value)}</text>
              : <text className="chart-axis chart-y-label" x={left - 8} y={position} dy="0.32em" textAnchor="end" fill="var(--muted)">{axisFormat(value)}</text>)}
          </g>;
        })}
        {categoryLabels.map(index => {
          const category = categories[index];
          if (!category) return null;
          const emphasis = index === highlightIndex;
          return horizontal
            ? <text key={category.id} className={`chart-axis chart-category${emphasis ? " is-strong" : ""}`} x={labelWidth} y={bandCenter(index)} dy="0.32em" textAnchor="end" fill={emphasis ? "var(--text)" : "var(--text-soft)"}>
              <title>{category.title ?? category.label}</title>{truncate(category.label)}
            </text>
            : <text key={category.id} className={`chart-axis${emphasis ? " is-strong" : ""}`} x={bandCenter(index)} y={chartHeight - 8} textAnchor="middle" fill={emphasis ? "var(--text)" : "var(--muted)"} fontWeight={emphasis ? 600 : undefined}>{category.label}</text>;
        })}
      </g>
      <g className="chart-bars">
        {rects.map(rect => <path key={rect.key} className={`chart-bar-rect chart-mark${rect.index === active ? " is-active" : ""}`} data-kind="bar" style={series$(rect.color)} d={rect.d} fill={rect.color} />)}
      </g>
      {labelsVisible && horizontal && categories.map((category, index) => {
        const total = valuesAt(index).reduce((sum, value) => sum + value, 0);
        const end = valueScale(stacked ? (totals[index]?.[0] ?? total) : Math.max(0, ...valuesAt(index)));
        return <text key={`v-${category.id}`} className="chart-value-label" x={Math.max(end, zero) + 6} y={bandCenter(index)} dy="0.32em" fill="var(--text-soft)">{fmt(total)}</text>;
      })}
      {line && !horizontal && <g className="chart-net">
        <path className="chart-line chart-net-line" style={{ ...series$(lineColor), stroke: lineColor }} pathLength={1} d={linePath(categories.map((_, index) => [bandCenter(index), valueScale(line.values[index] ?? 0)]))} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {categories.map((category, index) => <circle key={`dot-${category.id}`} className="chart-dot" style={series$(lineColor)} cx={bandCenter(index)} cy={valueScale(line.values[index] ?? 0)} r="4" fill={lineColor} stroke="var(--panel)" strokeWidth="2" />)}
      </g>}
    </svg>
  </ChartFrame>;
}
