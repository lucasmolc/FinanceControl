import { useCallback, useSyncExternalStore } from "react";
import { api, isConnectivityError } from "../api/client";
import { subscribeConnectivity } from "../api/connectivity";
import { getPreferences, setPreferences, subscribePreferences } from "../lib/preferencesStore";
import type { UiPreferences } from "../types";

export interface PreferencesApi {
  preferences: UiPreferences;
  /**
   * Applies `patch` instantly (optimistic: <html> attributes + localStorage) and persists it with PUT /api/settings.
   * R4-SH-1: preferences are local-first — when the server cannot be reached the change stays applied (and cached) and
   * is sent once the connection returns; the promise resolves. Only an answered failure (4xx/5xx) brings the previous
   * preferences back and rejects (callers show an error toast).
   */
  update: (patch: Partial<UiPreferences>) => Promise<void>;
}

/**
 * R1-CFG-9: preference writes are serialized and each one sends the LATEST preferences when its turn comes, so two
 * changes in the same tick (theme + density) both persist and the server never ends with an older snapshot.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
let pendingWrites = 0;
/** R4-SH-1: a change was applied locally while the server was unreachable and still has to be sent. */
let unsynced = false;
let stopWaiting: (() => void) | null = null;
/** When the last write settled; a state read sent before it (the reconnect refetch) may still answer with older prefs. */
let lastSettledAt = 0;
const SETTLE_GRACE_MS = 2000;

/**
 * True while a preferences write is queued, in flight or waiting for the connection (the App must not overwrite them
 * with a stale server copy — e.g. the refetch right after reconnecting).
 */
export const preferencesWritePending = (): boolean => pendingWrites > 0 || unsynced || Date.now() - lastSettledAt < SETTLE_GRACE_MS;

/** Sends the local preferences as soon as the server answers again (one listener, however many offline changes). */
function syncWhenOnline(): void {
  unsynced = true;
  if (stopWaiting) return;
  stopWaiting = subscribeConnectivity(status => {
    if (status !== "online") return;
    stopWaiting?.();
    stopWaiting = null;
    unsynced = false;
    persistLatest().catch(reason => { if (isConnectivityError(reason)) syncWhenOnline(); });
  });
}

function persistLatest(): Promise<void> {
  const send = () => api.settings({ ui_preferences: getPreferences() });
  // Idle queue: send right away (same tick); otherwise after the writes already queued.
  const run = (pendingWrites === 0 ? Promise.resolve(send()) : writeQueue.then(send)).then(() => undefined);
  pendingWrites += 1;
  const settle = () => { pendingWrites -= 1; lastSettledAt = Date.now(); };
  writeQueue = run.then(settle, settle);
  return run;
}

/** Current appearance preferences (MEL-30) and an optimistic `update`. */
export function usePreferences(): PreferencesApi {
  const preferences = useSyncExternalStore(subscribePreferences, getPreferences, getPreferences);
  const update = useCallback(async (patch: Partial<UiPreferences>) => {
    const previous = getPreferences();
    setPreferences({ ...previous, ...patch });
    try {
      await persistLatest();
    } catch (reason) {
      // Offline: keep the change (privacy mode must not silently switch back) and send it when the server is back.
      if (isConnectivityError(reason)) { syncWhenOnline(); return; }
      // Undo only the keys of this patch; changes made meanwhile (another key) are kept.
      const reverted: Record<string, unknown> = { ...getPreferences() };
      for (const key of Object.keys(patch) as (keyof UiPreferences)[]) reverted[key] = previous[key];
      setPreferences(reverted);
      throw reason;
    }
  }, []);
  return { preferences, update };
}

/** True while privacy mode ("ocultar valores") is on; Money renderers mask values. */
export function useHideValues(): boolean {
  return useSyncExternalStore(subscribePreferences, () => getPreferences().hide_values, () => getPreferences().hide_values);
}

/** True when animations are on in the preferences (the OS reduced-motion setting is checked separately). */
export function useAnimationsPreference(): boolean {
  return useSyncExternalStore(subscribePreferences, () => getPreferences().animations, () => getPreferences().animations);
}
