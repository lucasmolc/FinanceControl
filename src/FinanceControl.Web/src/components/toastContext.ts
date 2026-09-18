import { createContext } from "react";

// Toast notifications (MEL-28): types + context. Components live in Toast.tsx; the hook in hooks/useToast.ts.

export type ToastTone = "success" | "error" | "info";

export interface ToastAction { label: string; run: () => void | Promise<void>; }

export interface ToastOptions {
  message: string;
  /** Default "info". */
  tone?: ToastTone;
  /** One action button (e.g. "Desfazer"); running it dismisses the toast. */
  action?: ToastAction;
  /** Auto-dismiss delay in ms. Defaults: success/info 4 500, with an action 7 000, error 8 000. */
  duration?: number;
}

export interface ToastApi {
  /** Shows a toast and returns its id. At most 3 stay visible (the oldest is dropped). */
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

export const TOAST_LIMIT = 3;

/** A request did not reach the server but the health probe answered: a blip, not an outage (R3 decision 1). */
export const TRANSIENT_NETWORK_MESSAGE = "A conexão com o servidor local falhou por um instante. Tente de novo.";

/** Default auto-dismiss delay for a toast (spec §6 "Toasts"). */
export function toastDuration(options: Pick<ToastOptions, "tone" | "action" | "duration">): number {
  if (typeof options.duration === "number" && options.duration > 0) return options.duration;
  if (options.tone === "error") return 8000;
  return options.action ? 7000 : 4500;
}

export const ToastContext = createContext<ToastApi | null>(null);
