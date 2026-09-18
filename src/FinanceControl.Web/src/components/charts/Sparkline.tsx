import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { brl } from "../../lib/money";
import { ChartFrame } from "./ChartFrame";
import { areaPath, extent, firstLast, linearScale, linePath, maskFormat, nearestIndex } from "./chartMath";
import type { ValueFormatter } from "./chartTypes";
import { useChartEnv, useElementWidth } from "./useChartEnv";

export interface SparklineProps {
  title: string;
  values: (number | null)[];
  /** Label per value for the tooltip/table (e.g. "setembro de 2026"). */
  labels?: string[];
  height?: number;
  /** Stroke color (defaults to the lead chart color). */
  color?: string;
  fill?: boolean;
  format?: ValueFormatter;
  summary?: string;
  xLabel?: string;
  className?: string;
}

/** Axis-less trend line; the last point is marked. Hover/keyboard tooltip + hidden table like every chart. */
export function Sparkline({ title, values, labels, height = 44, color = "var(--chart-1, var(--accent))", fill = true, format = brl, summary, xLabel = "Período", className }: SparklineProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(frameRef, 160);
  const { hidden, animate } = useChartEnv();
  const [active, setActive] = useState<number | null>(null);
  const fmt = maskFormat(format, hidden);
  const count = values.length;
  const pad = 5;
  const [min, max] = extent(values);
  const y = linearScale(min === max ? [min - 1, max + 1] : [min, max], [height - pad, pad]);
  const x = (index: number) => pad + (count <= 1 ? (width - pad * 2) / 2 : (index / (count - 1)) * (width - pad * 2));
  const points = values.map((value, index): [number, number | null] => [x(index), value === null ? null : y(value)]);
  const lastIndex = values.reduce<number>((last, value, index) => (value === null ? last : index), -1);
  const focus = active ?? null;
  const focusValue = focus === null ? null : values[focus] ?? null;
  const ends = firstLast(values);
  const labelAt = (index: number) => labels?.[index] ?? String(index + 1);
  const seriesStyle = { "--series": color } as CSSProperties;
  const defaultSummary = !ends ? "Sem dados." : hidden ? "Valores ocultos." : `De ${fmt(ends[0])} a ${fmt(ends[1])}.`;

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(event.clientX - rect.left - pad, count, width - pad * 2));
  };

  return <ChartFrame kind="sparkline" title={title} summary={summary ?? defaultSummary} frameRef={frameRef} count={count} active={active} onActiveChange={setActive}
    tooltip={focus !== null && focusValue !== null ? { title: labelAt(focus), rows: [{ label: title, value: fmt(focusValue), color }] } : null}
    tooltipAt={focus !== null && focusValue !== null ? { x: x(focus), y: y(focusValue) } : null}
    table={{ columns: [xLabel, title], rows: values.map((value, index) => [labelAt(index), value === null ? "—" : fmt(value)]) }} className={className} plotWidth={width}>
    <svg className={`chart-svg${animate ? " chart-animate" : ""}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}. ${summary ?? defaultSummary}`} onPointerMove={onPointerMove}>
      {fill && <path className="chart-area-fill" style={seriesStyle} d={areaPath(points, height - pad)} fill={color} fillOpacity="0.1" />}
      <path className="chart-line" style={seriesStyle} pathLength={1} d={linePath(points)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {lastIndex >= 0 && focus === null && <circle className="chart-dot" style={seriesStyle} cx={x(lastIndex)} cy={y(values[lastIndex] ?? 0)} r="4" fill={color} stroke="var(--panel)" strokeWidth="2" />}
      {focus !== null && focusValue !== null && <circle className="chart-dot" style={seriesStyle} cx={x(focus)} cy={y(focusValue)} r="4.5" fill={color} stroke="var(--panel)" strokeWidth="2" />}
    </svg>
  </ChartFrame>;
}
