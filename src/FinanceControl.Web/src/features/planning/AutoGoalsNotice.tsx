import { useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { Badge, Money } from "../../components/ui";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import type { Notify, Settings } from "../../types";
import { OFFLINE_REASON } from "../records/offline";
import { removedAutoGoals, type AutoGoal } from "./autoGoals";

export interface AutoGoalsNoticeProps {
  settings: Settings;
  refresh: () => Promise<void>;
  notify: Notify;
  onError: (reason: unknown) => void;
  offline?: boolean;
}

/** Aviso na tela de Metas: as metas automáticas removidas, com a opção de criar de novo já vinculadas. */
export function AutoGoalsNotice({ settings, refresh, notify, onError, offline = false }: AutoGoalsNoticeProps) {
  const format = useMoneyFormat();
  const [busy, setBusy] = useState<string | null>(null);
  const goals = removedAutoGoals(settings);
  if (goals.length === 0) return null;

  async function create(goal: AutoGoal) {
    setBusy(goal.id);
    try {
      await goal.create();
      await refresh();
      notify(`${goal.name} criada novamente com o cálculo automático.`);
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy(null);
    }
  }

  return <section className="card auto-goals-notice" aria-labelledby="auto-goals-title">
    <div className="card-header"><div>
      <h2 id="auto-goals-title"><Sparkles size={16} aria-hidden="true" /> Metas do planejamento removidas</h2>
      <p className="muted">Estas metas acompanham o seu planejamento sozinhas. Elas não voltam automaticamente — recrie quando quiser.</p>
    </div></div>
    <ul className="list auto-goals-list">
      {goals.map(goal => <li key={goal.id} className="auto-goal-row">
        <span className="auto-goal-text">
          <b>{goal.name}</b> <Badge tone="warning">Removida</Badge>
          <small className="muted">
            {goal.canCreate
              ? <>Alvo de <Money cents={goal.targetCents} /> ({goal.formula}), atualizado sozinho quando o planejamento mudar.</>
              : goal.missing}
          </small>
        </span>
        <button type="button" className="btn small primary" disabled={busy !== null || offline || !goal.canCreate}
          title={offline ? OFFLINE_REASON : goal.canCreate ? undefined : goal.missing}
          aria-label={`Criar novamente ${goal.name} (${format(goal.targetCents)})`}
          onClick={() => void create(goal)}>
          <RotateCcw size={14} aria-hidden="true" />{busy === goal.id ? "Criando…" : "Criar novamente"}
        </button>
      </li>)}
    </ul>
  </section>;
}
