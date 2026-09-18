import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/preferences";
import { useAnimationsPreference } from "./usePreferences";

export interface CountUpOptions {
  /** Animation length in ms (default 700). */
  duration?: number;
  /** Start value of the first animation (default 0); later changes animate from the value on screen. */
  from?: number;
  /** false renders `target` directly. */
  enabled?: boolean;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Animated integer that counts from the previous value to `target` (hero balance, KPIs; MEL-30).
 * Returns `target` immediately when animations are off (preference or prefers-reduced-motion) or
 * requestAnimationFrame is unavailable. Always integer (minor units).
 */
export function useCountUp(target: number, { duration = 700, from = 0, enabled = true }: CountUpOptions = {}): number {
  const animations = useAnimationsPreference();
  const active = enabled && animations && duration > 0 && typeof window !== "undefined" && typeof window.requestAnimationFrame === "function" && !prefersReducedMotion();
  const safeTarget = Math.round(Number.isFinite(target) ? target : 0);
  const [value, setValue] = useState(() => (active ? Math.round(from) : safeTarget));
  const shownRef = useRef(value);

  useEffect(() => {
    if (!active) {
      shownRef.current = safeTarget;
      return;
    }
    const start = shownRef.current;
    if (start === safeTarget) return;
    let frame = 0;
    let startedAt: number | null = null;
    const step = (now: number) => {
      startedAt ??= now;
      const progress = Math.min(1, (now - startedAt) / duration);
      const next = progress >= 1 ? safeTarget : Math.round(start + (safeTarget - start) * easeOutCubic(progress));
      shownRef.current = next;
      setValue(next);
      if (progress < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [active, duration, safeTarget]);

  return active ? value : safeTarget;
}
