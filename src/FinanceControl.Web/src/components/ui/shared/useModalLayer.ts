import { useEffect, useRef, type RefObject } from "react";
import { dialogBackground } from "../../dialogHost";
import { restoreFocus } from "../../focus";
import { isTopLayer, pushLayer } from "../../layerStack";

const FIELDS = "input:not(:disabled):not([type='hidden']), select:not(:disabled), textarea:not(:disabled), [role='combobox']:not(:disabled)";

export const FOCUSABLE = "a[href], button:not(:disabled), input:not(:disabled):not([type='hidden']), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

/**
 * Modal behaviour shared by Drawer and CommandPalette (same rules as `Dialog`): renders in the dialog host,
 * makes the page (and dialogs opened before) inert, locks body scroll, traps Tab, closes on Escape
 * (only when it is the top of the shared layer stack, components/layerStack.ts — MEL-46) and restores focus on close. Initial focus:
 * `initialFocus()`, then `[data-autofocus]`, then the first field, then the first focusable element.
 * `layerRef` is the element appended to the host; `panelRef` holds the focusable content.
 */
export function useModalLayer(open: boolean, layerRef: RefObject<HTMLElement | null>, panelRef: RefObject<HTMLElement | null>, onClose: () => void, options: { busy?: boolean; initialFocus?: () => HTMLElement | null } = {}): void {
  const latest = useRef({ onClose, busy: options.busy ?? false, initialFocus: options.initialFocus });
  latest.current = { onClose, busy: options.busy ?? false, initialFocus: options.initialFocus };

  useEffect(() => {
    if (!open) return;
    const layer = layerRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = dialogBackground(layer);
    const previousInert = background.map(element => element.hasAttribute("inert"));
    const previousOverflow = document.body.style.overflow;
    background.forEach(element => element.setAttribute("inert", ""));
    document.body.style.overflow = "hidden";
    const stackEntry = pushLayer("modal-layer");
    const isTop = () => isTopLayer(stackEntry.token);

    const focusInitial = () => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const target = latest.current.initialFocus?.() ?? panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel.querySelector<HTMLElement>(FIELDS) ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? panel).focus();
    };
    // R4-CMD-2: focus right after mount (the panel is already in the DOM) — a background/throttled tab may never run the
    // animation frame; the frame stays as a fallback for content that only becomes focusable after layout.
    focusInitial();
    const frame = window.requestAnimationFrame(focusInitial);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!latest.current.busy) latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      const focusable = Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(element => !element.closest("[hidden]"));
      if (!panel || !focusable.length) { event.preventDefault(); return; }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !panel.contains(active))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      stackEntry.remove();
      background.forEach((element, index) => { if (!previousInert[index]) element.removeAttribute("inert"); });
      document.body.style.overflow = previousOverflow;
      restoreFocus(previousFocus);
    };
  }, [open, layerRef, panelRef]);
}
