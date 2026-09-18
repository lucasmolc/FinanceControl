import { useId, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Legend, Swatch } from "./Legend";
import type { ChartPoint, LegendItem, TableData, TooltipData } from "./chartTypes";

export interface ChartFrameProps {
  kind: "area" | "bar" | "donut" | "sparkline";
  /** Short chart name (table caption and accessible name). */
  title: string;
  /** One-sentence data summary for screen readers. */
  summary: string;
  frameRef: Ref<HTMLDivElement>;
  /** Number of keyboard-navigable positions (0 disables keyboard exploration). */
  count: number;
  active: number | null;
  onActiveChange: (index: number | null) => void;
  /** Enter/Space on the active position (drill-down). */
  onActivate?: (index: number) => void;
  tooltip: TooltipData | null;
  tooltipAt: ChartPoint | null;
  table: TableData;
  legend?: LegendItem[];
  className?: string;
  /** The chart's <svg>; it must carry role="img" and the title + summary as aria-label. */
  children: ReactNode;
  /** Extra content drawn over the plot (e.g. donut center label). */
  overlay?: ReactNode;
  /** Plot width in px (keeps the tooltip inside the plot). */
  plotWidth: number;
  /** Short visible caption under the plot (e.g. "O histórico começa neste mês."). */
  note?: ReactNode;
}

const TOOLTIP_HALF = 90;

/** Anchors the tooltip above the point (or below it near the top), clamped inside the plot. */
function tooltipStyle(at: ChartPoint, plotWidth: number): CSSProperties {
  if (at.placement === "side") {
    const flip = at.x > plotWidth * 0.6;
    return { left: at.x, top: at.y, transform: flip ? "translateX(calc(-100% - 14px))" : "translateX(14px)" };
  }
  const x = plotWidth > TOOLTIP_HALF * 2 ? Math.min(Math.max(at.x, TOOLTIP_HALF), plotWidth - TOOLTIP_HALF) : plotWidth / 2;
  const below = at.y < 70;
  return { left: x, top: at.y, transform: below ? "translate(-50%, 14px)" : "translate(-50%, calc(-100% - 12px))" };
}

function tooltipText(tooltip: TooltipData): string {
  return [tooltip.title, ...tooltip.rows.map(row => `${row.label}: ${row.value}`), tooltip.note].filter(Boolean).join(". ");
}

/**
 * Common chart chrome: `figure.chart.chart-<kind>` with a focusable plot (arrow keys move the active datum,
 * Enter/Space activates, Escape clears), a hover/keyboard tooltip, a polite live readout, a legend and a
 * visually hidden data table so no value is gated behind hover.
 */
export function ChartFrame({ kind, title, summary, frameRef, count, active, onActiveChange, onActivate, tooltip, tooltipAt, table, legend, className, children, overlay, plotWidth, note }: ChartFrameProps) {
  const hintId = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!count) return;
    const current = active ?? -1;
    let next: number | null | undefined;
    switch (event.key) {
      case "ArrowRight": case "ArrowDown": next = Math.min(count - 1, current + 1); break;
      case "ArrowLeft": case "ArrowUp": next = current < 0 ? 0 : Math.max(0, current - 1); break;
      case "Home": next = 0; break;
      case "End": next = count - 1; break;
      case "Escape": next = null; break;
      case "Enter": case " ":
        if (active !== null && onActivate) { event.preventDefault(); onActivate(active); }
        return;
      default: return;
    }
    event.preventDefault();
    onActiveChange(next);
  };

  return <figure className={`chart chart-${kind}${className ? ` ${className}` : ""}`}>
    <div
      ref={frameRef}
      className="chart-plot"
      style={{ position: "relative", width: "100%" }}
      tabIndex={count ? 0 : undefined}
      role={count ? "group" : undefined}
      aria-label={count ? title : undefined}
      aria-describedby={count ? hintId : undefined}
      onKeyDown={onKeyDown}
      onBlur={() => onActiveChange(null)}
      onPointerLeave={() => onActiveChange(null)}
    >
      {children}
      {overlay}
      {tooltip && tooltipAt && <div className="chart-tooltip" aria-hidden="true" style={tooltipStyle(tooltipAt, plotWidth)}>
        <p className="chart-tooltip-title">{tooltip.title}</p>
        {tooltip.rows.map(row => <div className="chart-tooltip-row" key={row.label}>
          {row.color ? <Swatch color={row.color} shape={row.shape === "dashed" ? "dashed" : "line"} /> : <span aria-hidden="true" />}
          <span className="chart-tooltip-label">{row.label}</span>
          <b className="chart-tooltip-value">{row.value}</b>
        </div>)}
        {tooltip.note && <p className="chart-tooltip-note muted">{tooltip.note}</p>}
      </div>}
    </div>
    {count > 0 && <p id={hintId} className="sr-only">{summary} Use as setas para percorrer os valores{onActivate ? " e Enter para abrir o item" : ""}.</p>}
    <p className="sr-only" aria-live="polite">{tooltip && active !== null ? tooltipText(tooltip) : ""}</p>
    {note && <p className="chart-note muted">{note}</p>}
    {legend && <Legend items={legend} />}
    {/* Tables grow to their content, so the visually hidden box is a wrapping div (no page overflow). */}
    <div className="sr-only"><table className="chart-table">
      <caption>{title}</caption>
      <thead><tr>{table.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th key={cellIndex} scope="row">{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
    </table></div>
  </figure>;
}
