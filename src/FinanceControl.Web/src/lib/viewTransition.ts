import { flushSync } from "react-dom";
import { motionAllowed } from "./preferences";
import { getPreferences } from "./preferencesStore";

type ViewTransitionLike = { finished?: Promise<unknown>; ready?: Promise<unknown> };
type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => ViewTransitionLike | undefined };

/**
 * Runs a UI update inside `document.startViewTransition` when available and motion is allowed (MEL-48 page change:
 * content crossfade ≤ PAGE_TRANSITION_MS; sidebar, dock and brand keep their view-transition-name and do not move).
 * While the transition runs `<html data-view-transition>` is set so the live `.page-enter` animation does not play a
 * second time under the snapshot. Otherwise updates directly and `.page-enter` takes over.
 */
export function runViewTransition(update: () => void): void {
  const doc = typeof document === "undefined" ? null : document as ViewTransitionDocument;
  if (!doc || typeof doc.startViewTransition !== "function" || !motionAllowed(getPreferences())) { update(); return; }
  const root = doc.documentElement;
  try {
    root.dataset.viewTransition = "";
    const transition = doc.startViewTransition(() => { flushSync(update); });
    const clear = () => { delete root.dataset.viewTransition; };
    // A skipped transition (hidden tab, a newer navigation) rejects `ready`; the update still ran, nothing to report.
    transition?.ready?.catch(() => undefined);
    if (transition?.finished) transition.finished.then(clear, clear); else clear();
  } catch {
    delete root.dataset.viewTransition;
    update();
  }
}

/** True while a page-change View Transition runs (its snapshot animates: the live page must not add `.page-enter`). */
export function viewTransitionRunning(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute("data-view-transition");
}

/**
 * R1-X-1 / decision 6: a new page always starts at the top (with or without a View Transition). Called inside the
 * transition update, so the new snapshot is already scrolled.
 */
export function resetPageScroll(): void {
  if (typeof window === "undefined" || (window.scrollY === 0 && window.scrollX === 0)) return;
  window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
}
