import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { brl } from "../../lib/money";
import { ChartFrame } from "./ChartFrame";
import { areaPath, chartColor, compactBrl, distinctTicks, extent, firstLast, labelIndexes, linearScale, linePath, maskFormat, nearestIndex, niceTicks } from "./chartMath";
import type { LegendItem, TooltipData, ValueFormatter } from "./chartTypes";
import { useChartEnv, useElementWidth } from "./useChartEnv";

export interface AreaSeries {
  id: string;
  label: string;
  /** One value per label; `null` leaves a gap (e.g. future days). */
  values: (number | null)[];
  /** CSS color; defaults to the categorical slot of the series index. */
  color?: string;
  /** Paint a ~10% wash under the line down to zero. */
  fill?: boolean;
  /** Whole line dashed (e.g. a pace/target line). */
  dashed?: boolean;
  /** Index from which the line continues dashed (projection); the solid part ends at the same point. */
  projectFrom?: number;
}

export interface AreaBand { label: string; lower: (number | null)[]; upper: (number | null)[]; color?: string }
export interface ReferenceLine { label: string; value: number; color?: string }

export interface AreaChartProps {
  title: string;
  /** X positions (short labels, e.g. "set/26" or "12"). */
  labels: string[];
  /** Longer label per position for the tooltip/table (defaults to `labels`). */
  tooltipLabels?: string[];
  series: AreaSeries[];
  band?: AreaBand;
  references?: ReferenceLine[];
  height?: number;
  /** Value formatter (defaults to BRL from cents). */
  format?: ValueFormatter;
  /** Axis tick formatter (defaults to compact BRL). */
  axisFormat?: ValueFormatter;
  /** Accessible summary (a default is derived from the series). */
  summary?: string;
  /** First column header of the hidden table. */
  xLabel?: string;
  highlightIndex?: number;
  onSelect?: (index: number) => void;
  className?: string;
  /**
   * Caption when the history has a single point (CR-09): the point is drawn as a labelled marker instead of an empty
   * plot. Pass `null` to hide the caption.
   */
  singlePointNote?: string | null;
  /**
   * R2-PRJ-3 (opt-in): when every value is positive, fit the y-axis to the data (about 10% of the range below the
   * minimum) instead of starting at zero, so growth on a large base does not read as a flat line. Default true.
   */
  zeroBaseline?: boolean;
}

const MARGIN = { top: 12, right: 14, bottom: 26 };
const series$ = (color: string) => ({ "--series": color }) as CSSProperties;

/** Multi-series line/area chart with optional projection (dashed), band and reference lines. One y-axis only. */
export function AreaChart({ title, labels, tooltipLabels, series, band, references = [], height = 220, format = brl, axisFormat = compactBrl, summary, xLabel = "Período", highlightIndex, onSelect, className, singlePointNote = "O histórico começa neste mês.", zeroBaseline = true }: AreaChartProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(frameRef, 640);
  const { hidden, animate } = useChartEnv();
  const [active, setActive] = useState<number | null>(null);
  const fmt = maskFormat(format, hidden);
  const count = labels.length;
  const colored = series.map((item, index) => ({ ...item, color: item.color ?? chartColor(index) }));
  const bandColor = band?.color ?? colored[0]?.color ?? chartColor(0);

  const geometry = (() => {
    const [min, max] = extent(...series.map(item => item.values), band?.lower ?? [], band?.upper ?? [], references.map(line => line.value));
    const fitted = !zeroBaseline && min > 0 && max > min;
    const ticks = niceTicks(fitted ? Math.max(0, min - (max - min) * 0.1) : min, max, height < 160 ? 2 : 4, axisFormat === compactBrl ? 100 : 0, !fitted);
    const left = hidden ? 12 : Math.max(44, ...ticks.values.map(value => axisFormat(value).length * 6.4 + 12));
    const innerWidth = Math.max(10, width - left - MARGIN.right);
    const innerHeight = Math.max(10, height - MARGIN.top - MARGIN.bottom);
    const y = linearScale([ticks.min, ticks.max], [MARGIN.top + innerHeight, MARGIN.top]);
    const x = (index: number) => left + (count <= 1 ? innerWidth / 2 : (index / (count - 1)) * innerWidth);
    return { ticks, left, innerWidth, innerHeight, x, y };
  })();
  const { ticks, left, innerWidth, innerHeight, x, y } = geometry;
  const yTicks = distinctTicks(ticks.values, axisFormat);
  // CR-09: series with exactly one value (first monthly snapshot) get a labelled marker — a lone point draws no line.
  const pointIndexes = (values: (number | null)[]) => values.flatMap((value, index) => (value === null || value === undefined || !Number.isFinite(value) ? [] : [index]));
  const lonely = colored.filter(item => pointIndexes(item.values).length === 1);
  const singlePoint = colored.length > 0 && lonely.length === colored.length;
  const baseline = y(Math.max(ticks.min, Math.min(0, ticks.max)));
  const points = (values: (number | null)[]) => values.map((value, index): [number, number | null] => [x(index), value === null ? null : y(value)]);

  const tooltip: TooltipData | null = active === null ? null : {
    title: tooltipLabels?.[active] ?? labels[active] ?? "",
    rows: [
      ...colored.filter(item => item.values[active] !== null && item.values[active] !== undefined)
        .map(item => ({ label: item.label, value: fmt(item.values[active] ?? 0), color: item.color, shape: (item.dashed || (item.projectFrom !== undefined && active >= item.projectFrom) ? "dashed" : "line") as "dashed" | "line" })),
      ...(band && band.lower[active] != null && band.upper[active] != null ? [{ label: band.label, value: `${fmt(band.lower[active] ?? 0)} – ${fmt(band.upper[active] ?? 0)}` }] : []),
      ...references.map(line => ({ label: line.label, value: fmt(line.value), color: line.color ?? "var(--muted)", shape: "dashed" as const })),
    ],
  };
  const activeTop = active === null ? null : Math.min(...colored.map(item => item.values[active]).filter((value): value is number => value !== null && value !== undefined).map(y), baseline);

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!count) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(event.clientX - rect.left - left, count, innerWidth));
  };

  const defaultSummary = hidden ? "Valores ocultos." : colored.map(item => {
    const ends = firstLast(item.values);
    return ends ? `${item.label}: de ${fmt(ends[0])} a ${fmt(ends[1])}` : `${item.label}: sem dados`;
  }).join("; ") + ".";
  const legend: LegendItem[] | undefined = colored.length > 1 || band || references.length
    ? [
      ...colored.map(item => ({ label: item.label, color: item.color, shape: (item.dashed ? "dashed" : item.fill ? "rect" : "line") as LegendItem["shape"] })),
      ...(band ? [{ label: band.label, color: bandColor, shape: "band" as const }] : []),
      ...references.map(line => ({ label: line.label, color: line.color ?? "var(--muted)", shape: "dashed" as const })),
    ]
    : undefined;
  const table = {
    columns: [xLabel, ...colored.map(item => item.label), ...(band ? [band.label] : [])],
    rows: labels.map((label, index) => [
      tooltipLabels?.[index] ?? label,
      ...colored.map(item => { const value = item.values[index]; return value === null || value === undefined ? "—" : fmt(value); }),
      ...(band ? [band.lower[index] != null && band.upper[index] != null ? `${fmt(band.lower[index] ?? 0)} – ${fmt(band.upper[index] ?? 0)}` : "—"] : []),
    ]),
  };
  const maxTicks = Math.max(2, Math.floor(innerWidth / 64));
  const baseTicks = labelIndexes(count, maxTicks);
  // Keep the highlighted position labelled, dropping neighbours that would collide with it.
  const tickGap = count > maxTicks ? Math.ceil((count - 1) / (maxTicks - 1)) * 0.75 : 0;
  const xTicks = highlightIndex !== undefined && highlightIndex >= 0 && highlightIndex < count && !baseTicks.includes(highlightIndex)
    ? [...baseTicks.filter(index => Math.abs(index - highlightIndex) >= tickGap), highlightIndex].sort((left, right) => left - right)
    : baseTicks;

  return <ChartFrame kind="area" title={title} summary={summary ?? defaultSummary} frameRef={frameRef} count={count} active={active} onActiveChange={setActive}
    onActivate={onSelect} tooltip={tooltip} tooltipAt={active === null || activeTop === null ? null : { x: x(active), y: MARGIN.top, placement: "side" }} table={table} legend={legend} className={className} plotWidth={width}
    note={singlePoint && singlePointNote ? singlePointNote : undefined}>
    <svg className={`chart-svg${animate ? " chart-animate" : ""}${onSelect ? " is-clickable" : ""}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}. ${summary ?? defaultSummary}`}
      onPointerMove={onPointerMove} onClick={() => { if (active !== null && onSelect) onSelect(active); }}>
      {highlightIndex !== undefined && highlightIndex >= 0 && highlightIndex < count && <line className="chart-highlight" x1={x(highlightIndex)} x2={x(highlightIndex)} y1={MARGIN.top} y2={MARGIN.top + innerHeight} stroke="var(--line-strong)" strokeWidth="1.5" />}
      <g className="chart-grid" aria-hidden="true">
        {yTicks.map(value => <g key={value}>
          <line x1={left} x2={left + innerWidth} y1={y(value)} y2={y(value)} stroke={value === 0 ? "var(--line-strong)" : "var(--line)"} strokeWidth="1" shapeRendering="crispEdges" />
          {!hidden && <text className="chart-axis chart-y-label" x={left - 8} y={y(value)} dy="0.32em" textAnchor="end" fill="var(--muted)">{axisFormat(value)}</text>}
        </g>)}
        {xTicks.map(index => <text key={index} className={`chart-axis${index === highlightIndex ? " is-strong" : ""}`} x={x(index)} y={height - 8} textAnchor={count > 1 && index === 0 ? "start" : count > 1 && index === count - 1 ? "end" : "middle"} fill={index === highlightIndex ? "var(--text)" : "var(--muted)"}>{labels[index]}</text>)}
      </g>
      {band && <path className="chart-band" d={areaPath(points(band.upper), points(band.lower))} fill={bandColor} fillOpacity="0.14" />}
      {colored.filter(item => item.fill).map(item => <path key={`${item.id}-fill`} className="chart-area-fill" style={series$(item.color)} d={areaPath(points(item.values), baseline)} fill={item.color} fillOpacity="0.1" />)}
      {references.map(line => <g key={line.label} className="chart-reference">
        <line className="chart-ref-line" style={{ stroke: line.color ?? "var(--muted)" }} x1={left} x2={left + innerWidth} y1={y(line.value)} y2={y(line.value)} stroke={line.color ?? "var(--muted)"} strokeWidth="1.5" strokeDasharray="5 4" />
      </g>)}
      {colored.map(item => {
        const all = points(item.values);
        if (item.dashed) return <path key={item.id} className="chart-line dashed" style={series$(item.color)} d={linePath(all)} fill="none" stroke={item.color} strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />;
        const split = item.projectFrom ?? count;
        const solid = all.map((point, index): [number, number | null] => (index <= split ? point : [point[0], null]));
        const projected = all.map((point, index): [number, number | null] => (index >= split ? point : [point[0], null]));
        return <g key={item.id}>
          <path className="chart-line" style={series$(item.color)} pathLength={1} d={linePath(solid)} fill="none" stroke={item.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {split < count && <path className="chart-line dashed is-projection" style={series$(item.color)} d={linePath(projected)} fill="none" stroke={item.color} strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />}
        </g>;
      })}
      {lonely.map(item => {
        const index = pointIndexes(item.values)[0] ?? 0;
        const value = item.values[index] ?? 0;
        const cx = x(index);
        const anchor = cx < left + 40 ? "start" : cx > left + innerWidth - 40 ? "end" : "middle";
        return <g key={`single-${item.id}`} className="chart-single-point">
          <circle className="chart-dot" style={series$(item.color)} cx={cx} cy={y(value)} r="5.5" fill={item.color} stroke="var(--panel)" strokeWidth="2" />
          {!hidden && <text className="chart-value-label" x={cx} y={Math.max(MARGIN.top + 10, y(value) - 12)} textAnchor={anchor} fill="var(--text)">{fmt(value)}</text>}
        </g>;
      })}
      {active !== null && <g className="chart-focus" aria-hidden="true">
        <line className="chart-crosshair" x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={MARGIN.top + innerHeight} stroke="var(--line-strong)" strokeWidth="1" />
        {colored.map(item => { const value = item.values[active]; return value === null || value === undefined ? null : <circle key={item.id} className="chart-dot" style={series$(item.color)} cx={x(active)} cy={y(value)} r="4.5" fill={item.color} stroke="var(--panel)" strokeWidth="2" />; })}
      </g>}
    </svg>
  </ChartFrame>;
}
