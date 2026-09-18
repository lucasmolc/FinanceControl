import { useId, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, CircleDashed, Flag, Mountain, RefreshCw, RotateCcw, Scale, ShieldCheck } from "lucide-react";
import { isConnectivityError } from "../../api/client";
import { AreaChart, seriesColor } from "../../components/charts";
import { Badge, EmptyState, Field, Money, MoneyInput, Skeleton } from "../../components/ui";
import { Alert } from "../../components/ui/Alert";
import { Segmented } from "../../components/ui/Segmented";
import { Slider } from "../../components/ui/Slider";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { formatDate } from "../../lib/date";
import { formatMoneyInput, parseMoney } from "../../lib/money";
import { formatProgress } from "../../lib/progress";
import { goalMilestones, HORIZONS, projectionBand, projectionTotals, projectMonths, reachTarget, type ExpenseBasis, type GoalMilestone, type IncomeBasis } from "../../lib/projection";
import { durationText, freedomTargetCents, linkedGoalIds, longReach, longReachInvested, monthYear, planPreset, planRuleOf } from "../../lib/projectionPlan";
import { FREEDOM_PROGRESS_LABEL } from "../plan/planModel";
import { useReconnect } from "../plan/useReconnect";
import type { PageProps } from "../../types";
import { shortMonthLabel } from "../reports/reportsModel";
import { basisTitles, expenseBasisLabels, expenseText, formFromBase, incomeBasisLabels, incomeText, scenarioFromForm, type ScenarioForm } from "./projectionForm";
import { projectionChartData } from "./projectionModel";
import { useProjectionData } from "./useProjectionData";

const BAND_DELTA = 20;

const milestoneBadge: Record<GoalMilestone["status"], { tone: "positive" | "warning" | "neutral" | "accent"; label: string }> = {
  done: { tone: "positive", label: "Concluída" },
  on_time: { tone: "accent", label: "No prazo" },
  late: { tone: "warning", label: "Depois do prazo" },
  beyond: { tone: "neutral", label: "Fora do horizonte" },
};

/**
 * R2-PRJ-1: the date and its distance are two parts, so phones can put the distance on a second, muted line under the
 * date instead of one unbreakable "≈ 06/2029 (2 anos e 9 meses)" that squeezed the text column to 12 px.
 */
function When({ main, sub }: { main: string; sub?: string }) {
  return <>{main}{sub && <> <small className="milestone-when-sub">({sub})</small></>}</>;
}

/** R1-PRJ-3: one format for "not within the chart horizon": the estimate (searched up to 50 years) or "Além de 50 anos". */
function beyondText(reach: { status: string; month: string | null; index: number | null }): ReactNode {
  if (reach.status === "reached" && reach.month && reach.index) return <When main={`≈ ${monthYear(reach.month)}`} sub={durationText(reach.index)} />;
  return "Além de 50 anos";
}

/** R3-PRJ-2: every dated milestone reads "≈ 09/2027 (1 ano)", inside or beyond the chart horizon. */
function reachedWhen(month: string, index: number | null): ReactNode {
  return <When main={`≈ ${monthYear(month)}`} sub={index ? durationText(index) : undefined} />;
}

/** Reached inside the chart horizon. */
const horizonReached = (index: number | null, horizon: number): boolean => index !== null && index > 0 && index <= horizon;

function BasisPicker<T extends string>({ label, labels, value, onPick }: { label: string; labels: Record<T, string>; value: T | "custom"; onPick: (basis: T) => void }) {
  return <Segmented size="sm" fullWidth className="basis-picker" aria-label={`${label}: usar como referência`} value={value}
    onChange={key => onPick(key as T)}
    options={(Object.keys(labels) as T[]).map(key => ({ value: key, label: <span title={basisTitles[key]}>{labels[key]}</span> }))} />;
}

function Kpis({ items }: { items: { label: string; value: ReactNode; hint?: string; tone?: "positive" | "negative" | "warning" }[] }) {
  return <dl className="stat-strip" aria-label="Resultado da projeção">
    {items.map(item => <div className="stat" key={item.label}>
      <dt className="stat-label">{item.label}</dt>
      <dd className={`stat-value${item.tone ? ` ${item.tone}` : ""}`}>{item.value}</dd>
      {item.hint && <dd className="stat-hint">{item.hint}</dd>}
    </div>)}
  </dl>;
}

function Milestone({ reached, icon, title, badge, detail, when }: { reached: boolean; icon: ReactNode; title: ReactNode; badge?: ReactNode; detail: ReactNode; when: ReactNode }) {
  return <li className={`milestone${reached ? " is-reached" : ""}`}>
    <span className="milestone-icon" aria-hidden="true">{icon}</span>
    <div><b>{title}</b>{badge && <> {badge}</>}<br /><small className="muted">{detail}</small></div>
    <span className="milestone-when">{when}</span>
  </li>;
}

export function ProjectionsPage({ version, state, offline = false }: PageProps) {
  const money = useMoneyFormat();
  const tableId = useId();
  const { base, history, loading, error, reload } = useProjectionData(version);
  const [horizon, setHorizon] = useState<number>(12);
  const [form, setForm] = useState<ScenarioForm | null>(null);
  const [formFor, setFormFor] = useState<typeof base>(null);
  const [usingPlan, setUsingPlan] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  useReconnect(offline, reload);

  // (Re)initialize the scenario when a new base arrives (render-time state sync, no effect).
  if (base && base !== formFor) {
    setFormFor(base);
    if (!form) setForm(formFromBase(base));
  }

  if (!base || !form) {
    // Decision 1: a connectivity failure has no page retry (the global banner has "Tentar agora").
    if (error && (offline || isConnectivityError(error))) return <EmptyState icon={RefreshCw} title="Projeções abre quando o servidor voltar." description="Sem dados enquanto o servidor estiver fora. A página recarrega sozinha assim que ele responder." />;
    if (error) return <EmptyState icon={RefreshCw} title="Não foi possível carregar a projeção" description={error} actionLabel="Tentar novamente" onAction={reload} />;
    return <Skeleton label="Carregando projeção…" lines={6} />;
  }

  const edit = (patch: Partial<ScenarioForm>) => { setForm(current => (current ? { ...current, ...patch } : current)); setUsingPlan(false); };
  const { scenario, errors } = scenarioFromForm(base, form, horizon);
  const rows = projectMonths(scenario);
  const band = projectionBand(scenario, BAND_DELTA);
  const startTotal = scenario.startingBankCents + scenario.startingInvestmentsCents;
  const totals = projectionTotals(rows, startTotal);
  const surplus = scenario.monthlyIncomeCents - scenario.monthlyExpenseCents;
  const chart = projectionChartData(history, base.as_of.slice(0, 7), startTotal, rows, band);
  const indicatorsMissing = base.indicators.cdi_pct === null && base.indicators.selic_pct === null;

  // CR-04: one reserve milestone. The linked goal (MEL-43) replaces the figure derived from the settings.
  const settings = state.settings;
  const linked = linkedGoalIds(settings);
  const freedomGoalId = settings.freedom_goal_id ?? null;
  const milestones = goalMilestones(base.goals.filter(goal => goal.id !== freedomGoalId), rows, startTotal);
  const reserveGoal = milestones.find(item => item.id === settings.emergency_goal_id);
  const goalRows = milestones.filter(item => !linked.has(item.id));
  // Cumulative amount each goal needs (goals are funded one at a time, in deadline order) for the long estimate.
  const goalNeeds = new Map<number, number>();
  milestones.reduce((sum, item) => { const next = sum + item.remainingCents; goalNeeds.set(item.id, next); return next; }, 0);
  const reserveTarget = base.emergency.reserve_target_cents;
  const reserve = reachTarget(rows, startTotal, reserveTarget);
  // Estimates beyond the horizon: the same scenario searched up to 50 years (goals in deadline order, like goalMilestones).
  const estimate = (remainingCents: number) => longReach(scenario, startTotal, startTotal + remainingCents);
  const bandVisible = band.upper.some((value, index) => value - (band.lower[index] ?? value) > 0);

  // MEL-45: plan preset and the freedom milestone (searched up to 50 years).
  const preset = planPreset(base);
  const rule = planRuleOf(base);
  const showFreedom = Boolean(base.plan) || freedomGoalId !== null;
  const freedomTarget = showFreedom ? freedomTargetCents(base) : 0;
  // Decision 3: the freedom number is measured on the invested wealth (progress and milestone).
  const invested = typeof base.freedom_progress_cents === "number" ? base.freedom_progress_cents : scenario.startingInvestmentsCents;
  const freedom = freedomTarget > 0 ? longReachInvested(scenario, freedomTarget) : null;
  // Decision 3: one progress rule for goals and limits (lib/progress).
  const freedomPct = formatProgress(invested, freedomTarget);
  // R3-PRJ-1: with a plan active, the aporte is measured against the plan's minimum invested.
  const planMinimum = base.plan && base.income.planned_monthly_cents > 0 ? Math.round((base.income.planned_monthly_cents * rule.investPct) / 100) : 0;
  const contributionAverage = base.investment_contribution_avg_3m_cents;
  const typedContribution = parseMoney(form.contribution);
  const contributionBasis = typedContribution === contributionAverage ? "avg_3m" : typedContribution === planMinimum ? "plan" : "custom";
  const belowPlan = planMinimum > 0 && !errors.contribution && scenario.monthlyContributionCents < planMinimum;
  const setContribution = (cents: number) => edit({ contribution: formatMoneyInput(cents) });
  const applyPlan = () => {
    if (!preset) return;
    setForm(current => current && { ...current, income: formatMoneyInput(preset.incomeCents), expense: formatMoneyInput(preset.expenseCents), contribution: formatMoneyInput(preset.contributionCents), incomeBasis: "custom", expenseBasis: "custom" });
    setUsingPlan(true);
  };
  const resultLabel = `Patrimônio em ${horizon} meses`;

  return <div className="stack projections-page">
    <div className="toolbar">
      <Segmented aria-label="Horizonte da projeção" value={String(horizon)} onChange={value => setHorizon(Number(value))}
        options={HORIZONS.map(months => ({ value: String(months), label: `${months} meses` }))} />
      {loading && <span className="muted" role="status">Atualizando…</span>}
    </div>

    <section className="card scenario-panel" aria-labelledby="scenario-title">
      {/* CR-24: on phones the result stays pinned at the top of the scenario while the fields scroll. */}
      <div className="scenario-result-bar" aria-hidden="true">
        <span>{resultLabel}</span><strong><Money cents={totals.finalTotalCents} /></strong><small>hoje <Money cents={startTotal} /></small>
      </div>
      <div className="card-header">
        <div><h2 id="scenario-title" className="section-title">Cenário</h2><p className="muted">Patrimônio de hoje ({formatDate(base.as_of)}) projetado mês a mês, em reais. Mude os valores e veja o resultado na hora.</p></div>
        <div className="scenario-actions">
          {preset && <button type="button" className="btn small" aria-pressed={usingPlan} onClick={applyPlan}><Scale size={15} aria-hidden="true" />Plano {rule.fixedPct}-{rule.funPct}-{rule.investPct}</button>}
          <button type="button" className="btn small ghost" onClick={() => { setForm(formFromBase(base)); setUsingPlan(false); }}><RotateCcw size={15} aria-hidden="true" />Restaurar cenário</button>
        </div>
      </div>
      {usingPlan && preset && <p className="scenario-preset-note" role="status">
        <b>Plano {rule.fixedPct}-{rule.funPct}-{rule.investPct}:</b> renda = salário; gastos = {base.expenses.avg_3m_cents > 0 ? "média dos últimos 3 meses" : `teto de gastos do mês (fixos + lazer, ${rule.fixedPct + rule.funPct}%)`}; aporte = {rule.investPct}% do salário{preset.contributionCents > Math.round((preset.incomeCents * rule.investPct) / 100) ? " + o que sobra abaixo do teto de gastos do mês" : ""}.
      </p>}
      <div className="scenario-grid">
        <div className="scenario-field">
          <Field label="Renda mensal" error={errors.income} hint="Valor líquido que entra por mês.">
            <MoneyInput value={form.income} onChange={text => edit({ income: text, incomeBasis: "custom" })} />
          </Field>
          <BasisPicker<IncomeBasis> label="Base da renda" labels={incomeBasisLabels} value={form.incomeBasis} onPick={basis => edit({ incomeBasis: basis, income: incomeText(base, basis) })} />
        </div>
        <div className="scenario-field">
          <Field label="Gastos mensais" error={errors.expense} hint="Despesas do mês, sem contar aportes.">
            <MoneyInput value={form.expense} onChange={text => edit({ expense: text, expenseBasis: "custom" })} />
          </Field>
          <BasisPicker<ExpenseBasis> label="Base dos gastos" labels={expenseBasisLabels} value={form.expenseBasis} onPick={basis => edit({ expenseBasis: basis, expense: expenseText(base, basis) })} />
        </div>
        <div className="scenario-field">
          <Field label="Aporte mensal em investimentos" error={errors.contribution} hint={planMinimum > 0
            ? `Média dos últimos 3 meses: ${money(contributionAverage)}. Mínimo do plano (${rule.investPct}% do salário): ${money(planMinimum)}.`
            : `Média dos últimos 3 meses: ${money(contributionAverage)}.`}>
            <MoneyInput value={form.contribution} onChange={text => edit({ contribution: text })} />
          </Field>
          {planMinimum > 0 && <Segmented size="sm" fullWidth className="basis-picker" aria-label="Base do aporte: usar como referência" value={contributionBasis}
            onChange={key => setContribution(key === "plan" ? planMinimum : contributionAverage)}
            options={[{ value: "avg_3m", label: "Média 3 meses" }, { value: "plan", label: `Plano (${rule.investPct}%)` }]} />}
        </div>
        <div className="field range-field">
          <label htmlFor="scenario-return">Rentabilidade dos investimentos</label>
          <Slider id="scenario-return" min={0} max={150} step={5} value={form.returnPct} onChange={value => edit({ returnPct: value })} format={value => `${value}% do CDI`} />
          <output htmlFor="scenario-return">{form.returnPct}% do CDI</output>
        </div>
        <Field label="CDI (% a.a.)" error={errors.cdi} hint={base.indicators.cdi_pct !== null ? `Banco Central: ${String(base.indicators.cdi_pct).replace(".", ",")}%` : "Sem cotação salva: valor de referência."}>
          <input type="text" inputMode="decimal" autoComplete="off" value={form.cdi} onChange={event => edit({ cdi: event.target.value })} />
        </Field>
        <Field label="Inflação IPCA (% a.a.)" error={errors.ipca} hint={base.indicators.ipca_12m_pct !== null ? `IPCA 12 meses: ${String(base.indicators.ipca_12m_pct).replace(".", ",")}%` : "Sem cotação salva: valor de referência."}>
          <input type="text" inputMode="decimal" autoComplete="off" value={form.ipca} onChange={event => edit({ ipca: event.target.value })} />
        </Field>
      </div>
      {indicatorsMissing && <p className="field-hint">Atualize as cotações na aba Mercado para usar o CDI e o IPCA mais recentes.</p>}
    </section>

    <div className="stack projection-results">
      <Kpis items={[
        { label: resultLabel, value: <Money cents={totals.finalTotalCents} />, hint: `Hoje: ${money(startTotal)}` },
        { label: "Em dinheiro de hoje", value: <Money cents={totals.finalRealCents} />, hint: `Descontando IPCA de ${String(scenario.inflationAnnualPct).replace(".", ",")}% a.a.` },
        { label: "Rendimentos no período", value: <Money cents={totals.yieldCents} />, hint: `${scenario.returnPctOfCdi}% do CDI` },
        { label: "Sobra antes dos aportes", value: <Money cents={surplus} signed />, hint: scenario.monthlyContributionCents > 0 ? `Renda − gastos, por mês. Dela saem os ${money(scenario.monthlyContributionCents)} de aporte.` : "Renda − gastos, por mês.", tone: surplus < 0 ? "negative" : undefined },
      ]} />
      {surplus < 0 && <Alert tone="warning" size="sm" role="none">Os gastos superam a renda: o saldo em conta cai {money(-surplus)} por mês neste cenário.</Alert>}
      {belowPlan && <Alert tone="info" size="sm" role="none">
        {surplus > scenario.monthlyContributionCents
          ? <>{money(surplus - scenario.monthlyContributionCents)} por mês ficam em conta; o plano pede ao menos {money(planMinimum)} investidos.</>
          : <>O aporte de {money(scenario.monthlyContributionCents)} fica abaixo do mínimo do plano: {money(planMinimum)} por mês.</>}{" "}
        <button type="button" className="btn small ghost" onClick={() => setContribution(planMinimum)}>Usar o mínimo do plano</button>
      </Alert>}
      {surplus >= 0 && scenario.monthlyContributionCents > surplus && <Alert tone="info" size="sm" role="none">O aporte de {money(scenario.monthlyContributionCents)} é maior que a sobra de {money(surplus)}: a diferença sai do saldo em conta todo mês.</Alert>}

      <section className="card" aria-labelledby="projection-chart-title">
        <div className="card-header"><div>
          <h2 id="projection-chart-title" className="section-title">Patrimônio projetado</h2>
          {/* R2-PRJ-3: "histórico" only when there is a past line to see (a snapshot before today). */}
          <p className="muted">{chart.projectFrom >= 1 ? "Linha contínua: histórico. Tracejada: projeção." : "Linha tracejada: projeção a partir de hoje."}{bandVisible ? ` Faixa: rentabilidade entre ${Math.max(0, scenario.returnPctOfCdi - BAND_DELTA)}% e ${scenario.returnPctOfCdi + BAND_DELTA}% do CDI.` : ""}</p>
        </div></div>
        <AreaChart title="Patrimônio projetado" xLabel="Mês" labels={chart.labels} tooltipLabels={chart.tooltipLabels} height={260}
          series={[
            { id: "nominal", label: "Patrimônio (nominal)", values: chart.nominal, fill: true, projectFrom: chart.projectFrom, color: seriesColor("net_worth") },
            { id: "real", label: "Em dinheiro de hoje", values: chart.real, dashed: true, color: seriesColor("projection_real") },
          ]}
          band={bandVisible ? { label: `Faixa ±${BAND_DELTA}% do CDI`, lower: chart.lower, upper: chart.upper } : undefined}
          references={reserveTarget > 0 && !reserveGoal ? [{ label: "Reserva de emergência", value: reserveTarget, color: "var(--gold, var(--warning))" }] : []}
          highlightIndex={chart.projectFrom} zeroBaseline={false} />
      </section>

      <section className="card" aria-labelledby="milestones-title">
        <h2 id="milestones-title" className="section-title">Marcos</h2>
        <ul className="milestone-list">
          {reserveGoal
            ? <Milestone reached={reserveGoal.status === "done" || reserveGoal.status === "on_time"} icon={reserveGoal.status === "beyond" ? <CircleDashed size={18} /> : <ShieldCheck size={18} />}
              title="Reserva de emergência" badge={<Badge tone={milestoneBadge[reserveGoal.status].tone}>{milestoneBadge[reserveGoal.status].label}</Badge>}
              detail={<>Critério: completar a meta vinculada “{reserveGoal.name}”{reserveGoal.remainingCents ? ` (faltam ${money(reserveGoal.remainingCents)})` : ""}.</>}
              when={reserveGoal.month ? reachedWhen(reserveGoal.month, reserveGoal.index) : reserveGoal.status === "done" ? "Concluída" : beyondText(estimate(goalNeeds.get(reserveGoal.id) ?? reserveGoal.remainingCents))} />
            : <Milestone reached={reserve.status !== "beyond" && reserveTarget > 0} icon={reserve.status === "beyond" ? <CircleDashed size={18} /> : <ShieldCheck size={18} />}
              title="Reserva de emergência" badge={reserveTarget > 0 && reserve.status === "beyond" ? <Badge tone="neutral">Fora do horizonte</Badge> : undefined}
              detail={reserveTarget > 0 ? `Critério: patrimônio total de ${money(reserveTarget)} (${base.emergency.months_target} meses de renda)${reserve.status === "beyond" ? `; faltam ${money(Math.max(0, reserveTarget - startTotal))}` : ""}.` : "Informe a renda em Configurações para calcular a reserva."}
              when={reserveTarget > 0 ? reserve.status === "beyond" ? beyondText(longReach(scenario, startTotal, reserveTarget)) : reserve.status === "already" ? "Já atingida" : reserve.month ? reachedWhen(reserve.month, reserve.index) : "—" : "—"} />}
          {freedom && <Milestone reached={freedom.status === "already"} icon={freedom.status === "beyond" ? <CircleDashed size={18} /> : <Mountain size={18} />}
            title="Número da liberdade" badge={freedom.status === "already" ? <Badge tone="positive">Atingido</Badge> : horizonReached(freedom.index, horizon) ? <Badge tone="accent">No horizonte</Badge> : <Badge tone="neutral">Fora do horizonte</Badge>}
            detail={<>Critério: {FREEDOM_PROGRESS_LABEL.toLowerCase()} de {money(freedomTarget)} ({rule.freedomMultiplier} salários). {FREEDOM_PROGRESS_LABEL} hoje: <Money cents={invested} /> ({freedomPct}); faltam {money(Math.max(0, freedomTarget - invested))}.</>}
            when={freedom.status === "already" ? "Já atingido" : horizonReached(freedom.index, horizon) && freedom.month ? reachedWhen(freedom.month, freedom.index) : beyondText(freedom)} />}
          {goalRows.map(item => {
            const badge = milestoneBadge[item.status];
            return <Milestone key={item.id} reached={item.status === "done" || item.status === "on_time"} icon={item.status === "beyond" ? <CircleDashed size={18} /> : item.status === "done" ? <CheckCircle2 size={18} /> : <Flag size={18} />}
              title={item.name} badge={<Badge tone={badge.tone}>{badge.label}</Badge>}
              detail={`${item.remainingCents ? `Faltam ${money(item.remainingCents)}` : "Valor alvo alcançado"}${item.targetDate ? ` · prazo ${formatDate(item.targetDate)}` : ""}`}
              when={item.month ? reachedWhen(item.month, item.index) : item.status === "done" ? "Concluída" : beyondText(estimate(goalNeeds.get(item.id) ?? item.remainingCents))} />;
          })}
        </ul>
        <p className="muted milestones-note"><b>Como as metas são calculadas:</b> o crescimento do patrimônio (sobra do mês mais rendimentos) completa uma meta de cada vez, na ordem dos prazos; metas sem prazo vêm por último. Aportes feitos direto em uma meta já contam no valor guardado e antecipam a data.</p>
      </section>

      <section className="card projection-table-card" aria-labelledby="projection-table-title">
        <div className="card-header">
          <div><h2 id="projection-table-title" className="section-title">Mês a mês</h2><p className="muted">Renda, gastos, aporte e rendimento de cada um dos {rows.length} meses.</p></div>
          <button type="button" className="btn small ghost" aria-expanded={tableOpen} aria-controls={tableId} onClick={() => setTableOpen(value => !value)}>
            <ChevronDown size={15} aria-hidden="true" className={tableOpen ? "is-open" : undefined} />{tableOpen ? "Ocultar tabela" : "Mostrar tabela"}
          </button>
        </div>
        <div id={tableId} className="table-wrap" hidden={!tableOpen}>
          {tableOpen && <table className="data-table projection-table">
            <thead><tr><th scope="col">Mês</th><th scope="col" className="num">Renda</th><th scope="col" className="num">Gastos</th><th scope="col" className="num">Aporte</th><th scope="col" className="num">Rendimento</th><th scope="col" className="num">Patrimônio</th><th scope="col" className="num">Em dinheiro de hoje</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.month}>
              <th scope="row" data-label="Mês">{shortMonthLabel(row.month)}</th>
              <td className="num" data-label="Renda"><Money cents={row.incomeCents} /></td>
              <td className="num" data-label="Gastos"><Money cents={row.expenseCents} /></td>
              <td className="num" data-label="Aporte"><Money cents={row.contributionCents} /></td>
              <td className="num" data-label="Rendimento"><Money cents={row.yieldCents} /></td>
              <td className="num" data-label="Patrimônio"><Money cents={row.totalCents} tone={row.totalCents < 0 ? "negative" : "neutral"} /></td>
              <td className="num" data-label="Em dinheiro de hoje"><Money cents={row.realTotalCents} /></td>
            </tr>)}</tbody>
          </table>}
        </div>
      </section>
      <p className="muted projection-disclaimer">Projeção simplificada: renda, gastos e aportes constantes; rendimento composto mensalmente só sobre os investimentos. Não é recomendação de investimento.</p>
    </div>
  </div>;
}
