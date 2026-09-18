import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { useAnimationsPreference, useHideValues } from "../../hooks/usePreferences";

function readReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function subscribeReducedMotion(callback: () => void): () => void {
  const media = typeof window === "undefined" ? undefined : window.matchMedia?.("(prefers-reduced-motion: reduce)");
  media?.addEventListener?.("change", callback);
  return () => media?.removeEventListener?.("change", callback);
}

/** Privacy mode (hide values, MEL-30) and whether chart draw-in animations may run (preference on, no reduced motion). */
export function useChartEnv(): { hidden: boolean; animate: boolean } {
  const hidden = useHideValues();
  const animations = useAnimationsPreference();
  const reduced = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => true);
  return { hidden, animate: animations && !reduced };
}

/** Width of the observed element (ResizeObserver); `fallback` until measured or when unsupported (tests). */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = Math.floor(element.getBoundingClientRect().width);
      if (next > 0) setWidth(current => (current === next ? current : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
