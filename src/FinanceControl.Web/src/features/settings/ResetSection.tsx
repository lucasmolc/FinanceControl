import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { Dialog } from "../../components/Dialog";
import { Field } from "../../components/ui";
import { Checkbox } from "../../components/ui/Checkbox";
import type { FinanceState, Notify } from "../../types";
import { OFFLINE_REASON } from "../records/offline";
import { MobileCollapse } from "./MobileCollapse";
import { RESET_CONFIRMATION, resetInventory } from "./resetModel";

export interface ResetSectionProps {
  state: FinanceState;
  refresh: () => Promise<void>;
  notify: Notify;
  onError: (reason: unknown) => void;
  offline?: boolean;
}

/**
 * Zerar a conta: apaga todos os dados financeiros e devolve o app ao primeiro acesso. Sem volta pela interface, então
 * a confirmação é longa de propósito — lista o que será apagado, exige uma marcação e o texto exato. O login continua
 * e uma cópia do banco é gravada automaticamente antes de apagar.
 */
export function ResetSection({ state, refresh, notify, onError, offline = false }: ResetSectionProps) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inventory = resetInventory(state);
  const ready = acknowledged && typed.trim() === RESET_CONFIRMATION;

  const close = () => {
    setOpen(false);
    setAcknowledged(false);
    setTyped("");
    setError(null);
  };

  async function reset() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.resetAccount({ confirmation: RESET_CONFIRMATION });
      // O estado volta sem setup concluído, então o app reabre o primeiro acesso sozinho.
      await refresh();
      close();
      notify(`Conta zerada. Uma cópia do banco anterior ficou em ${result.safety_copy.split(/[\\/]/).pop()}.`);
    } catch (reason) {
      setError(errorMessage(reason, "Não foi possível zerar a conta."));
      onError(reason);
    } finally {
      setBusy(false);
    }
  }

  const disabledReason = offline ? OFFLINE_REASON : undefined;

  return <section className="card settings-reset" aria-labelledby="reset-title">
    <div className="card-header"><div>
      <h2 id="reset-title" tabIndex={-1}>Zerar a conta</h2>
      <p className="muted">Apaga todos os dados financeiros e recomeça do zero, como no primeiro acesso.</p>
    </div></div>
    <MobileCollapse section="zerar" summary="Apagar todos os dados e recomeçar" open={open}>
      <div className="stack">
        <p className="local-data-note reset-warning" role="note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            Não há como desfazer pela interface. Antes de apagar, o app grava uma cópia do banco na pasta <code>backups</code>,
            ao lado do banco de dados — é por ela que dá para voltar atrás. Seu usuário e sua senha continuam os mesmos.
          </span>
        </p>
        <div>
          <button type="button" className="btn danger" disabled={busy || offline} title={disabledReason} onClick={() => setOpen(true)}>
            <Trash2 size={16} aria-hidden="true" />Zerar a conta
          </button>
        </div>
      </div>
    </MobileCollapse>

    {open && <Dialog title="Zerar a conta" role="alertdialog" onClose={close} busy={busy}
      footer={<>
        <button type="button" className="btn ghost" disabled={busy} onClick={close}>Cancelar</button>
        <button type="button" className="btn danger" disabled={busy || !ready} onClick={() => void reset()}>
          {busy ? "Apagando…" : "Apagar tudo e recomeçar"}
        </button>
      </>}>
      <div className="stack">
        <p>Isto apaga <b>todos os dados financeiros desta conta</b> e devolve o app ao primeiro acesso, com o setup inicial em branco.</p>
        {inventory.length > 0 && <>
          <p className="muted">Será apagado agora:</p>
          <ul className="list reset-inventory">{inventory.map(item => <li key={item}>{item}</li>)}</ul>
        </>}
        <p className="muted">Também somem fechamentos de meses, pagamentos de fatura, extratos, cotações salvas e o plano 70-20-10.</p>
        <p className="muted">Continuam: seu usuário e sua senha, e a cópia do banco gravada automaticamente antes de apagar.</p>

        <Checkbox checked={acknowledged} onChange={setAcknowledged}
          label="Entendi que todos os dados serão apagados e que não há como desfazer por aqui." />
        <Field label={`Para confirmar, digite ${RESET_CONFIRMATION}`} error={error ?? undefined}>
          <input type="text" autoComplete="off" spellCheck={false} value={typed} placeholder={RESET_CONFIRMATION}
            aria-label={`Digite ${RESET_CONFIRMATION} para confirmar`} onChange={event => { setTyped(event.target.value); setError(null); }} />
        </Field>
      </div>
    </Dialog>}
  </section>;
}
