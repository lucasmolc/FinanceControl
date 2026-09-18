/**
 * Session loss shared by the whole app: `api/client.ts` reports every 401 and the auth gate shows the login screen.
 * No imports on purpose (client.ts and auth.ts both depend on it).
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** A request was answered 401: the session expired, was ended elsewhere or never existed. */
export function reportUnauthorized(): void {
  listeners.forEach(listener => listener());
}

export function subscribeUnauthorized(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
