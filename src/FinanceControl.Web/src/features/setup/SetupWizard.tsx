import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Plus, SlidersHorizontal } from "lucide-react";
import { api, ApiError, errorMessage } from "../../api/client";
import { Dialog } from "../../components/Dialog";
import { Logo } from "../../components/Logo";
import { Field, Money, MoneyInput } from "../../components/ui";
import { Alert } from "../../components/ui/Alert";
import { Checkbox } from "../../components/ui/Checkbox";
import { Stepper } from "../../components/ui/Stepper";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { usePreferences } from "../../hooks/usePreferences";
import { formatMoneyInput } from "../../lib/money";
import type { Settings } from "../../types";
import { PlanApplySummary, PlanExplanation, PlanTable } from "../plan/PlanSuggestion";
import { DEFAULT_PLAN, draftFromPlan, limitChangeText, mapPlanApiFields, planApplyPreview, planCommand, planFigures, planFromSettings, planName, readPlanDraft, withPlanWidget, type PlanDraft, type PlanErrors } from "../plan/planModel";
import { limitAdvice, mapApiFields, optionalMoney, planningPayload, validatePlanning, type PlanningDraft, type PlanningErrors } from "../settings/settingsModel";

export interface SetupWizardProps {
  revisiting?: boolean;
  initialSettings?: Settings;
  /** `"record"`: the person chose "Registrar primeiro lançamento" in "Tudo pronto" (open the form, skip the tour). */
  onDone: (next?: "record") => void;
  onSkip: () => void;
  /** Kept for compatibility; errors are shown inside the dialog (single channel). */
  onError?: (message: string) => void;
}

/** CR-27: the name joins the planning step; step 2 is the MEL-45 "Plano sugerido". */
const STEPS = [
  { id: "planejamento", label: "Seu mês", description: "Nome, renda e teto" },
  { id: "plano", label: "Plano sugerido", description: "Regra 70-20-10" },
];

interface DoneSummary { planApplied: boolean; limitCents: number; buckets: boolean; }

export function SetupWizard({ revisiting = false, initialSettings, onDone, onSkip }: SetupWizardProps) {
  const formId = useId();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<PlanningErrors>({});
  const [draft, setDraft] = useState<PlanningDraft>(() => ({
    name: initialSettings?.display_name ?? "",
    income: initialSettings?.monthly_net_income_cents ? formatMoneyInput(initialSettings.monthly_net_income_cents) : "",
    limit: initialSettings?.monthly_spending_limit_cents ? formatMoneyInput(initialSettings.monthly_spending_limit_cents) : "",
    months: String(initialSettings?.emergency_months_target ?? DEFAULT_PLAN.emergencyMonths),
  }));
  const savedPlan = initialSettings ? planFromSettings(initialSettings) : null;
  const [plan, setPlan] = useState<PlanDraft>(() => draftFromPlan(savedPlan ?? { ...DEFAULT_PLAN, emergencyMonths: initialSettings?.emergency_months_target || DEFAULT_PLAN.emergencyMonths, freedomMultiplier: initialSettings?.freedom_multiplier || DEFAULT_PLAN.freedomMultiplier }));
  const [planErrors, setPlanErrors] = useState<PlanErrors>({});
  const [adjusting, setAdjusting] = useState(false);
  // R4-SET-1: on the first run the bucket categories start checked, so the first entry already counts in the plan.
  // Revisiting from Configurações keeps it off (the person already has categories and can set their buckets there).
  const [createBuckets, setCreateBucketsState] = useState(!revisiting);
  const bucketsTouched = useRef(false);
  const setCreateBuckets = (next: boolean) => { bucketsTouched.current = true; setCreateBucketsState(next); };
  // R4-SET-1: revisiting with no expense category yet (e.g. setup skipped, empty data), the buckets start checked too.
  useEffect(() => {
    if (!revisiting) return;
    let active = true;
    try {
      void api.state()
        .then(state => {
          if (active && !bucketsTouched.current && !state.categories.some(category => category.active && category.kind === "expense")) setCreateBucketsState(true);
        })
        .catch(() => undefined);
    } catch { /* older test doubles without api.state */ }
    return () => { active = false; };
  }, [revisiting]);
  const [done, setDone] = useState<DoneSummary | null>(null);
  const { preferences, update: updatePreferences } = usePreferences();
  const advice = limitAdvice(draft);
  const salary = optionalMoney(draft.income);
  const planRead = readPlanDraft(plan);
  const figures = salary && salary > 0 && planRead.values ? planFigures(salary, planRead.values) : null;
  const edited = JSON.stringify(plan) !== JSON.stringify(draftFromPlan(savedPlan ?? DEFAULT_PLAN));
  const fmt = useMoneyFormat();
  // Decision 2: the teto before → after (before = what step 1 has) and what happens to the linked goals.
  const preview = figures ? planApplyPreview({
    monthly_spending_limit_cents: optionalMoney(draft.limit) ?? 0,
    emergency_goal_status: initialSettings?.emergency_goal_status, emergency_goal_id: initialSettings?.emergency_goal_id, emergency_goal_auto: initialSettings?.emergency_goal_auto,
    freedom_goal_status: initialSettings?.freedom_goal_status, freedom_goal_id: initialSettings?.freedom_goal_id, freedom_goal_auto: initialSettings?.freedom_goal_auto,
  }, figures) : null;
  const draftName = planRead.values ? planName(planRead.values) : null;
  // R2-SET-3: the heading follows the draft even while its sum is invalid ("Seu plano 75-20-10" after typing 75).
  const typedName = [plan.fixed, plan.fun, plan.invest].every(value => /^\d{1,3}$/.test(value.trim())) ? `${plan.fixed.trim()}-${plan.fun.trim()}-${plan.invest.trim()}` : null;
  const headingName = draftName ?? typedName;
  const formRef = useRef<HTMLFormElement>(null);
  const firstStepRender = useRef(true);

  // Move focus to the first field of the new step (the dialog itself focuses the first one on open).
  useEffect(() => {
    if (firstStepRender.current) { firstStepRender.current = false; return; }
    const target = formRef.current?.querySelector<HTMLElement>("[data-step-focus]") ?? formRef.current?.querySelector<HTMLElement>("input, select, textarea");
    target?.focus();
  }, [step]);
  // "Ajustar" opens the rule inputs: focus the first one.
  useEffect(() => {
    if (adjusting) formRef.current?.querySelector<HTMLElement>(".plan-table input")?.focus();
  }, [adjusting]);

  const update = (key: keyof PlanningDraft, value: string) => {
    setDraft(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
  };
  const updatePlan = (key: keyof PlanDraft, value: string) => {
    setPlan(current => ({ ...current, [key]: value }));
    setPlanErrors({});
  };

  /** Saves the month planning and, when `applyPlan`, the 70-20-10 plan (POST /api/plan after the salary is saved). */
  async function finish(applyPlan: boolean) {
    const planning = { ...draft, months: plan.months };
    const nextErrors = validatePlanning(planning);
    if (nextErrors.name || nextErrors.income || nextErrors.limit) { setErrors(nextErrors); setStep(0); return; }
    if (nextErrors.months) { setPlanErrors({ months: nextErrors.months }); setAdjusting(true); return; }
    const values = applyPlan ? planRead.values : null;
    if (applyPlan && !values) { setPlanErrors(planRead.errors); setAdjusting(true); return; }
    if (applyPlan && !(salary && salary > 0)) { setErrors({ income: "Informe o salário líquido para aplicar o plano." }); setStep(0); return; }
    setBusy(true);
    setMessage(null);
    try {
      const payload = planningPayload(planning);
      if (revisiting) await api.settings(payload);
      else await api.setup({ ...payload, bills: [], goals: [], card: null });
      if (values) {
        await api.plan(planCommand(values, createBuckets));
        // Show the plan on the dashboard (explicit choice of the person; saved like any preference).
        updatePreferences({ dashboard_widgets: withPlanWidget(preferences.dashboard_widgets) }).catch(() => undefined);
      }
      if (revisiting) { onDone(); return; }
      setDone({ planApplied: Boolean(values), limitCents: values && salary ? planFigures(salary, values).limitCents : payload.monthly_spending_limit_cents, buckets: Boolean(values) && createBuckets });
    } catch (reason) {
      const fields = reason instanceof ApiError ? reason.fields : {};
      const planningFields = mapApiFields(fields);
      const planFields = mapPlanApiFields(fields);
      if (planningFields.months && !planFields.months) planFields.months = planningFields.months;
      const stepOne: PlanningErrors = { ...planningFields };
      delete stepOne.months;
      if (Object.keys(stepOne).length) { setErrors(stepOne); setStep(0); }
      else if (Object.keys(planFields).length) { setPlanErrors(planFields); setAdjusting(true); }
      else setMessage(errorMessage(reason, "Não foi possível salvar o planejamento."));
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (revisiting) { onSkip(); return; }
    setBusy(true);
    setMessage(null);
    try { await api.skipSetup(); onSkip(); }
    catch (reason) { setMessage(errorMessage(reason, "Não foi possível pular a configuração inicial.")); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (step === 0) {
      const found = validatePlanning({ ...draft, months: plan.months });
      const stepErrors: PlanningErrors = { name: found.name, income: found.income, limit: found.limit };
      if (stepErrors.name || stepErrors.income || stepErrors.limit) { setErrors(stepErrors); return; }
      setStep(1);
      return;
    }
    void finish(Boolean(salary && salary > 0));
  }

  if (done) {
    return <Dialog title="Tudo pronto" onClose={() => onDone()} hideClose footer={<div className="row wizard-actions">
      <button type="button" className="btn ghost" onClick={() => onDone()}>Ir para o painel<ArrowRight size={16} aria-hidden="true" /></button>
      <button type="button" className="btn primary" data-autofocus onClick={() => onDone("record")}><Plus size={16} aria-hidden="true" />Registrar primeiro lançamento</button>
    </div>}>
      <div className="setup-done" role="status">
        <span className="setup-done-icon" aria-hidden="true"><CheckCircle2 size={24} /></span>
        <div className="stack">
          <p>{done.planApplied ? "Seu plano 70-20-10 está ativo." : "Seu planejamento foi salvo."}</p>
          <ul className="setup-done-list">
            {done.limitCents > 0 && <li>Teto de gastos do mês: <Money cents={done.limitCents} />{done.planApplied ? " (fixos + lazer)" : ""}.</li>}
            {done.planApplied && <li>As metas <b>Reserva de emergência</b> e <b>Número da liberdade</b> estão em Metas, vinculadas ao salário.</li>}
            {done.buckets && <li>As categorias Gastos fixos, Lazer e Investimentos estão prontas para usar.</li>}
            {done.planApplied && <li>O painel mostra o realizado de cada balde no widget “Plano 70-20-10”.</li>}
          </ul>
          <p className="muted"><b>Próximo passo:</b> registre o primeiro lançamento do mês. A partir dele o painel acompanha {done.planApplied ? "o plano" : "o seu mês"} de verdade.</p>
        </div>
      </div>
    </Dialog>;
  }

  const hasSalary = Boolean(salary && salary > 0);
  const footer = step === 0
    ? <div className="row wizard-actions">
      <button type="button" className="btn ghost" disabled={busy} onClick={() => void skip()}>{revisiting ? "Cancelar" : "Explorar sem configurar"}</button>
      <button type="submit" form={formId} className="btn primary" disabled={busy}>Continuar</button>
    </div>
    // R2-SET-1: one grid, two arrangements — desktop "Pular · teto · Voltar · Aplicar"; phones stack the teto line, the
    // primary at full width, then Voltar and Pular side by side as text buttons (about half the old footer height).
    : <div className={`wizard-actions wizard-plan-actions${hasSalary ? "" : " no-apply"}`}>
      <button type="button" className="btn ghost wizard-skip" disabled={busy} onClick={() => void finish(false)}>{hasSalary ? "Pular plano" : "Concluir sem plano"}</button>
      {preview && <span className="wizard-footer-note">{limitChangeText(preview.limitBeforeCents, preview.limitAfterCents, fmt)}</span>}
      <button type="button" className="btn wizard-back" disabled={busy} onClick={() => setStep(0)}>Voltar</button>
      {hasSalary && <button type="submit" form={formId} className="btn primary wizard-apply" disabled={busy}>{busy ? "Salvando…" : "Aplicar plano"}</button>}
    </div>;

  // R2-SET-5: the first screen carries the full brand lockup (mark + wordmark); decorative, the heading stays the name.
  const title = revisiting ? "Revise seu planejamento" : <span className="setup-title"><span className="setup-lockup" aria-hidden="true"><Logo size={28} /></span><span>Comece do seu jeito</span></span>;
  return <Dialog title={title} size={step === 1 ? "lg" : "md"} onClose={revisiting ? onSkip : () => undefined} hideClose={!revisiting} busy={busy} footer={footer}>
    <p className="muted">{step === 0
      ? "Duas etapas rápidas e opcionais. Nada é criado até você confirmar no fim."
      : "Um ponto de partida que você pode ajustar agora ou depois em Configurações. Logo abaixo da tabela está o que muda ao aplicar."}</p>
    <Stepper className="setup-stepper" aria-label="Etapas da configuração" steps={STEPS} current={step} onStepClick={busy ? undefined : index => setStep(index)} />
    <p className="sr-only" aria-live="polite">Etapa {step + 1} de {STEPS.length}: {STEPS[step]!.label}</p>
    {message && <Alert tone="danger">{message}</Alert>}
    <form ref={formRef} id={formId} className="stack" noValidate onSubmit={submit}>
      {step === 0 && <>
        <Field label="Nome" optional hint="Quando preenchido, aparece apenas na saudação do painel." error={errors.name}>
          <input autoComplete="name" maxLength={120} placeholder="Como você prefere ser chamado" value={draft.name} onChange={event => update("name", event.target.value)} />
        </Field>
        <div className="form-grid">
          <Field label="Renda líquida mensal" optional hint="Com ela, a próxima etapa calcula o plano sugerido." error={errors.income}>
            <MoneyInput value={draft.income} onChange={text => update("income", text)} />
          </Field>
          <Field label="Teto de gastos do mês" optional hint="O plano da próxima etapa pode definir o teto por você (fixos + lazer)." error={errors.limit}>
            <MoneyInput value={draft.limit} onChange={text => update("limit", text)} />
          </Field>
        </div>
        {advice && <Alert tone="warning" size="sm" role="none">{advice} Um teto acima da renda significa gastar mais do que entra.</Alert>}
      </>}
      {step === 1 && <section className="plan-suggestion" aria-labelledby={`${formId}-plan-title`}>
        <div className="plan-suggestion-head">
          <h3 id={`${formId}-plan-title`} tabIndex={-1} data-step-focus>{edited ? (headingName ? `Seu plano ${headingName}` : "Seu plano") : `Um ponto de partida: a regra ${headingName ?? "70-20-10"}`}</h3>
          {hasSalary && <button type="button" className="btn small ghost" aria-pressed={adjusting} onClick={() => setAdjusting(value => !value)}>
            <SlidersHorizontal size={14} aria-hidden="true" />{adjusting ? "Concluir ajuste" : "Ajustar"}
          </button>}
        </div>
        <PlanExplanation salaryCents={salary} draft={plan}
          summary={hasSalary ? preview ? <PlanApplySummary preview={preview} buckets={createBuckets} /> : <p className="plan-apply-note muted">Corrija os valores destacados para ver o que muda ao aplicar.</p> : undefined}>
          {hasSalary
            ? <PlanTable salaryCents={salary} draft={plan} editing={adjusting} errors={planErrors} onChange={updatePlan} caption={`Plano ${draftName ?? ""} calculado com o seu salário`} />
            : <Alert tone="info" size="sm" role="none">Sem o salário líquido não dá para calcular o plano. Volte e informe a renda, ou conclua sem plano: você pode aplicá-lo depois em Configurações.</Alert>}
        </PlanExplanation>
        {hasSalary && <Checkbox label="Criar as categorias-balde Gastos fixos, Lazer e Investimentos" description="Só as que ainda não existem. Categorias que você já tem podem receber um balde em Categorias."
          checked={createBuckets} onChange={setCreateBuckets} />}
      </section>}
    </form>
  </Dialog>;
}
