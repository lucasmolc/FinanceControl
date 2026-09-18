import type { CSSProperties } from "react";

// Brand motion timings (MEL-48, R1-BR-1). Single source of truth: mirrored by the CSS
// tokens --motion-brand-* / --motion-page-* at the top of the brand section of styles/motion.css — keep both in sync.
//
// Opening (app load / setup completion), phases strictly in sequence (R1-BR-1):
//   meet   0-700   the mark and "LMM Finance" converge to the centre, the axis then the trend stroke draw, the coin pops
//                  last (every meet keyframe in motion.css ends by BRAND_MEET_MIN_MS — guarded by brandMotion.test.ts);
//   settle 700-1020 the finished lockup flies onto the shell brand (FLIP);
//   leave  1020-1200 the overlay fades and the app (whose entrances were held under the overlay) starts animating.
//   · it ends as soon as the data is ready, but never before BRAND_INTRO_MIN_MS (= BRAND_INTRO_MS, the full sequence);
//   · ceiling BRAND_INTRO_MAX_MS: data that arrives after BRAND_SETTLE_DEADLINE_MS skips the flight (fade only); past the
//     ceiling the overlay is an honest static loading state until the data arrives (no more choreography);
//   · reduced motion / animations off: no artificial minimum, a BRAND_FADE_MS opacity fade as soon as it is ready.
// Page changes: no overlay. The content crossfades in ≤ PAGE_TRANSITION_MS (View Transition or `.page-enter`, never
// both) with the sidebar and dock in place; a small brand mini-loader appears only when the lazy page takes longer than
// PAGE_LOADER_DELAY_MS.

/** Convergence (meet): the lockup is fully assembled at this moment, in ms. */
export const BRAND_MEET_MIN_MS = 700;
/** FLIP flight of the lockup onto the shell brand. */
export const BRAND_SETTLE_MS = 320;
/** Final fade of the overlay. */
export const BRAND_LEAVE_MS = 180;
/** Nominal length of the full opening choreography (meet + settle + leave), in ms. */
export const BRAND_INTRO_MS = BRAND_MEET_MIN_MS + BRAND_SETTLE_MS + BRAND_LEAVE_MS;
/** The opening never disappears before this (unless skipped): the whole sequence always plays, in ms. */
export const BRAND_INTRO_MIN_MS = BRAND_INTRO_MS;
/** Ceiling of the opening when the data is ready in time, in ms. */
export const BRAND_INTRO_MAX_MS = 1800;
/** Opacity-only fade used with reduced motion, after a skip and for late data. */
export const BRAND_FADE_MS = 150;
/** Latest reveal that still fits the flight under the ceiling; later data only fades. */
export const BRAND_SETTLE_DEADLINE_MS = BRAND_INTRO_MAX_MS - BRAND_SETTLE_MS - BRAND_LEAVE_MS;

/** Page change: total content transition (old content out + new content in), in ms. */
export const PAGE_TRANSITION_MS = 300;
/** Page change: the brand mini-loader only shows when the page chunk takes longer than this, in ms. */
export const PAGE_LOADER_DELAY_MS = 400;

/** How the opening reveals the app: the flight onto the shell brand, or a plain fade (late data, no target, motion off). */
export type BrandReveal = "settle" | "fade";


/**
 * FLIP values that put the intro mark on the shell mark. transform-origin is the left-centre of the intro lockup
 * (motion.css): the mark's left-centre P goes to T with scale s about origin O → translate = T − O − s·(P − O).
 */
export function settleFlip(lockup: DOMRect, mark: DOMRect, target: DOMRect): CSSProperties | null {
  if (mark.height <= 0 || target.height <= 0) return null;
  const scale = target.height / mark.height;
  const origin = { x: lockup.left, y: lockup.top + lockup.height / 2 };
  const from = { x: mark.left, y: mark.top + mark.height / 2 };
  const to = { x: target.left, y: target.top + target.height / 2 };
  const dx = to.x - origin.x - scale * (from.x - origin.x);
  const dy = to.y - origin.y - scale * (from.y - origin.y);
  return { "--settle-x": `${Math.round(dx)}px`, "--settle-y": `${Math.round(dy)}px`, "--settle-scale": String(Math.round(scale * 1000) / 1000) } as CSSProperties;
}
