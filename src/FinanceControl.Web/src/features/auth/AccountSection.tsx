import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { useSession } from "./sessionContext";

/** Configurações › Conta: who is signed in and "Sair". Hidden outside the auth gate. */
export function AccountSection({ onError }: { onError: (reason: unknown) => void }) {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  if (!session) return null;

  const logout = async () => {
    setBusy(true);
    try {
      await session.logout();
    } catch (reason) {
      onError(reason);
      setBusy(false);
    }
  };

  return <section className="card settings-account" aria-labelledby="account-title">
    <div className="card-header">
      <div>
        <h2 id="account-title" tabIndex={-1}>Conta</h2>
        <p className="muted">Você entrou como <strong>{session.user.username}</strong>. Cada usuário vê apenas os próprios dados; ao sair, este dispositivo volta para a tela de login.</p>
      </div>
    </div>
    <Button icon={LogOut} loading={busy} onClick={() => void logout()}>Sair</Button>
  </section>;
}
