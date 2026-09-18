import { forwardRef, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";

const percent = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface KpiDeltaProps {
  /** Change as a ratio (0.123 = +12,3%) — or any number when `format` is given. */
  value: number | null | undefined;
  /** Formats the absolute value (default: percent pt-BR with 1 decimal). */
  format?: (absolute: number) => string;
  /** When true, a rise is bad (expenses): tone flips. */
  invert?: boolean;
  /** Screen-reader context, e.g. "em relação ao mês anterior". */
  context?: string;
  size?: Size;
  className?: string;
}

/** Variation chip (`.kpi-delta.up|down|flat`) with arrow + sign + text, so it never depends on color alone. */
export const KpiDelta = forwardRef<HTMLSpanElement, KpiDeltaProps>(function KpiDelta({ value, format = absolute => percent.format(absolute), invert = false, context, size = "md", className }, ref) {
  if (value == null || !Number.isFinite(value)) return <span ref={ref} className={cx("kpi-delta ui-kpi-delta flat", sizeClass(size), className)}>—<span className="sr-only"> sem comparação</span></span>;
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const good = direction === "flat" ? undefined : (direction === "up") !== invert;
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const text = format(Math.abs(value));
  const spoken = direction === "up" ? `Alta de ${text}` : direction === "down" ? `Queda de ${text}` : "Estável";
  return <span ref={ref} className={cx("kpi-delta ui-kpi-delta", direction, good === true && "is-good", good === false && "is-bad", sizeClass(size), className)}>
    <Icon size={size === "sm" ? 12 : 14} aria-hidden="true" />
    <span aria-hidden="true">{direction === "up" ? "+" : direction === "down" ? "−" : ""}{text}</span>
    <span className="sr-only">{spoken}{context ? ` ${context}` : ""}</span>
  </span>;
});

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  delta?: KpiDeltaProps;
  icon?: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "warning";
  size?: Size;
  /** Shows a shimmer instead of the value. */
  loading?: boolean;
  className?: string;
}

/** Metric block: label, big tabular value, optional delta and hint. */
export const Stat = forwardRef<HTMLDivElement, StatProps>(function Stat({ label, value, hint, delta, icon, tone = "neutral", size = "md", loading = false, className }, ref) {
  return <div ref={ref} className={cx("stat ui-stat", sizeClass(size), className)} aria-busy={loading || undefined}>
    <div className="ui-stat-head">
      {icon && <span className="ui-stat-icon" aria-hidden="true">{icon}</span>}
      <span className="stat-label">{label}</span>
    </div>
    <div className={cx("stat-value ui-stat-value", tone !== "neutral" && tone)}>
      {loading ? <span className="ui-skeleton skeleton" style={{ width: "7ch", height: "1em" }} aria-hidden="true" /> : value}
      {loading && <span className="sr-only">Carregando…</span>}
    </div>
    {(delta || hint) && <div className="ui-stat-foot">
      {delta && <KpiDelta {...delta} size="sm" />}
      {hint && <span className="stat-hint">{hint}</span>}
    </div>}
  </div>;
});
