import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { dialogBackground, dialogHost } from "./dialogHost";
import { restoreFocus } from "./focus";
import { isTopLayer, pushLayer } from "./layerStack";

const FOCUSABLE = "a[href], button:not(:disabled), input:not(:disabled):not([type='hidden']), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
const FIELDS = "input:not(:disabled):not([type='hidden']), select:not(:disabled), textarea:not(:disabled)";

/** Open dialogs, innermost last (focus fallback when a nested dialog closes). Escape/Tab follow the shared layer stack. */
const openDialogs: symbol[] = [];
/** Card element of each open dialog (focus fallback when a nested dialog closes). */
const dialogCards = new Map<symbol, HTMLElement>();

export interface DialogProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
  /** While busy, Escape and the close button do nothing. */
  busy?: boolean;
  /** Optional accessible description id (element inside children). */
  describedBy?: string;
  /** Hide the header close button (e.g. mandatory first-run flows). */
  hideClose?: boolean;
  role?: "dialog" | "alertdialog";
}

/**
 * Modal dialog rendered through a portal into the single dialog host in `document.body` (MEL-18).
 * Focuses the first field (or `[data-autofocus]`, or the first action), traps Tab, closes on Escape unless busy,
 * makes everything behind it inert (the app root's children and any dialog opened before it), locks body scroll
 * and restores focus on close (to the trigger; when it is gone or hidden, to the page heading or `main`).
 */
export function Dialog({ title, onClose, children, footer, size = "md", busy = false, describedBy, hideClose = false, role = "dialog" }: DialogProps) {
  const [host] = useState(dialogHost);
  const modalRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const latest = useRef({ onClose, busy });

  useEffect(() => { latest.current = { onClose, busy }; }, [onClose, busy]);

  useEffect(() => {
    const token = Symbol("dialog");
    openDialogs.push(token);
    const layer = pushLayer("dialog");
    if (cardRef.current) dialogCards.set(token, cardRef.current);
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = dialogBackground(modalRef.current);
    const previousInert = background.map(element => element.hasAttribute("inert"));
    const previousOverflow = document.body.style.overflow;
    background.forEach(element => element.setAttribute("inert", ""));
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      const card = cardRef.current;
      if (!card || card.contains(document.activeElement)) return;
      const target = card.querySelector<HTMLElement>("[data-autofocus]")
        ?? card.querySelector<HTMLElement>(`.modal-body ${FIELDS}`)
        ?? card.querySelector<HTMLElement>(".modal-actions button:not(:disabled)")
        ?? card.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? card).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopLayer(layer.token)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!latest.current.busy) latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const card = cardRef.current;
      const focusable = Array.from(card?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (!card || !focusable.length) { event.preventDefault(); return; }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !card.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !card.contains(active))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      layer.remove();
      const index = openDialogs.indexOf(token);
      if (index >= 0) openDialogs.splice(index, 1);
      dialogCards.delete(token);
      background.forEach((element, position) => { if (!previousInert[position]) element.removeAttribute("inert"); });
      document.body.style.overflow = previousOverflow;
      // MEL-08: when the trigger is gone or hidden, focus the enclosing dialog or the page heading, never body.
      const outer = openDialogs.length ? dialogCards.get(openDialogs[openDialogs.length - 1]!) : undefined;
      if (!outer) { restoreFocus(previousFocus); return; }
      if (previousFocus?.isConnected && outer.contains(previousFocus)) previousFocus.focus();
      if (document.activeElement !== previousFocus || !previousFocus) outer.focus();
    };
  }, []);

  return createPortal(<div ref={modalRef} className="modal">
    <div ref={cardRef} className={`modal-card${size === "lg" ? " size-lg" : ""}`} role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} aria-busy={busy || undefined} tabIndex={-1}>
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        {!hideClose && <button type="button" className="icon-btn" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={18} aria-hidden="true" /></button>}
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-actions">{footer}</div>}
    </div>
  </div>, host.isConnected ? host : dialogHost());
}
