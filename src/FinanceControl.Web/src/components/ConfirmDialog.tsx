import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from "./confirmContext";
import { Dialog } from "./Dialog";

interface PendingConfirm { options: ConfirmOptions; resolve: (confirmed: boolean) => void; }

export function ConfirmDialog({ options, onResolve }: { options: ConfirmOptions; onResolve: (confirmed: boolean) => void }) {
  const messageId = useId();
  const tone = options.tone ?? "danger";
  return <Dialog
    role="alertdialog"
    title={options.title}
    describedBy={options.message ? messageId : undefined}
    onClose={() => onResolve(false)}
    footer={<>
      <button type="button" className="btn ghost" onClick={() => onResolve(false)}>{options.cancelLabel ?? "Cancelar"}</button>
      <button type="button" className={`btn ${tone === "danger" ? "danger" : "primary"}`} onClick={() => onResolve(true)}>{options.confirmLabel ?? "Confirmar"}</button>
    </>}
  >
    {options.message && <p id={messageId} className="muted">{options.message}</p>}
  </Dialog>;
}

/** Provides `useConfirm()`: one confirmation at a time; a new request cancels the previous one. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>(options => new Promise<boolean>(resolve => {
    pendingRef.current?.resolve(false);
    const next = { options, resolve };
    pendingRef.current = next;
    setPending(next);
  }), []);

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(confirmed);
  }, []);

  useEffect(() => () => { pendingRef.current?.resolve(false); pendingRef.current = null; }, []);

  return <ConfirmContext.Provider value={confirm}>
    {children}
    {pending && <ConfirmDialog key={pending.options.title} options={pending.options} onResolve={settle} />}
  </ConfirmContext.Provider>;
}
