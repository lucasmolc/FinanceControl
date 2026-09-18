import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, errorMessage } from "../../api/client";
import { auth, type SessionUser } from "../../api/auth";
import { subscribeUnauthorized } from "../../api/session";
import { LogoMark } from "../../components/Logo";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { LoginPage } from "./LoginPage";
import { SessionContext, type Session } from "./sessionContext";

type GateState = { status: "loading" } | { status: "anonymous" } | { status: "unreachable"; message: string } | { status: "signed-in"; user: SessionUser };

/** Full reload: nothing from the previous user (page state, module caches) survives into the next session. */
const reloadApp = () => window.location.reload();

/**
 * Shows the app only with a session. A 401 from any request (expired or revoked session) or a logout reloads the page,
 * which lands on the login screen.
 */
export function AuthGate({ children, onSessionEnded = reloadApp }: { children: ReactNode; onSessionEnded?: () => void }) {
  const [state, setState] = useState<GateState>({ status: "loading" });

  const check = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "signed-in", user: await auth.me() });
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) setState({ status: "anonymous" });
      else setState({ status: "unreachable", message: errorMessage(reason) });
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  const signedIn = state.status === "signed-in";
  useEffect(() => signedIn ? subscribeUnauthorized(onSessionEnded) : undefined, [signedIn, onSessionEnded]);

  const session = useMemo<Session | null>(() => state.status !== "signed-in" ? null : {
    user: state.user,
    logout: async () => {
      await auth.logout();
      onSessionEnded();
    },
  }, [state, onSessionEnded]);

  if (session) return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
  if (state.status === "anonymous") return <LoginPage onSignedIn={user => setState({ status: "signed-in", user })} />;
  if (state.status === "unreachable") return <main className="auth-screen">
    <section className="card auth-card" aria-labelledby="auth-offline-title">
      <h1 id="auth-offline-title">Servidor indisponível</h1>
      <Alert tone="warning">{state.message}</Alert>
      <Button variant="primary" onClick={() => void check()}>Tentar novamente</Button>
    </section>
  </main>;
  return <main className="auth-screen" aria-busy="true" aria-label="Verificando a sessão"><LogoMark size={40} /></main>;
}
