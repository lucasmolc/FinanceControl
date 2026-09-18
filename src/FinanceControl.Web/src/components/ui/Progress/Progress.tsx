import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { cx, sizeClass, type Size } from "../shared/cx";

export interface ProgressProps {
  value?: number;
  max?: number;
  /** Accessible name (and visible label when `showLabel`). */
  label: string;
  /** Visible label row (label + value text). */
  showLabel?: boolean;
  /** Text of the value (default "NN%"); also the aria-valuetext. */
  valueText?: string;
  /** "auto" → positive when complete, warning above 85%, danger above 100% (budgets). */
  tone?: "accent" | "positive" | "warning" | "danger" | "auto";
  size?: Size;
  /** Unknown progress (animated bar, no value). */
  indeterminate?: boolean;
  hint?: ReactNode;
  className?: string;
}

/** Progress bar (role="progressbar" with aria-valuenow/valuetext). Values above `max` show as full with the danger tone in "auto". */
export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress({ value = 0, max = 100, label, showLabel = false, valueText, tone = "accent", size = "md", indeterminate = false, hint, className }, ref) {
  const ratio = max > 0 ? value / max : 0;
  const pct = Math.round(ratio * 100);
  const resolvedTone = tone === "auto" ? (ratio > 1 ? "danger" : ratio >= 1 ? "positive" : ratio > 0.85 ? "warning" : "accent") : tone;
  const text = valueText ?? `${pct}%`;
  return <div ref={ref} className={cx("ui-progress", `tone-${resolvedTone}`, sizeClass(size), indeterminate && "is-indeterminate", className)}>
    {showLabel && <div className="ui-progress-head"><span>{label}</span>{!indeterminate && <span className="ui-progress-value">{text}</span>}</div>}
    <div
      className="ui-progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : max}
      aria-valuenow={indeterminate ? undefined : Math.min(value, max)}
      aria-valuetext={indeterminate ? undefined : text}
    >
      <span className="ui-progress-bar" style={{ "--progress": `${Math.max(0, Math.min(100, ratio * 100))}%` } as CSSProperties} />
    </div>
    {hint && <p className="field-hint">{hint}</p>}
  </div>;
});
