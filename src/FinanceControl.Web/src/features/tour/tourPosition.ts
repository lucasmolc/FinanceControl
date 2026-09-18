/**
 * CR-07: places the tour popover next to its target — below when it fits, else above (flip), else beside it
 * (right, then left) for tall targets such as the sidebar, else docked at the bottom of the viewport.
 * The arrow points at the target: horizontally (below/above) or vertically (right/left).
 */
export interface Rect { top: number; left: number; width: number; height: number; }
export interface Viewport { width: number; height: number; }
export type TourPlacement = "below" | "above" | "right" | "left" | "docked";
export interface TourPosition {
  placement: TourPlacement; top: number; left: number;
  /** Arrow offset inside the popover (px): x for below/above, y for right/left; null when docked. */
  arrow: number | null;
}

const GAP = 14;
const MARGIN = 12;
const ARROW_INSET = 22;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** `bottomInset`: space reserved at the bottom (mobile dock). */
export function tourPosition(target: Rect, popover: { width: number; height: number }, viewport: Viewport, bottomInset = 0): TourPosition {
  const width = Math.min(popover.width, viewport.width - MARGIN * 2);
  const bottomLimit = viewport.height - bottomInset - MARGIN;
  const centerX = target.left + target.width / 2;

  // Below / above: aligned on the target's center, arrow on x.
  const left = clamp(centerX - width / 2, MARGIN, viewport.width - MARGIN - width);
  const arrowX = clamp(centerX - left, ARROW_INSET, width - ARROW_INSET);
  const below = target.top + target.height + GAP;
  if (below + popover.height <= bottomLimit && below >= MARGIN) return { placement: "below", top: below, left, arrow: arrowX };
  const above = target.top - GAP - popover.height;
  if (above >= MARGIN && target.top <= bottomLimit) return { placement: "above", top: above, left, arrow: arrowX };

  // Beside (tall targets): vertically near the visible part of the target, arrow on y.
  const visibleTop = Math.max(target.top, MARGIN);
  const visibleBottom = Math.min(target.top + target.height, bottomLimit);
  const anchorY = visibleBottom > visibleTop ? Math.min(visibleTop + 48, (visibleTop + visibleBottom) / 2) : bottomLimit / 2;
  const top = clamp(anchorY - 40, MARGIN, bottomLimit - popover.height);
  const arrowY = clamp(anchorY - top, ARROW_INSET, popover.height - ARROW_INSET);
  const right = target.left + target.width + GAP;
  if (right + width <= viewport.width - MARGIN) return { placement: "right", top, left: right, arrow: arrowY };
  const leftSide = target.left - GAP - width;
  if (leftSide >= MARGIN) return { placement: "left", top, left: leftSide, arrow: arrowY };

  return { placement: "docked", top: Math.max(MARGIN, bottomLimit - popover.height), left: Math.max(MARGIN, viewport.width - MARGIN - width), arrow: null };
}

/**
 * R2-TOUR-1 (phones): where the target's top should sit before the popover is placed, so that target + gap + popover
 * fit between the sticky topbar (`topInset`) and the dock (`bottomInset`) and the popover never covers what it explains.
 * The pair is centred in the free band; a target taller than the band goes to the top (the popover then docks below).
 */
export function phoneTargetTop(targetHeight: number, popoverHeight: number, viewport: Viewport, bottomInset = 0, topInset = 0): number {
  const top = topInset + MARGIN;
  const bottomLimit = viewport.height - bottomInset - MARGIN;
  const pair = targetHeight + GAP + popoverHeight;
  if (top + pair <= bottomLimit) return top + Math.floor((bottomLimit - top - pair) / 2);
  return top;
}
