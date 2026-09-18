import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { connectivityStatus, markServerOffline, reportRequestFailure, subscribeConnectivity, type Connectivity } from "../api/connectivity";

/**
 * Retry delays while the local server is unreachable (then every 5 s). R4-SH-2: capped at 5 s — the probe is a local
 * `/api/health` call, and a restarted server must not wait ~18 s for the next attempt.
 */
export const SERVER_RETRY_DELAYS_MS = [2000, 3000, 5000];

/** R3-X-1: while online, a light `/api/health` ping every 30 s (tab visible) and when the window regains focus. */
export const SERVER_HEARTBEAT_MS = 30000;
/** Focus/visibility pings closer than this to the previous one are skipped. */
const HEARTBEAT_MIN_GAP_MS = 5000;

export interface ServerStatus {
  /** True once a failed request was confirmed by the health probe, until the server answers again. */
  offline: boolean;
  /** True while a probe is in flight. */
  checking: boolean;
  /** Probes now (the banner's "Tentar agora"). */
  retry: () => void;
}

/**
 * R1 decision 4 / R1-SH-3: global connectivity with the local server. A failed request (reported by api/client.ts) is
 * confirmed with `/api/health`; when that fails too the app is offline: it keeps probing with exponential backoff and
 * immediately on `online`, window focus and when the tab becomes visible. `onRecover` runs once when the server answers
 * again (the App refetches the current page).
 */
export function useServerStatus(onRecover: () => void): ServerStatus {
  const [status, setStatus] = useState<Connectivity>(connectivityStatus);
  const [checking, setChecking] = useState(false);
  const attempt = useRef(0);
  const inFlight = useRef(false);
  const onRecoverRef = useRef(onRecover);
  useEffect(() => { onRecoverRef.current = onRecover; }, [onRecover]);

  const probe = useCallback(() => {
    if (inFlight.current || connectivityStatus() === "online") return;
    inFlight.current = true;
    setChecking(true);
    // An answer flips connectivity to "online" through api/client; a failure confirms "offline".
    void Promise.resolve().then(() => api.health()).then(() => undefined, () => { markServerOffline(); }).finally(() => {
      inFlight.current = false;
      attempt.current += 1;
      setChecking(false);
    });
  }, []);

  const statusRef = useRef(status);
  useEffect(() => subscribeConnectivity(next => {
    const previous = statusRef.current;
    statusRef.current = next;
    setStatus(next);
    if (next === "online" && previous === "offline") { attempt.current = 0; onRecoverRef.current(); }
    if (next === "checking") probe();
  }), [probe]);

  // A failure reported before this hook subscribed still gets its probe.
  useEffect(() => { if (connectivityStatus() === "checking") probe(); }, [probe]);

  const offline = status === "offline";

  // Scheduled retries with backoff while offline.
  useEffect(() => {
    if (!offline || checking) return;
    // attempt 1 was the confirming probe: first retry after 2 s, then 3 s and every 5 s.
    const delay = SERVER_RETRY_DELAYS_MS[Math.min(Math.max(attempt.current - 1, 0), SERVER_RETRY_DELAYS_MS.length - 1)]!;
    const timer = window.setTimeout(probe, delay);
    return () => window.clearTimeout(timer);
  }, [offline, checking, probe]);

  // Immediate probes when the network or the window comes back.
  useEffect(() => {
    if (!offline) return;
    const onVisible = () => { if (document.visibilityState === "visible") probe(); };
    window.addEventListener("online", probe);
    window.addEventListener("focus", probe);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", probe);
      window.removeEventListener("focus", probe);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [offline, probe]);

  // R3-X-1: detect an outage before the next action fails (the banner then disables the pages' actions). A failed
  // ping goes through the same confirmation as any failed request.
  const lastPing = useRef(0);
  useEffect(() => {
    if (status !== "online") return;
    const ping = () => {
      if (document.visibilityState === "hidden" || connectivityStatus() !== "online") return;
      const now = Date.now();
      if (now - lastPing.current < HEARTBEAT_MIN_GAP_MS) return;
      lastPing.current = now;
      void Promise.resolve().then(() => api.health()).catch(() => { if (connectivityStatus() === "online") reportRequestFailure(); });
    };
    const onVisible = () => { if (document.visibilityState === "visible") ping(); };
    const timer = window.setInterval(ping, SERVER_HEARTBEAT_MS);
    window.addEventListener("focus", ping);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", ping);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status]);

  return { offline, checking, retry: probe };
}
