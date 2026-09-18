// Linked salary goal status (MEL-43 reserve, MEL-45 "Número da liberdade"): one block per goal, no repeated amounts (CR-22).
import { ArrowRight } from "lucide-react";
import { Badge, Money } from "../../components/ui";
import { Switch } from "../../components/ui/Switch";
import { formatProgress } from "../../lib/progress";
import type { EmergencyGoalStatus, Goal, PageId } from "../../types";

export interface LinkedGoalProps {
  /** "meta de reserva" / "meta Número da liberdade" (used in texts). */
  noun: string;
  status: EmergencyGoalStatus;
  goal?: Goal;
  /** False without salary (nothing can be created; `missing` explains). */
  canCreate: boolean;
  missing: string;
  auto: boolean;
  busy: boolean;
  onCreate: () => void;
  onAuto: (on: boolean) => void;
  switchLabel: string;
  autoDescription: string;
  navigate?: (page: PageId) => void;
  /** R1 decision 3: automatic progress (freedom number = invested wealth) instead of the goal's saved amount. */
  progress?: { label: string; currentCents: number; targetCents: number; pct: number };
  /** Reason the actions are disabled (e.g. offline). */
  disabledReason?: string;
}

export function LinkedGoalBadge({ status }: { status: EmergencyGoalStatus }) {
  if (status === "linked") return <Badge tone="positive">Vinculada</Badge>;
  if (status === "removed") return <Badge tone="warning">Removida</Badge>;
  return null;
}

/** Goal progress + state action (Criar novamente / Criar) + the automatic target switch. */
export function LinkedGoalStatus({ noun, status, goal, canCreate, missing, auto, busy, onCreate, onAuto, switchLabel, autoDescription, navigate, progress, disabledReason }: LinkedGoalProps) {
  const blocked = busy || Boolean(disabledReason);
  return <div className="stack linked-goal">
    {status === "linked" && goal && <p className="reserve-status">
      {progress
        ? <span>Meta <b>{goal.name}</b> · {progress.label}: <Money cents={progress.currentCents} /> de <Money cents={progress.targetCents} /> ({formatProgress(progress.currentCents, progress.targetCents)}). Atualiza sozinho com os seus investimentos.</span>
        : <span>Meta <b>{goal.name}</b>: <Money cents={goal.current_cents} currency={goal.currency} /> guardados de <Money cents={goal.target_cents} currency={goal.currency} />.</span>}
      {navigate && <button type="button" className="btn small ghost widget-link" onClick={() => navigate("goals")}>Ver em Metas<ArrowRight size={14} aria-hidden="true" /></button>}
    </p>}
    {status === "removed" && <div className="reserve-status" role="note">
      <span>A {noun} foi removida e não é recriada sozinha. Crie de novo quando quiser.</span>
      <button type="button" className="btn small primary" disabled={blocked || !canCreate} title={disabledReason} onClick={onCreate}>Criar novamente</button>
    </div>}
    {(status === "none" || (status === "linked" && !goal)) && <div className="reserve-status">
      <span>{canCreate ? auto ? "A meta é criada ao salvar o planejamento, ou agora mesmo:" : `Nenhuma ${noun} vinculada.` : missing}</span>
      {canCreate && <button type="button" className="btn small" disabled={blocked} title={disabledReason} onClick={onCreate}>Criar {noun}</button>}
    </div>}
    <ul className="pref-list">
      <li className="pref-row">
        <span className="pref-text"><b>Calcular automaticamente</b><small className="muted">{autoDescription}</small></span>
        <Switch aria-label={switchLabel} checked={auto} disabled={blocked} onChange={onAuto} />
      </li>
    </ul>
  </div>;
}
