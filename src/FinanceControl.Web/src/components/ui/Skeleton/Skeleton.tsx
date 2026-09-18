import { forwardRef, type CSSProperties } from "react";
import { cx } from "../shared/cx";

export interface SkeletonProps {
  variant?: "text" | "rect" | "circle";
  width?: number | string;
  height?: number | string;
  /** Text variant: number of lines (last one shorter). */
  lines?: number;
  /** When given, the block is a `role="status"` announcing this text (e.g. "Carregando lançamentos…"). */
  label?: string;
  className?: string;
}

/** Loading placeholder with shimmer (`.skeleton`; static under reduced motion / data-motion=off). */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton({ variant = "text", width, height, lines = 1, label, className }, ref) {
  const size: CSSProperties = { width, height };
  const blocks = variant === "text"
    ? Array.from({ length: lines }, (_, index) => <span key={index} className="ui-skeleton skeleton variant-text" style={{ ...size, width: index === lines - 1 && lines > 1 ? "62%" : width }} aria-hidden="true" />)
    : [<span key="block" className={cx("ui-skeleton skeleton", `variant-${variant}`)} style={size} aria-hidden="true" />];
  return <div ref={ref} className={cx("ui-skeleton-group", className)} role={label ? "status" : undefined} aria-live={label ? "polite" : undefined}>
    {label && <span className="sr-only">{label}</span>}
    {blocks}
  </div>;
});
