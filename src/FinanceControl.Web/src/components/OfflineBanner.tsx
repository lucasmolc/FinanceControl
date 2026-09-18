import { RefreshCw, WifiOff } from "lucide-react";

/**
 * R1 decision 4 / R1-SH-3: the one global offline state, at the top of the content (under the topbar). Persistent while
 * the local server does not answer; the app retries on its own (backoff, `online`, focus) and refetches the page when it
 * is back. Markup: `.offline-banner[role=status] > svg + .offline-banner-text(b + span) + button.btn.small`.
 */
export function OfflineBanner({ checking, onRetry }: { checking: boolean; onRetry: () => void }) {
  return <div className="offline-banner" role="status">
    <WifiOff size={18} aria-hidden="true" />
    <p className="offline-banner-text">
      <b>Sem conexão com o servidor local.</b>{" "}
      <span>Os valores na tela podem estar desatualizados e salvar fica pausado. Tentamos reconectar sozinhos — se você fechou o LMM Finance Control, abra-o de novo.</span>
    </p>
    <button type="button" className="btn small" onClick={onRetry} disabled={checking} aria-busy={checking || undefined}>
      <RefreshCw size={14} aria-hidden="true" className={checking ? "is-spinning" : undefined} />{checking ? "Verificando…" : "Tentar agora"}
    </button>
  </div>;
}
