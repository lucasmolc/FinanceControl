import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { errorMessage, isConnectivityError } from "../api/client";
import { connectivitySettled } from "../api/connectivity";
import { motionAllowed } from "../lib/preferences";
import { getPreferences } from "../lib/preferencesStore";
import { TOAST_LIMIT, TRANSIENT_NETWORK_MESSAGE, ToastContext, toastDuration, type ToastAction, type ToastApi, type ToastOptions, type ToastTone } from "./toastContext";

/** Exit animation length (ms); 0 when motion is off. */
const EXIT_MS = 200;

export interface ToastItem { id: number; message: string; tone: ToastTone; action?: ToastAction; duration: number; leaving?: boolean; }

const icons = { success: CheckCircle2, error: AlertCircle, info: Info } as const;

/**
 * One compact notification: icon, message, optional action, close button and a thin progress bar.
 * Auto-dismisses after `duration`, pausing while hovered or focused. Errors are `role="alert"` (assertive);
 * success/info are announced by the polite region.
 */
export function Toast({ item, onDismiss, onAction }: { item: ToastItem; onDismiss: (id: number) => void; onAction?: (item: ToastItem) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const remaining = useRef(item.duration);

  useEffect(() => {
    if (paused || item.leaving) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onDismiss(item.id), Math.max(0, remaining.current));
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused, item.id, item.leaving, onDismiss]);

  const Icon = icons[item.tone];
  const style = { "--toast-duration": `${item.duration}ms` } as CSSProperties;
  return <div className={`toast ${item.tone}${item.leaving ? " is-leaving" : ""}${paused ? " is-paused" : ""}`} style={style} role={item.tone === "error" ? "alert" : undefined}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <span className="toast-icon" aria-hidden="true"><Icon size={18} /></span>
    <div className="toast-body">
      <p>{item.message}</p>
      {item.action && <div className="toast-actions">
        <button type="button" className="btn small ghost" onClick={() => onAction?.(item)}>{item.action.label}</button>
      </div>}
    </div>
    <button type="button" className="icon-btn" aria-label="Fechar notificação" onClick={() => onDismiss(item.id)}><X size={16} aria-hidden="true" /></button>
    <span className="toast-progress" aria-hidden="true"><span style={{ animationPlayState: paused ? "paused" : "running" }} /></span>
  </div>;
}

/** Stack of toasts (bottom-right on desktop, top on mobile — positioned by CSS). */
function ToastRegion({ items, onDismiss, onAction }: { items: ToastItem[]; onDismiss: (id: number) => void; onAction: (item: ToastItem) => void }) {
  return <div className="toast-region" aria-live="polite" aria-relevant="additions text" aria-label="Notificações">
    {items.map(item => <Toast key={item.id} item={item} onDismiss={onDismiss} onAction={onAction} />)}
  </div>;
}

/** Provides `useToast()` (MEL-28) and renders the toast region after its children. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const remove = useCallback((id: number) => {
    timers.current.delete(id);
    setItems(current => current.filter(item => item.id !== id));
  }, []);

  const dismiss = useCallback((id: number) => {
    if (timers.current.has(id)) return;
    if (!motionAllowed(getPreferences())) { remove(id); return; }
    setItems(current => current.map(item => (item.id === id ? { ...item, leaving: true } : item)));
    timers.current.set(id, window.setTimeout(() => remove(id), EXIT_MS));
  }, [remove]);

  const show = useCallback((id: number, options: ToastOptions) => {
    const tone = options.tone ?? "info";
    const item: ToastItem = { id, message: options.message, tone, action: options.action, duration: toastDuration({ ...options, tone }) };
    setItems(current => [...current.filter(existing => !existing.leaving), item].slice(-TOAST_LIMIT));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    nextId.current += 1;
    const id = nextId.current;
    // R3 decision 1 (R3-X-1 / R3-SH-1): a failure to reach the local server is announced ONLY by the global offline
    // banner (with its "Tentar agora"). The toast waits for the health probe: server down → no toast; server up (a
    // one-off network blip) → a short plain-language toast so the failed action is not silent.
    if (isConnectivityError(options.message)) {
      void connectivitySettled().then(status => {
        if (status === "online") show(id, { ...options, message: TRANSIENT_NETWORK_MESSAGE });
      });
      return id;
    }
    show(id, options);
    return id;
  }, [show]);

  const runAction = useCallback((item: ToastItem) => {
    const action = item.action;
    dismiss(item.id);
    if (!action) return;
    void Promise.resolve().then(action.run).catch(reason => { toast({ message: errorMessage(reason), tone: "error" }); });
  }, [dismiss, toast]);

  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(timer => window.clearTimeout(timer)); pending.clear(); };
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return <ToastContext.Provider value={api}>
    {children}
    <ToastRegion items={items} onDismiss={dismiss} onAction={runAction} />
  </ToastContext.Provider>;
}
