import type { CSSProperties } from "react";
import { Money } from "../../components/ui";
import { Segmented } from "../../components/ui/Segmented";
import type { Allocation, AllocationBy } from "./allocationModel";

const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export interface AllocationBarProps { value: Allocation; by: AllocationBy; onByChange: (by: AllocationBy) => void; note?: string | null; }

/**
 * CR-25: stacked allocation strip (series colors `--chart-1…8` in the validated ring order) with a legend that repeats
 * every label, share and value in text — color is never the only signal.
 */
export function AllocationBar({ value, by, onByChange, note }: AllocationBarProps) {
  const summary = value.slices.map(slice => `${slice.label} ${percentFormat.format(slice.percent)}%`).join(", ");
  return <section className="card allocation" aria-labelledby="allocation-title">
    <div className="card-header allocation-header">
      <h3 id="allocation-title" className="section-title">Alocação</h3>
      <Segmented size="sm" aria-label="Agrupar alocação por" value={by} onChange={next => onByChange(next as AllocationBy)}
        options={[{ value: "type", label: "Por tipo" }, { value: "liquidity", label: "Por liquidez" }]} />
    </div>
    {value.slices.length ? <>
      <div className="allocation-bar" role="img" aria-label={`Alocação ${by === "type" ? "por tipo" : "por liquidez"}: ${summary}`}>
        {value.slices.map((slice, index) => <span key={slice.key} className="allocation-segment"
          style={{ "--series": `var(--chart-${(index % 8) + 1})`, flexGrow: slice.cents } as CSSProperties} />)}
      </div>
      <ul className="allocation-legend">
        {value.slices.map((slice, index) => <li key={slice.key} style={{ "--series": `var(--chart-${(index % 8) + 1})` } as CSSProperties}>
          <span className="legend-swatch" aria-hidden="true" />
          <span className="allocation-label">{slice.label}</span>
          <b className="allocation-percent">{percentFormat.format(slice.percent)}%</b>
          <span className="allocation-value muted">· <Money cents={slice.cents} /></span>
        </li>)}
      </ul>
    </> : <p className="muted">Sem valor atual para distribuir.</p>}
    {note && <p className="field-hint missing-rate-note">{note}</p>}
  </section>;
}
