// Configurações › Plano 70-20-10 (MEL-45): view, edit or remove the plan; the linked "Número da liberdade" goal.
// R1: the apply button shows the teto before → after (decision 2); the saved plan is a one-line summary (R1-CFG-6).
import { useState } from "react";
import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { OFFLINE_REASON } from "../../api/insights";
import { useConfirm } from "../../components/useConfirm";
import { Badge, Money } from "../../components/ui";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { usePreferences } from "../../hooks/usePreferences";
import type { FinanceState, Notify, PageId } from "../../types";
import { PlanApplySummary, PlanExplanation, PlanTable } from "../plan/PlanSuggestion";
import {
  DEFAULT_PLAN, draftFromPlan, FREEDOM_PROGRESS_LABEL, freedomProgress, limitChangeText, mapPlanApiFields, planApplyPreview, planCommand, planFigures, planFromSettings, planName, readPlanDraft,
  type PlanDraft, type PlanErrors, type PlanValues, withPlanWidget,
} from "../plan/planModel";
import { LinkedGoalBadge, LinkedGoalStatus } from "./LinkedGoal";

interface PlanSectionProps {
  state: FinanceState;
  refresh: () => Promise<void>;
  notify: Notify;
  onError: (reason: unknown) => void;
  navigate?: (page: PageId) => void;
  /** R1 decision 4: the local server is unreachable (actions disabled). */
  offline?: boolean;
  /** R3-CFG-1: incremented by "Editar plano" next to the Teto field (opens the editor). */
  editRequest?: number;
}

export function PlanSection({ state, refresh, notify, onError, navigate, offline = false, editRequest = 0 }: PlanSectionProps) {
  const confirm = useConfirm();
  const fmt = useMoneyFormat();
  const { preferences, update: updatePreferences } = usePreferences();
  const { settings } = state;
  const saved = planFromSettings(settings);
  const salary = settings.monthly_net_income_cents > 0 ? settings.monthly_net_income_cents : null;
  const start = (): PlanDraft => draftFromPlan(saved ?? { ...DEFAULT_PLAN, emergencyMonths: settings.emergency_months_target || DEFAULT_PLAN.emergencyMonths, freedomMultiplier: settings.freedom_multiplier || DEFAULT_PLAN.freedomMultiplier });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PlanDraft>(start);
  const [errors, setErrors] = useState<PlanErrors>({});
  const [busy, setBusy] = useState(false);
  const [seenEditRequest, setSeenEditRequest] = useState(editRequest);
  const freedomStatus = settings.freedom_goal_status ?? (settings.freedom_goal_id ? "linked" : "none");
  const freedomGoal = settings.freedom_goal_id ? state.goals.find(goal => goal.id === settings.freedom_goal_id) : undefined;
  const progress = freedomProgress(settings, freedomGoal);
  const disabledReason = offline ? OFFLINE_REASON : undefined;
  const blocked = busy || offline;
  const read = readPlanDraft(draft);
  const preview = salary && read.values ? planApplyPreview(settings, planFigures(salary, read.values)) : null;
  const savedFigures = salary && saved ? planFigures(salary, saved) : null;

  const run = async (action: () => Promise<unknown>, message: string, undo?: { label: string; run: () => Promise<void> }) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      notify(message, undo);
      return true;
    } catch (reason) {
      const fields = reason instanceof ApiError ? mapPlanApiFields(reason.fields) : {};
      if (Object.keys(fields).length) setErrors(fields);
      else onError(reason);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openEditor = () => { setDraft(start()); setErrors({}); setEditing(true); };
  // Render-time sync with the request counter (no effect): a new request opens the editor once.
  if (editRequest !== seenEditRequest) {
    setSeenEditRequest(editRequest);
    if (!editing && !offline) openEditor();
  }
  const save = async () => {
    const { values, errors: found } = readPlanDraft(draft);
    setErrors(found);
    if (!values || !preview) return;
    const previous = saved;
    const previousLimit = settings.monthly_spending_limit_cents;
    // Decision 2: the toast repeats the cap change; "Desfazer" restores the previous plan (or none) and the previous cap.
    const undo = {
      label: "Desfazer",
      run: async () => {
        if (previous) await api.plan(planCommand(previous));
        else await api.clearPlan();
        await api.settings({ monthly_spending_limit_cents: previousLimit });
        await refresh();
      },
    };
    const message = `${previous ? "Plano atualizado" : "Plano aplicado"}. ${limitChangeText(preview.limitBeforeCents, preview.limitAfterCents, fmt)}.`;
    if (!await run(() => api.plan(planCommand(values)), message, undo)) return;
    setEditing(false);
    // First application: show the plan widget on the dashboard (like the setup step does).
    if (!previous) updatePreferences({ dashboard_widgets: withPlanWidget(preferences.dashboard_widgets) }).catch(() => undefined);
  };
  const remove = async (current: PlanValues) => {
    const ok = await confirm({
      title: `Remover o plano ${planName(current)}?`,
      message: "O painel deixa de comparar os gastos com os limites do plano. As metas Reserva de emergência e Número da liberdade continuam em Metas, e o teto de gastos do mês não muda.",
      confirmLabel: "Remover plano", cancelLabel: "Manter plano", tone: "danger",
    });
    if (!ok) return;
    await run(() => api.clearPlan(), "Plano removido. O teto de gastos do mês não mudou.", { label: "Desfazer", run: async () => { await api.plan(planCommand(current)); await refresh(); } });
  };

  const title = saved ? `Plano ${planName(saved)}` : "Plano 70-20-10";

  return <section className="card settings-plan" aria-labelledby="plan-title" aria-busy={busy || undefined}>
    <div className="card-header">
      <div><h2 id="plan-title" tabIndex={-1}>{title}</h2><p className="muted">Divide o salário líquido em limite de gastos fixos, limite de lazer e investimento mínimo. O teto de gastos do mês passa a ser fixos + lazer.</p></div>
      {saved ? <Badge tone="positive">Ativo</Badge> : <Badge>Sem plano</Badge>}
    </div>

    {!salary && !editing
      ? <p className="muted">Informe o salário líquido em Perfil e planejamento para calcular o plano.</p>
      : editing
        ? <div className="stack">
          <PlanExplanation salaryCents={salary} draft={draft}
            summary={preview ? <PlanApplySummary preview={preview} /> : <p className="plan-apply-note muted">Corrija os valores destacados para ver o que muda ao aplicar.</p>}>
            <PlanTable salaryCents={salary} draft={draft} editing errors={errors} caption={`Plano ${read.values ? planName(read.values) : ""} calculado com o seu salário`}
              onChange={(key, value) => { setDraft(current => ({ ...current, [key]: value })); setErrors({}); }} />
          </PlanExplanation>
          <div className="settings-actions">
            <button type="button" className="btn primary" disabled={blocked} title={disabledReason} onClick={() => void save()}>{busy ? "Salvando…" : saved ? "Salvar plano" : "Aplicar plano"}</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => { setEditing(false); setErrors({}); }}>Cancelar</button>
            {offline
              ? <span className="muted settings-offline-note" role="status">{OFFLINE_REASON}</span>
              : preview && <span className="settings-apply-note">{limitChangeText(preview.limitBeforeCents, preview.limitAfterCents, fmt)}</span>}
          </div>
        </div>
        : saved && savedFigures
          ? <div className="stack">
            <dl className="plan-summary-strip" aria-label={`Resumo do plano ${planName(saved)}`}>
              <div><dt>Teto de gastos do mês</dt><dd><Money cents={savedFigures.limitCents} /></dd><dd className="muted">fixos {saved.fixedPct}% + lazer {saved.funPct}%</dd></div>
              <div><dt>Investimento mínimo</dt><dd><Money cents={savedFigures.investCents} /></dd><dd className="muted">{saved.investPct}% do salário</dd></div>
              <div><dt>Número da liberdade</dt><dd><Money cents={savedFigures.freedomCents} /></dd><dd className="muted">{saved.freedomMultiplier} salários</dd></div>
            </dl>
            <details className="plan-details">
              <summary>Ver a tabela do plano</summary>
              <PlanTable salaryCents={salary} draft={draftFromPlan(saved)} editing={false} caption={`Seu plano ${planName(saved)}`} />
            </details>
            <div className="settings-actions">
              <button type="button" className="btn" disabled={blocked} title={disabledReason} onClick={openEditor}><Pencil size={15} aria-hidden="true" />Editar plano</button>
              <button type="button" className="btn danger" disabled={blocked} title={disabledReason} onClick={() => void remove(saved)}><Trash2 size={15} aria-hidden="true" />Remover plano</button>
            </div>
          </div>
          : <div className="stack">
            <p>Um ponto de partida simples: até 70% do salário para gastos fixos, 20% para lazer e ao menos 10% investidos todo mês. Você vê o que muda antes de aplicar.</p>
            <div className="settings-actions"><button type="button" className="btn primary" disabled={blocked} title={disabledReason} onClick={openEditor}><Sparkles size={15} aria-hidden="true" />Ver o plano sugerido</button></div>
          </div>}

    {saved && <div className="settings-subsection" role="group" aria-labelledby="freedom-title">
      <div className="row"><h3 id="freedom-title">Número da liberdade</h3><LinkedGoalBadge status={freedomStatus} /></div>
      <LinkedGoalStatus noun="meta Número da liberdade" status={freedomStatus} goal={freedomGoal} canCreate={salary !== null}
        missing="Informe o salário líquido em Perfil e planejamento para criar a meta." auto={settings.freedom_goal_auto !== false} busy={busy} disabledReason={disabledReason}
        progress={progress ? { label: FREEDOM_PROGRESS_LABEL, ...progress } : undefined}
        onCreate={() => void run(() => api.createFreedomGoal(), "Meta Número da liberdade criada e vinculada ao salário.")}
        onAuto={on => void run(() => api.settings({ freedom_goal_auto: on }), on ? "Cálculo automático do número da liberdade ligado." : "Cálculo automático desligado: o valor-alvo da meta não muda mais com o salário.")}
        switchLabel="Calcular o número da liberdade automaticamente" autoDescription="Quando o salário ou o multiplicador mudam, o valor-alvo da meta acompanha. O progresso é o seu patrimônio investido."
        navigate={navigate} />
    </div>}
  </section>;
}
