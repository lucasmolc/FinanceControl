import type { CSSProperties } from "react";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";

export interface RankedItem { id: string | number; label: string; detail?: string; value: number }

/**
 * R3-REL-1: phones get a ranked list instead of the SVG bar chart, whose ~90 px label column cut every name to about
 * 14 characters ("Supermercado ·…" twice). Each item is the full label on its own line, then the bar with the value at
 * its end; the detail stays available to screen readers. Rows are buttons when `onSelect` is given (44 px targets).
 */
export function RankedBars({ title, items, color, onSelect }: { title: string; items: RankedItem[]; color: string; onSelect?: (index: number) => void }) {
  const money = useMoneyFormat();
  const max = Math.max(0, ...items.map(item => item.value));
  return <ol className="ranked-bars" aria-label={title} style={{ "--series": color } as CSSProperties}>
    {items.map((item, index) => {
      const share = max > 0 ? Math.max(2, Math.round((Math.max(0, item.value) / max) * 100)) : 0;
      const body = <>
        <span className="ranked-bars-label" title={item.label}>{item.label}</span>
        <span className="ranked-bars-row">
          <span className="ranked-bars-track" aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
          <span className="ranked-bars-value">{money(item.value)}</span>
        </span>
        {item.detail && <span className="sr-only">{item.detail}</span>}
      </>;
      return <li key={item.id}>
        {onSelect ? <button type="button" className="ranked-bars-item" onClick={() => onSelect(index)}>{body}</button> : <div className="ranked-bars-item">{body}</div>}
      </li>;
    })}
  </ol>;
}
