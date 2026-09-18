import type { UiPreferences } from "../types";
import { applyPreferences, DEFAULT_PREFERENCES, normalizePreferences, readCachedPreferences, samePreferences, writeCachedPreferences } from "./preferences";

// Tiny external store for the appearance preferences (read with useSyncExternalStore in hooks/usePreferences.ts).
// Module-level on purpose: Money renderers and the shell read it without a provider.

type Listener = () => void;

let current: UiPreferences = DEFAULT_PREFERENCES;
let initialized = false;
const listeners = new Set<Listener>();
let systemQuery: MediaQueryList | null = null;

function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  current = readCachedPreferences() ?? DEFAULT_PREFERENCES;
}

/** Re-applies "sistema" when the OS color scheme changes. */
function watchSystemTheme() {
  if (systemQuery || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  try {
    systemQuery = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => { if (current.theme === "sistema") applyPreferences(current); };
    if (typeof systemQuery.addEventListener === "function") systemQuery.addEventListener("change", onChange);
  } catch {
    systemQuery = null;
  }
}

export function getPreferences(): UiPreferences {
  ensureInitialized();
  return current;
}

export function subscribePreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Replaces the preferences: applies them on <html>, caches them and notifies subscribers (no-op when unchanged). */
export function setPreferences(next: unknown): UiPreferences {
  ensureInitialized();
  const normalized = normalizePreferences(next);
  if (samePreferences(normalized, current)) { applySafely(normalized); return current; }
  current = normalized;
  applySafely(current);
  writeCachedPreferences(current);
  watchSystemTheme();
  listeners.forEach(listener => listener());
  return current;
}

function applySafely(preferences: UiPreferences) {
  try { applyPreferences(preferences); } catch { /* no document */ }
}

/** Tests only: back to defaults without touching the cache. */
export function resetPreferencesForTests(): void {
  current = DEFAULT_PREFERENCES;
  initialized = true;
  listeners.forEach(listener => listener());
}
