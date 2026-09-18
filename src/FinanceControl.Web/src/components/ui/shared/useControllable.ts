import { useCallback, useRef, useState } from "react";

/**
 * Controlled/uncontrolled state: uses `value` when defined, otherwise internal state seeded by `defaultValue`.
 * The setter always calls `onChange`.
 */
export function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (next: T) => void): [T, (next: T) => void] {
  const [inner, setInner] = useState<T>(defaultValue);
  const controlled = value !== undefined;
  const latest = useRef(onChange);
  latest.current = onChange;
  const set = useCallback((next: T) => {
    if (!controlled) setInner(next);
    latest.current?.(next);
  }, [controlled]);
  return [controlled ? value : inner, set];
}
