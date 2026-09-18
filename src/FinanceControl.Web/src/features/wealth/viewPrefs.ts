// Per-viewer view choices (cards/list, sort order). localStorage may be missing or blocked: every access is guarded.

export function readViewPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value !== null && (allowed as readonly string[]).includes(value) ? value as T : fallback;
  } catch {
    return fallback;
  }
}

export function writeViewPref(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* private mode / blocked storage: keep it in memory only */ }
}
