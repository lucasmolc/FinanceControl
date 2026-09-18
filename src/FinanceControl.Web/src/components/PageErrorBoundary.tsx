import { Component, type ErrorInfo, type ReactNode } from "react";
import { api } from "../api/client";
import { serverReachable, subscribeConnectivity } from "../api/connectivity";

interface PageErrorBoundaryProps {
  /** Page name for the message ("Lançamentos"). */
  label: string;
  children: ReactNode;
}

/** checking: asking /api/health · server: the local server is down · app: the server answers, the page itself failed. */
type Cause = "checking" | "server" | "app";

interface PageErrorBoundaryState { failed: boolean; cause: Cause }

const reload = () => window.location.reload();

/**
 * Keeps a page failure (typically a lazy chunk that could not be fetched after an update, or offline) inside the content
 * area: the sidebar, the dock and the other pages keep working. Remount it with `key={page}` so leaving the page resets it.
 * R1-X-2: the message names one cause — it asks `/api/health` first. Server down → the global offline banner speaks
 * (R2-X-1: the page only says "<página> abre quando o servidor voltar.") and the page reloads by itself as soon as the
 * server answers again; server up → the app was updated, "Recarregar a página".
 */
export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { failed: false, cause: "checking" };
  private unsubscribe: (() => void) | null = null;
  private mounted = false;

  static getDerivedStateFromError(): Partial<PageErrorBoundaryState> {
    return { failed: true, cause: serverReachable() ? "checking" : "server" };
  }

  componentDidMount(): void { this.mounted = true; }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Falha ao exibir a página.", error, info.componentStack);
    void api.health().then(
      () => { if (this.mounted) this.setState({ cause: "app" }); },
      () => { if (this.mounted) this.setState({ cause: "server" }); },
    );
    // A lazy chunk that failed stays failed in React.lazy: when the server is back, reload to fetch it again.
    this.unsubscribe ??= subscribeConnectivity(status => { if (status === "online" && this.state.cause === "server") reload(); });
  }

  componentWillUnmount(): void {
    this.mounted = false;
    this.unsubscribe?.();
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const { cause } = this.state;
    // R2-X-1: the global offline banner already names the cause and offers "Tentar agora"; the page only says what
    // happens next (no second retry button, no repeated explanation).
    if (cause === "server") return <div className="page-error empty-state" role="status">
      <p><b>{this.props.label} abre quando o servidor voltar.</b></p>
      <p className="muted">A página recarrega sozinha; seus dados não foram afetados.</p>
    </div>;
    return <div className="page-error empty-state" role="alert">
      <p><b>Não foi possível abrir {this.props.label}.</b></p>
      <p className="muted">{cause === "checking" ? "Verificando a conexão com o servidor local…" : "O servidor está respondendo, mas esta página não carregou — em geral porque o app foi atualizado desde que a janela foi aberta. Recarregue para usar a versão nova; seus dados não foram afetados."}</p>
      <button type="button" className="btn primary" onClick={reload}>Recarregar a página</button>
    </div>;
  }
}
