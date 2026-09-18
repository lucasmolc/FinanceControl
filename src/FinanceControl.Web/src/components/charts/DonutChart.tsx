import { useRef, useState } from "react";
import { brl } from "../../lib/money";
import { ChartFrame } from "./ChartFrame";
import { arcPath, donutSlices, formatShare, maskFormat, topWithOther, type TopItem } from "./chartMath";
import type { LegendItem, TooltipData, ValueFormatter } from "./chartTypes";
import { useChartEnv, useElementWidth } from "./useChartEnv";

export interface DonutItem { id: string | number; label: string; value: number; color?: string }

/** Item passed to `onSelect`; `other` is true for the folded "Outros" slice (id "outros"). */
export type DonutSelection = TopItem;

export interface DonutChartProps {
  title: string;
  items: DonutItem[];
  /** Slices shown before folding the rest into "Outros" (max 8). */
  maxSlices?: number;
  otherLabel?: string;
  /** Caption of the center when nothing is active. */
  centerLabel?: string;
  /** Center value when nothing is active (defaults to the formatted total). */
  centerValue?: string;
  /** Diameter in px (shrinks to the container width). */
  size?: number;
  format?: ValueFormatter;
  summary?: string;
  xLabel?: string;
  onSelect?: (item: DonutSelection) => void;
  /** Show value and share next to each legend entry. */
  legendValues?: boolean;
  className?: string;
}

/** Donut with center label, top-N + "Outros", hover/keyboard focus per slice and click drill-down. */
export function DonutChart({ title, items, maxSlices = 6, otherLabel = "Outros", centerLabel = "Total", centerValue, size = 200, format = brl, summary, xLabel = "Categoria", onSelect, legendValues = true, className }: DonutChartProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(frameRef, size);
  const { hidden, animate } = useChartEnv();
  const [active, setActive] = useState<number | null>(null);
  const fmt = maskFormat(format, hidden);
  const top = topWithOther(items, maxSlices, otherLabel);
  const slices = donutSlices(top);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const diameter = Math.max(120, Math.min(size, width));
  const center = diameter / 2;
  const outer = center - 6;
  const inner = outer * 0.64;
  const activeSlice = active === null ? undefined : slices[active];

  const tooltip: TooltipData | null = activeSlice ? {
    title: activeSlice.item.label,
    rows: [{ label: "do total", value: `${fmt(activeSlice.value)} · ${formatShare(activeSlice.share)}`, color: activeSlice.item.color }],
    note: onSelect ? (activeSlice.item.other ? "Clique para ver todas" : "Clique para ver os lançamentos") : undefined,
  } : null;
  const mid = activeSlice ? (activeSlice.start + activeSlice.end) / 2 : 0;
  const offset = Math.max(0, (width - diameter) / 2);
  const tooltipAt = activeSlice ? { x: offset + center + Math.sin(mid) * outer, y: center - Math.cos(mid) * outer } : null;
  const select = (index: number) => { const slice = slices[index]; if (slice && onSelect) onSelect(slice.item); };

  const defaultSummary = !slices.length ? "Sem dados no período." : hidden
    ? `${slices.length} fatias; valores ocultos.`
    : `Total ${fmt(total)}. ${slices.slice(0, 3).map(slice => `${slice.item.label} ${formatShare(slice.share)}`).join(", ")}${slices.length > 3 ? " e outras" : ""}.`;
  const legend: LegendItem[] = slices.map(slice => ({ label: slice.item.label, color: slice.item.color ?? "var(--muted)", shape: "rect", value: legendValues ? (hidden ? formatShare(slice.share) : `${fmt(slice.value)} · ${formatShare(slice.share)}`) : undefined }));
  const table = { columns: [xLabel, "Valor", "Participação"], rows: slices.map(slice => [slice.item.label, fmt(slice.value), formatShare(slice.share)]) };

  return <ChartFrame kind="donut" title={title} summary={summary ?? defaultSummary} frameRef={frameRef} count={slices.length} active={active} onActiveChange={setActive}
    onActivate={onSelect ? select : undefined} tooltip={tooltip} tooltipAt={tooltipAt} table={table} legend={legend} className={className}
    plotWidth={Math.max(width, diameter)}
    overlay={<div className="donut-center" aria-hidden="true">
      <span className="donut-label">{activeSlice ? activeSlice.item.label : centerLabel}</span>
      <span className="donut-value">{activeSlice ? fmt(activeSlice.value) : centerValue ?? fmt(total)}</span>
      {activeSlice && <span className="donut-share">{formatShare(activeSlice.share)}</span>}
    </div>}>
    <svg style={{ display: "block", margin: "0 auto" }} className={`chart-svg${animate ? " chart-animate" : ""}${onSelect ? " is-clickable" : ""}`} width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`} role="img" aria-label={`${title}. ${summary ?? defaultSummary}`}>
      {!slices.length && <circle cx={center} cy={center} r={(outer + inner) / 2} fill="none" stroke="var(--line)" strokeWidth={outer - inner} />}
      <g className="chart-slices">
        {slices.map((slice, index) => <path
          key={slice.item.id}
          className={`chart-slice chart-mark${index === active ? " is-active" : ""}`}
          d={arcPath(center, center, index === active ? outer + 4 : outer, inner, slice.start, slice.end)}
          fill={slice.item.color ?? "var(--muted)"}
          onPointerEnter={() => setActive(index)}
          onClick={() => select(index)}
        />)}
      </g>
    </svg>
  </ChartFrame>;
}
