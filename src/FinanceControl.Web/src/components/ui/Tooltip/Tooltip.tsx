import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { cx } from "../shared/cx";
import { useFloating, type Placement } from "../shared/useFloating";

export interface TooltipProps {
  content: ReactNode;
  /** A single focusable element (button, link…). It gets `aria-describedby` pointing at the tooltip. */
  children: ReactElement<{ "aria-describedby"?: string }>;
  placement?: Placement;
  /** Hover delay in ms (focus shows immediately). */
  delay?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * APG tooltip: shown on hover (after `delay`) and on keyboard focus, hidden on blur/leave/Esc. It describes the
 * trigger (aria-describedby) and never holds interactive content. Icon-only buttons still need their own aria-label.
 */
export function Tooltip({ content, children, placement = "top", delay = 350, disabled = false, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const style = useFloating(anchorRef, tipRef, open, placement);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  const show = (wait: number) => {
    if (disabled) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), wait);
  };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  const describedBy = [children.props["aria-describedby"], id].filter(Boolean).join(" ");

  return <span ref={anchorRef} className="ui-tooltip-anchor" onMouseEnter={() => show(delay)} onMouseLeave={hide} onFocus={() => show(0)} onBlur={hide}>
    {cloneElement(children, { "aria-describedby": disabled ? children.props["aria-describedby"] : describedBy })}
    <span ref={tipRef} id={id} role="tooltip" className={cx("ui-tooltip", className)} style={open ? style : undefined} hidden={!open}>{content}</span>
  </span>;
}
