import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { dialogHost } from "../../dialogHost";
import { cx } from "../shared/cx";
import { useModalLayer } from "../shared/useModalLayer";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Desktop side. On screens ≤ 640px every drawer becomes a bottom sheet. */
  side?: "right" | "left" | "bottom";
  size?: "sm" | "md" | "lg";
  /** While busy, Esc/close/backdrop do nothing. */
  busy?: boolean;
  /** Clicking the backdrop closes (default true). */
  closeOnBackdrop?: boolean;
  className?: string;
}

/**
 * Modal side panel (details, filters) — bottom sheet on phones. Same modal rules as `Dialog` (MEL-18): rendered in the
 * shared dialog host, page inert, scroll locked, focus trapped, Esc closes the top-most layer, focus restored.
 */
export function Drawer({ open, onClose, title, description, children, footer, side = "right", size = "md", busy = false, closeOnBackdrop = true, className }: DrawerProps) {
  const [host] = useState(() => (typeof document === "undefined" ? null : dialogHost()));
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalLayer(open, layerRef, panelRef, onClose, { busy });
  if (!open || !host) return null;
  return createPortal(<div ref={layerRef} className={cx("ui-drawer-layer", `side-${side}`)} onMouseDown={event => { if (event.target === event.currentTarget && closeOnBackdrop && !busy) onClose(); }}>
    <div ref={panelRef} className={cx("ui-drawer", `side-${side}`, `size-${size}`, className)} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} aria-busy={busy || undefined} tabIndex={-1}>
      <span className="ui-drawer-grip" aria-hidden="true" />
      <div className="ui-drawer-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId} className="muted">{description}</p>}
        </div>
        <button type="button" className="icon-btn" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="ui-drawer-body">{children}</div>
      {footer && <div className="ui-drawer-footer">{footer}</div>}
    </div>
  </div>, host.isConnected ? host : dialogHost());
}

/** Bottom sheet (Drawer with side="bottom"). */
export function Sheet(props: Omit<DrawerProps, "side">) {
  return <Drawer {...props} side="bottom" />;
}
