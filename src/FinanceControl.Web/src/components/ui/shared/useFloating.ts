import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

export type Placement = "bottom-start" | "bottom-end" | "bottom" | "top-start" | "top-end" | "top" | "left" | "right";

const GAP = 6;
const MARGIN = 8;

/**
 * Positions a floating element with `position: fixed` next to its anchor (flips vertically when there is
 * not enough room, clamps to the viewport). Rendered inline (not portaled) so it keeps working inside dialogs.
 */
export function useFloating(anchorRef: RefObject<HTMLElement | null>, floatingRef: RefObject<HTMLElement | null>, open: boolean, placement: Placement = "bottom-start", matchWidth = false): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", top: 0, left: 0, opacity: 0, pointerEvents: "none" });

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = anchorRef.current;
      const floating = floatingRef.current;
      if (!anchor || !floating) return;
      const a = anchor.getBoundingClientRect();
      const width = floating.offsetWidth || a.width;
      const height = floating.offsetHeight;
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      let top: number;
      let left: number;
      const [side, align] = placement.split("-") as [string, string | undefined];
      if (side === "left" || side === "right") {
        left = side === "left" ? a.left - width - GAP : a.right + GAP;
        if (side === "right" && left + width > vw - MARGIN) left = a.left - width - GAP;
        if (side === "left" && left < MARGIN) left = a.right + GAP;
        top = a.top + a.height / 2 - height / 2;
      } else {
        const below = a.bottom + GAP;
        const above = a.top - GAP - height;
        const preferTop = side === "top";
        const fitsBelow = below + height <= vh - MARGIN;
        const fitsAbove = above >= MARGIN;
        top = preferTop ? (fitsAbove || !fitsBelow ? above : below) : (fitsBelow || !fitsAbove ? below : above);
        left = align === "end" ? a.right - width : align === "start" ? a.left : a.left + a.width / 2 - width / 2;
      }
      left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));
      top = Math.max(MARGIN, Math.min(top, vh - height - MARGIN));
      setStyle({ position: "fixed", top: Math.round(top), left: Math.round(left), ...(matchWidth ? { minWidth: Math.round(a.width) } : {}) });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (observer && floatingRef.current) observer.observe(floatingRef.current);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer?.disconnect();
    };
  }, [open, placement, matchWidth, anchorRef, floatingRef]);

  return style;
}
