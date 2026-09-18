// plano — MEL-45 widget (owned by FE-Insights): the month's realized spend per bucket × the plan's limits.
// R1-PAINEL-2: limits and a minimum, never "teto" (decision 1). R1-PAINEL-4: the invitation to invest only when it is true.
import { ArrowRight, PiggyBank, Scale, Tags } from "lucide-react";
import { Badge, EmptyState, Money } from "../../components/ui";
import { Progress } from "../../components/ui/Progress";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { formatProgress } from "../../lib/progress";
import { currentMonth, formatMonthLabel } from "../../lib/date";
import { formatMoneyInput } from "../../lib/money";
import type { Category, OpenModal, PlanSummary } from "../../types";
import { fixedSurplusCents, planBars, planInvitation, type PlanBar, type PlanBarState } from "../plan/planModel";
import type { ChartWidgetState } from "./ChartWidgets";
import { WidgetFrame } from "./WidgetFrame";

export interface PlanWidgetProps {
  /** `summary.plan` of the selected month (null: no plan on the server; undefined: summary not loaded or older server). */
  plan: PlanSummary | null | undefined;
  /** Settings have a plan (pcts saved). */
  hasPlan: boolean;
  month: string;
  /** The selected month is the current one ("até agora"). */
  current: boolean;
  openModal: OpenModal;
  onPlanSetup: () => void;
  onOpenCategories?: () => void;
  state: ChartWidgetState;
  /** Month-end spending forecast of the current month (Painel "ritmo"): "danger" = above the teto → no invitation. */
  forecastStatus?: "none" | "ok" | "warning" | "danger";
  /** Why "Registrar aporte" is unavailable (closed month, offline). */
  lockedReason?: string;
  /** R2-PAINEL-4: the month is closed — no invitation to invest (its button could only be disabled). */
  closed?: boolean;
  /** Categories: the aporte comes pre-filled with the first active category of the "investimento" bucket. */
  categories?: Category[];
}

const badge: Record<PlanBarState, { tone: "positive" | "warning" | "negative" | "neutral" | "accent"; label: string }> = {
  ok: { tone: "neutral", label: "Dentro do limite" },
  near: { tone: "warning", label: "Perto do limite" },
  over: { tone: "negative", label: "Acima do limite" },
  reached: { tone: "positive", label: "Mínimo atingido" },
  pending: { tone: "neutral", label: "Abaixo do mínimo" },
  empty: { tone: "neutral", label: "Sem limite" },
};

const progressTone = (state: PlanBarState) => (state === "over" ? "danger" : state === "near" ? "warning" : state === "reached" ? "positive" : "accent");

function PlanBarRow({ bar }: { bar: PlanBar }) {
  const fmt = useMoneyFormat();
  const status = badge[bar.state];
  const ceiling = bar.kind === "ceiling";
  // Decision 3 (R3): one progress rule for goals and limits; above the limit the real share stays visible.
  const pctText = bar.realizedCents > bar.limitCents && bar.limitCents > 0 ? `${bar.pct}%` : formatProgress(bar.realizedCents, bar.limitCents);
  const detail = ceiling
    ? bar.state === "over" ? `${fmt(bar.realizedCents - bar.limitCents)} acima do limite` : `Restam ${fmt(Math.max(0, bar.limitCents - bar.realizedCents))} · ${pctText}`
    : bar.state === "reached" ? `${pctText} do mínimo` : `Faltam ${fmt(Math.max(0, bar.limitCents - bar.realizedCents))} · ${pctText}`;
  return <li className={`plan-bar is-${bar.state}`}>
    <div className="plan-bar-head">
      <b>{bar.label}</b>
      {/* R2-PAINEL-4: value on its own line, target quiet below it ("de R$ 7.700,00 (limite)"), like Orçamento */}
      <span className="amount-of plan-bar-amount"><Money cents={bar.realizedCents} />{" "}<small className="muted">de {fmt(bar.limitCents)} ({ceiling ? "limite" : "mínimo"})</small></span>
    </div>
    <Progress label={`${bar.label}: realizado × plano`} value={Math.min(bar.pct, 100)} max={100} tone={progressTone(bar.state)} valueText={`${pctText} do ${ceiling ? "limite" : "mínimo"}`} size="sm" />
    <div className="plan-bar-foot">
      <small className="muted">{detail}</small>
      <Badge tone={status.tone}>{status.label}</Badge>
    </div>
  </li>;
}

export function PlanWidget({ plan, hasPlan, month, current, openModal, onPlanSetup, onOpenCategories, state, forecastStatus, lockedReason, closed = false, categories = [] }: PlanWidgetProps) {
  const fmt = useMoneyFormat();
  if (!hasPlan || plan === null) {
    return <WidgetFrame id="plano" description="Salário dividido em gastos fixos, lazer e investimento." {...state}>
      <EmptyState compact icon={Scale} title="Nenhum plano ativo" description="Divida o salário em até 70% para gastos fixos, 20% para lazer e ao menos 10% investidos, e acompanhe cada parte aqui." actionLabel="Ver o plano sugerido" onAction={onPlanSetup} />
    </WidgetFrame>;
  }
  if (!plan) {
    return <WidgetFrame id="plano" description={`Realizado de ${formatMonthLabel(month)} × plano.`} {...state} loading={state.loading || state.switching}>
      <p className="muted">O resumo do plano ainda não está disponível para este mês.</p>
    </WidgetFrame>;
  }

  const bars = planBars(plan);
  const surplus = fixedSurplusCents(plan);
  const now = currentMonth();
  const invitation = closed ? null : planInvitation(plan, { timing: current || month === now ? "current" : month < now ? "past" : "future", forecastStatus });
  const investCategory = categories.find(category => category.active && category.kind === "investment" && category.bucket === "investimento")
    ?? categories.find(category => category.active && category.kind === "investment");
  const invest = () => openModal("transaction", {
    kind: "investment", amount: formatMoneyInput(surplus), description: "Aporte do plano", payment_method: "transfer",
    ...(investCategory ? { category_id: String(investCategory.id) } : {}),
  });
  return <WidgetFrame id="plano" description={`Realizado de ${formatMonthLabel(month)} × limites do plano.`} {...state}>
    <ul className="stack list plan-bars tour-plan" aria-label="Partes do plano">
      {bars.map(bar => <PlanBarRow key={bar.id} bar={bar} />)}
    </ul>
    {plan.unbucketed_expense_cents > 0 && <p className="plan-note muted" role="note">
      <Tags size={14} aria-hidden="true" />{fmt(plan.unbucketed_expense_cents)} em gastos de categorias sem balde não entram nas barras.{" "}
      {onOpenCategories && <button type="button" className="btn small ghost widget-link" onClick={onOpenCategories}>Escolher baldes em Categorias<ArrowRight size={13} aria-hidden="true" /></button>}
    </p>}
    {invitation && <div className="plan-surplus" role="note">
      <PiggyBank size={18} aria-hidden="true" />
      <p>{invitation === "current"
        ? <>Até agora, os gastos fixos estão <b><Money cents={surplus} /></b> abaixo do limite, e o ritmo do mês cabe no teto de gastos. Que tal investir parte da diferença?</>
        : <>Você gastou <b><Money cents={surplus} /></b> a menos que o limite de gastos fixos. Que tal investir a diferença?</>}</p>
      <button type="button" className="btn small" disabled={Boolean(lockedReason)} title={lockedReason} onClick={invest}>Registrar aporte</button>
      {lockedReason && <small className="muted plan-surplus-lock">{lockedReason}: o aporte não pode ser registrado.</small>}
    </div>}
  </WidgetFrame>;
}
