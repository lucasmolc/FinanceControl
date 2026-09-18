/**
 * R1 decision 4: connectivity with the local server, shared by the whole app.
 * `api/client.ts` reports every request: any HTTP answer → "online"; a network failure (or a dev-proxy gateway error)
 * → "checking". The App shell (`useServerStatus`) then probes `/api/health` once: an answer brings it back online, a
 * failure turns it "offline" — one global banner, retries with backoff, refetch on recovery. A single failed request
 * therefore never shows the banner by itself when the server is actually up.
 */
export type Connectivity = "online" | "checking" | "offline";
type Listener = (status: Connectivity) => void;

let status: Connectivity = "online";
const listeners = new Set<Listener>();

/** Gateway answers mean the local API behind the dev proxy is down (Vite answers 502/503/504 for ECONNREFUSED). */
export const isGatewayFailure = (code: number): boolean => code === 502 || code === 503 || code === 504;

function set(next: Connectivity): void {
  if (next === status) return;
  status = next;
  listeners.forEach(listener => listener(next));
}

/** A request got an HTTP answer. */
export function reportRequestSuccess(): void { set("online"); }

/** A request could not reach the server: confirm with a health probe (stays "offline" if it already is). */
export function reportRequestFailure(): void { if (status === "online") set("checking"); }

/** The health probe failed: the server is down. */
export function markServerOffline(): void { set("offline"); }

export const connectivityStatus = (): Connectivity => status;

/** False only once a failure was confirmed by the health probe. */
export const serverReachable = (): boolean => status !== "offline";

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Tests: back to the initial (online) state without notifying. */
export function resetConnectivity(): void {
  status = "online";
}

/**
 * R3 decision 1: resolves with the connectivity once it is not "checking" any more (right away when it already is
 * "online" or "offline"). Used to decide whether a failed request's toast is needed: "offline" → the banner speaks.
 */
export function connectivitySettled(): Promise<Connectivity> {
  if (status !== "checking") return Promise.resolve(status);
  return new Promise(resolve => {
    const stop = subscribeConnectivity(next => {
      if (next === "checking") return;
      stop();
      resolve(next);
    });
  });
}
