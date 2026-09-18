import type { CSSProperties } from "react";
import type { LegendItem } from "./chartTypes";

/** Swatch that mirrors the mark: rect for bars/areas, a short stroke for lines (dashed for projections). Color via `--series`. */
export function Swatch({ color, shape = "rect" }: { color: string; shape?: LegendItem["shape"] }) {
  const style = { "--series": color, ...(shape === "band" ? { opacity: 0.4 } : {}) } as CSSProperties;
  return <span className={`legend-swatch${shape === "line" || shape === "dashed" ? ` ${shape}` : ""}`} style={style} aria-hidden="true" />;
}

/** Chart legend (always present for ≥ 2 series); text stays in text tokens, identity comes from the swatch. */
export function Legend({ items, label = "Legenda" }: { items: LegendItem[]; label?: string }) {
  if (!items.length) return null;
  return <ul className="chart-legend" aria-label={label}>
    {items.map(item => <li className="legend-item" key={item.label}>
      <Swatch color={item.color} shape={item.shape} />
      <span className="legend-label">{item.label}</span>
      {item.value && <span className="legend-value">{item.value}</span>}
    </li>)}
  </ul>;
}
