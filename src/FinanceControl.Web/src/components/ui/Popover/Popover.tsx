import { cloneElement, useEffect, useId, useRef, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { cx } from "../shared/cx";
import { FOCUSABLE } from "../shared/useModalLayer";
import { useControllable } from "../shared/useControllable";
import { useDismiss } from "../shared/useDismiss";
import { useFloating, type Placement } from "../shared/useFloating";

interface TriggerProps {
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  "aria-haspopup"?: string;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
}

export interface PopoverProps {
  /** The button that opens the popover. */
  trigger: ReactElement<TriggerProps>;
  /** Content, or a render function receiving `close`. */
  children: ReactNode | ((close: () => void) => ReactNode);
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: Placement;
  /** Accessible name of the popover dialog. */
  label?: string;
  /** Optional visible title (also names the dialog). */
  title?: ReactNode;
  /** Focus the first focusable element on open (default) or the panel itself. */
  initialFocus?: "first" | "panel";
  className?: string;
}

/**
 * Non-modal popover (role="dialog"): opens from its trigger, moves focus inside, closes on Esc (focus back to the
 * trigger), outside click, or when focus leaves both trigger and panel. Rendered inline with fixed positioning.
 */
export function Popover({ trigger, children, open, defaultOpen = false, onOpenChange, placement = "bottom-start", label, title, initialFocus = "first", className }: PopoverProps) {
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const id = useId();
  const titleId = `${id}-title`;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const style = useFloating(anchorRef, panelRef, isOpen, placement);

  const focusTrigger = () => anchorRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  const close = () => setOpen(false);
  useDismiss(isOpen, [anchorRef, panelRef], reason => { close(); if (reason === "escape") focusTrigger(); });

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const target = initialFocus === "first" ? panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel.querySelector<HTMLElement>(FOCUSABLE) : null;
      (target ?? panel).focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, initialFocus]);

  const triggerElement = cloneElement(trigger, {
    "aria-haspopup": "dialog",
    "aria-expanded": isOpen,
    "aria-controls": isOpen ? id : undefined,
    onClick: (event: MouseEvent<HTMLElement>) => { trigger.props.onClick?.(event); if (!event.defaultPrevented) setOpen(!isOpen); },
  });

  return <span ref={anchorRef} className="ui-popover-anchor">
    {triggerElement}
    {isOpen && <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-modal="false"
      aria-label={title ? undefined : label}
      aria-labelledby={title ? titleId : undefined}
      tabIndex={-1}
      className={cx("ui-popover", className)}
      style={style}
      onBlur={event => {
        const next = event.relatedTarget as Node | null;
        if (next && !panelRef.current?.contains(next) && !anchorRef.current?.contains(next)) close();
      }}
    >
      {title && <p id={titleId} className="ui-popover-title">{title}</p>}
      {typeof children === "function" ? children(close) : children}
    </div>}
  </span>;
}
