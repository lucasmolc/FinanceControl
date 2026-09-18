import { useState, type ReactNode } from "react";
import { ArrowRight, ChartColumn, Download, Landmark, Plus, Printer, RefreshCw, Tags, TrendingUp } from "lucide-react";
import { api, errorMessage, isConnectivityError } from "../../api/client";
import { insightsApi, OFFLINE_REASON, type ReportsData } from "../../api/insights";
import { AreaChart, BarChart, DonutChart, seriesColor } from "../../components/charts";
import { Badge, EmptyState, Money, Skeleton } from "../../components/ui";
import { CurrencyIcon } from "../../components/ui/CurrencyIcon";
import { MonthPicker } from "../../components/ui/MonthPicker";
import { Segmented } from "../../components/ui/Segmented";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { currencyOf } from "../../lib/currencies";
import { useMediaQuery } from "../dashboard/useMediaQuery";
import { useReconnect } from "../plan/useReconnect";
import { currentMonth, formatMonthLabel } from "../../lib/date";
import { labelFor, paymentMethodLabels } from "../../lib/labels";
import type { Category, PageId, PageProps } from "../../types";
import { planFromSettings, type PlanValues } from "../plan/planModel";
import { activeMonthlyAverage, averageHint, delta, formatPct, periodError, periodLabel, periodPresets, presetPeriod, previousPeriod, shortMonthLabel, type Delta, type Period, type PeriodPreset } from "./reportsModel";
import { bucketStatus, bucketStatusBadge, groupTopExpenses, planDistribution } from "./reportsPlan";
import { RankedBars } from "./RankedBars";
import { useReports } from "./useReports";

/**
 * R1-REL-2: expense-only charts never start on a green (the income colour). Fixed hues of the validated ring, warm first;
 * income charts start on the emerald. "Outras" stays muted (chartMath).
 */
const EXPENSE_RING = ["var(--hue-orange)", "var(--hue-pink)", "var(--hue-violet)", "var(--hue-gold)", "var(--hue-cyan)", "var(--hue-blue)"];
const INCOME_RING = ["var(--hue-emerald)", "var(--hue-cyan)", "var(--hue-blue)", "var(--hue-lime)", "var(--hue-gold)", "var(--hue-violet)"];
const ringColors = <T,>(items: T[], ring: string[]) => items.map((item, index) => ({ ...item, color: ring[index % ring.length] }));

const methodLabel = (method: string) => (method === "auto_debit" && !paymentMethodLabels[method] ? "Débito automático" : labelFor(paymentMethodLabels, method, "Outro"));

function DeltaBadge({ value, upIsGood, points = false }: { value: Delta | null; upIsGood: boolean; points?: boolean }) {
  if (!value || value.direction === "flat") return value ? <span className="kpi-delta flat">Sem variação</span> : null;
  // CR-14: a zero base has no percentage; say so instead of "Subiu".
  if (value.pct === null && !points) return <span className="muted">Sem valor no período anterior</span>;
  const good = (value.direction === "up") === upIsGood;
  const text = value.pct === null ? (value.direction === "up" ? "Subiu" : "Caiu") : formatPct(value.pct, true);
  return <><span className={`kpi-delta ${value.direction} ${good ? "good" : "bad"}`}>{text}</span> <span className="muted">vs período anterior</span></>;
}

/** MEL-45: realized share of the planned salary per bucket × the plan, over the period. */
function PlanDistributionCard({ data, categories, plan, salaryCents, navigate }: { data: ReportsData; categories: Category[]; plan: PlanValues; salaryCents: number; navigate?: (page: PageId, params?: Record<string, string>) => void }) {
  const money = useMoneyFormat();
  const distribution = planDistribution(data.expense_categories, data.totals.investment_cents, categories, plan, salaryCents, data.months.length, data.months);
  const { months, periodMonths } = distribution;
  // R2-REL-2: the basis is the months with recorded income; say so when it is not the whole period.
  const basis = months < periodMonths
    ? `${months} ${months === 1 ? "mês" : "meses"} com renda registrada, de ${periodMonths}`
    : `${months} ${months === 1 ? "mês" : "meses"}`;
  return <ReportCard title={`Plano ${plan.fixedPct}-${plan.funPct}-${plan.investPct} no período`} description={`Realizado de cada parte × plano (salário de ${money(salaryCents)} × ${basis}).`} span>
    {distribution.unbucketedCents > 0 && <div className="plan-report-warning" role="note">
      <Tags size={16} aria-hidden="true" />
      <p><b>{money(distribution.unbucketedCents)} sem balde</b> não entram no plano. Classifique as categorias para comparar de verdade.</p>
      {navigate && <button type="button" className="btn small" onClick={() => navigate("categories", { balde: "sem" })}>Classificar em Categorias<ArrowRight size={14} aria-hidden="true" /></button>}
    </div>}
    <div className="plan-report">
      <BarChart title="Realizado por balde × plano" orientation="horizontal" xLabel="Balde" showValues={false}
        categories={distribution.rows.map(row => ({ id: row.id, label: row.label, detail: row.kind === "ceiling" ? `Limite de ${row.planPct}% do salário` : `Mínimo de ${row.planPct}% do salário` }))}
        series={[
          { id: "realizado", label: "Realizado", values: distribution.rows.map(row => row.realizedCents), color: seriesColor("spent") },
          { id: "plano", label: "Plano", values: distribution.rows.map(row => row.plannedCents), color: seriesColor("pace") },
        ]} />
      <ul className="plan-report-list" aria-label="Distribuição por balde">
        {distribution.rows.map(row => {
          const status = bucketStatusBadge[bucketStatus(row, distribution.unbucketedCents)];
          return <li key={row.id}>
            <span><b>{row.label}</b><small className="muted">{row.realizedPct === null ? "—" : `${formatPct(row.realizedPct)} do salário`} · {row.kind === "ceiling" ? "limite" : "mínimo"} {row.planPct}%</small></span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </li>;
        })}
      </ul>
    </div>
    <p className="muted report-footnote">
      {distribution.outsideCents > 0 && <>Fora do plano: {money(distribution.outsideCents)}. </>}
      Cada gasto conta no balde da sua categoria.
    </p>
  </ReportCard>;
}

/**
 * R2-REL-3: one currency is a sentence, not a one-row table with a total that repeats it. With two or more, a flat
 * table inside the card (no nested card) and the total as a line under it (no TOTAL row to restyle on phones).
 */
function CurrencyExposure({ items }: { items: ReportsData["currency_exposure"] }) {
  const total = items.reduce((sum, item) => sum + item.base_cents, 0);
  if (items.length === 1) {
    const item = items[0]!;
    const info = currencyOf(item.currency);
    return <div className="report-exposure-single">
      <span className="currency-chip"><CurrencyIcon code={info.code} size={20} decorative /><span>{info.code}</span></span>
      <p><b>100% em {info.name.toLocaleLowerCase("pt-BR")}</b> · <Money cents={item.base_cents} />
        {item.currency !== "BRL" && <span className="muted"> (<Money cents={item.native_cents} currency={item.currency} />)</span>}</p>
    </div>;
  }
  return <>
    <div className="table-wrap report-exposure">
      <table className="data-table">
        <thead><tr><th>Moeda</th><th className="num">Valor na moeda</th><th className="num">Em R$</th><th className="num">Participação</th></tr></thead>
        <tbody>{items.map(item => {
          const info = currencyOf(item.currency);
          return <tr key={item.currency}>
            <td data-label="Moeda"><span className="currency-chip"><CurrencyIcon code={info.code} size={18} decorative /><span>{info.code}</span></span> {info.name}</td>
            <td className="num" data-label="Valor na moeda"><Money cents={item.native_cents} currency={item.currency} /></td>
            <td className="num" data-label="Em R$"><Money cents={item.base_cents} /></td>
            <td className="num" data-label="Participação">{formatPct(item.share_pct)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="report-exposure-total"><span className="muted">Total em reais</span> <b><Money cents={total} /></b></p>
  </>;
}

interface KpiItem { label: string; value: ReactNode; delta: ReactNode; hint?: string; tone?: "positive" | "negative" }

function ReportKpis({ items }: { items: KpiItem[] }) {
  return <dl className="stat-strip report-kpis" aria-label="Resumo do período">
    {items.map(item => <div className="stat" key={item.label}>
      <dt className="stat-label">{item.label}</dt>
      <dd className={`stat-value${item.tone ? ` ${item.tone}` : ""}`}>{item.value}</dd>
      {(item.delta || item.hint) && <dd className="stat-hint">{item.delta}{item.delta && item.hint ? " · " : ""}{item.hint}</dd>}
    </div>)}
  </dl>;
}

function ReportCard({ title, description, span = false, children }: { title: string; description?: string; span?: boolean; children: ReactNode }) {
  const id = `report-${title.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")}`;
  return <section className={`card report-card${span ? " span-2" : ""}`} aria-labelledby={id}>
    <div className="card-header"><div><h2 id={id} className="section-title">{title}</h2>{description && <p className="muted">{description}</p>}</div></div>
    {children}
  </section>;
}

function hasData(data: ReportsData): boolean {
  return data.months.some(month => month.income_cents || month.expense_cents || month.investment_cents) || data.net_worth.some(item => item.total_cents);
}

/** R3-REL-3: a single category is one stat line, not a full 100% ring. */
function SingleShare({ label, cents }: { label: string; cents: number }) {
  return <p className="report-single-share"><b>100% de {label}</b> · <Money cents={cents} /></p>;
}

/** R1-REL-4: one net-worth snapshot is a value, not a chart. */
function SingleSnapshot({ item }: { item: ReportsData["net_worth"][number] }) {
  return <div className="report-single-stat">
    <span className="stat-label">Patrimônio em {formatMonthLabel(item.month)}</span>
    <strong><Money cents={item.total_cents} /></strong>
    <small className="muted">Contas <Money cents={item.bank_cents} /> · Investimentos <Money cents={item.investments_cents} /></small>
    <p className="muted">O gráfico aparece a partir da segunda fotografia mensal (feita automaticamente a cada mês).</p>
  </div>;
}

export function ReportsPage({ state, version, openEdit, openModal, notify, notifyError, navigate, offline = false }: PageProps) {
  const money = useMoneyFormat();
  const anchor = currentMonth();
  const [preset, setPreset] = useState<PeriodPreset>("6m");
  const [custom, setCustom] = useState<Period>(() => presetPeriod("6m", anchor));
  const [draft, setDraft] = useState<Period>(custom);
  const [draftError, setDraftError] = useState<string | null>(null);
  const period = presetPeriod(preset, anchor, custom);
  const { data, dataPeriod, previous, loading, error, reload } = useReports(period, version);
  useReconnect(offline, reload);
  // Decision 1: a connectivity failure is announced by the global banner only (no page retry, no error block).
  const disconnected = offline || isConnectivityError(error);
  // R3-REL-1: phones get full-width labels (RankedBars) instead of the SVG label column.
  const narrow = useMediaQuery("(max-width: 560px)");
  // R3-REL-2: the chosen period has not loaded (offline or failed): the numbers on screen are still the previous range.
  const stale = data !== null && dataPeriod !== null && !loading && (dataPeriod.from !== period.from || dataPeriod.to !== period.to);
  const shownPeriod = stale && dataPeriod ? dataPeriod : period;
  // R3-REL-4: nothing to export or print on an empty period.
  const emptyPeriod = data !== null && !stale && !hasData(data);
  const actionReason = offline ? OFFLINE_REASON : emptyPeriod ? "Nada para exportar neste período." : undefined;

  const choosePreset = (next: PeriodPreset) => {
    if (next === "custom" && preset !== "custom") {
      const start = presetPeriod(preset, anchor, custom);
      setCustom(start);
      setDraft(start);
      setDraftError(null);
    }
    setPreset(next);
  };
  const applyCustom = () => {
    const problem = periodError(draft);
    setDraftError(problem);
    if (!problem) setCustom(draft);
  };
  const fail = (message: string) => { if (notifyError) notifyError(new Error(message)); else notify(message); };
  const openExpense = async (id: number, date: string) => {
    try {
      const match = (await api.transactions(date.slice(0, 7))).find(item => item.id === id);
      if (match) openEdit("transaction", match);
      else fail("Este lançamento não foi encontrado. Ele pode ter sido removido.");
    } catch (reason) {
      fail(errorMessage(reason, "Não foi possível abrir o lançamento."));
    }
  };

  const totals = data?.totals;
  // CR-14: without data in the previous period there is nothing to compare with.
  const priorEmpty = previous !== null && !hasData(previous);
  const prior = priorEmpty ? undefined : previous?.totals;
  const incomeItems = (data?.income_categories ?? []).filter(item => item.total_cents > 0).map(item => ({ id: item.category_id ?? "sem-categoria", label: item.name, value: item.total_cents }));
  // R4-REL-1: a single income source is one fact, not a card — it joins the Receitas KPI ("Toda de Salário").
  const singleIncome = incomeItems.length === 1 ? incomeItems[0]! : null;
  // R4-REL-2: averages count only the months with entries (same idea as the plan card's "meses com renda registrada").
  const avgIncome = data ? activeMonthlyAverage(data.months, totals?.income_cents ?? 0) : null;
  const avgExpense = data ? activeMonthlyAverage(data.months, totals?.expense_cents ?? 0) : null;
  const incomeHint = avgIncome && avgIncome.active ? averageHint(money(avgIncome.cents), avgIncome.active, avgIncome.span) : totals ? `Média de ${money(totals.avg_monthly_income_cents)} por mês` : "";
  const expenseHint = avgExpense && avgExpense.active ? averageHint(money(avgExpense.cents), avgExpense.active, avgExpense.span) : totals ? `Média de ${money(totals.avg_monthly_expense_cents)} por mês` : "";
  const kpis: KpiItem[] = totals ? [
    { label: "Receitas", value: <Money cents={totals.income_cents} />, delta: prior ? <DeltaBadge value={delta(totals.income_cents, prior.income_cents)} upIsGood /> : null, hint: singleIncome ? `Toda de ${singleIncome.label}. ${incomeHint}` : incomeHint },
    { label: "Despesas", value: <Money cents={totals.expense_cents} />, delta: prior ? <DeltaBadge value={delta(totals.expense_cents, prior.expense_cents)} upIsGood={false} /> : null, hint: expenseHint },
    { label: "Investido", value: <Money cents={totals.investment_cents} />, delta: prior ? <DeltaBadge value={delta(totals.investment_cents, prior.investment_cents)} upIsGood /> : null },
    { label: "Resultado", value: <Money cents={totals.net_cents} signed />, delta: prior ? <DeltaBadge value={delta(totals.net_cents, prior.net_cents)} upIsGood /> : null, hint: "Receitas − despesas − investimentos", tone: totals.net_cents < 0 ? "negative" : undefined },
    { label: "Taxa de poupança", value: totals.savings_rate_pct === null ? "—" : formatPct(totals.savings_rate_pct), delta: prior && totals.savings_rate_pct !== null && prior.savings_rate_pct !== null
      ? <DeltaBadge points value={{ pct: null, direction: totals.savings_rate_pct > prior.savings_rate_pct ? "up" : totals.savings_rate_pct < prior.savings_rate_pct ? "down" : "flat" }} upIsGood /> : null, hint: totals.savings_rate_pct === null ? "Sem receitas no período" : "Parte da renda que não virou despesa" },
  ] : [];

  const monthLabels = data?.months.map(item => shortMonthLabel(item.month)) ?? [];
  const topGroups = data ? groupTopExpenses(data.top_expenses, money) : [];
  const plan = planFromSettings(state.settings);
  const expenseItems = (data?.expense_categories ?? []).filter(item => item.total_cents > 0).map(item => ({ id: item.category_id ?? "sem-categoria", label: item.name, value: item.total_cents }));

  return <div className="stack reports-page">
    {/* R1-REL-5: the shell already shows "Relatórios" (H1); here only the period line and the actions. */}
    <div className="page-header report-header">
      <p className="report-period"><b>{periodLabel(shownPeriod)}</b> <span className="muted">· valores em reais (R$)</span></p>
      <div className="page-header-actions">
        {/* R2-REL-1: both need the server (the CSV is a download; printing needs the loaded report). */}
        {actionReason
          ? <button type="button" className="btn" disabled title={actionReason}><Download size={15} aria-hidden="true" />Exportar CSV</button>
          : <a className="btn" href={insightsApi.reportsCsvUrl(period.from, period.to)} download><Download size={15} aria-hidden="true" />Exportar CSV</a>}
        <button type="button" className="btn" disabled={Boolean(actionReason) || !data || stale} title={actionReason} onClick={() => window.print()}><Printer size={15} aria-hidden="true" />Imprimir</button>
      </div>
    </div>
    {offline && <p className="muted report-offline-note" role="note">Sem conexão com o servidor local: exportar e imprimir voltam quando ele responder.</p>}
    {!offline && emptyPeriod && <p className="muted report-offline-note" role="note">Nada para exportar neste período.</p>}

    <div className="toolbar report-toolbar">
      <Segmented aria-label="Período" className="report-period-chips" value={preset} onChange={value => choosePreset(value as PeriodPreset)}
        options={periodPresets.map(item => ({ value: item.id, label: item.label }))} />
      {/* R2-REL-5: phones get the native picker instead of chips that scroll out of view. */}
      <label className="report-period-select">
        <span className="sr-only">Período</span>
        <select value={preset} onChange={event => choosePreset(event.target.value as PeriodPreset)}>
          {periodPresets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      {preset === "custom" && <form className="range-inputs report-custom-range" aria-label="Período personalizado" onSubmit={event => { event.preventDefault(); applyCustom(); }}>
        <div className={`field${draftError ? " field-invalid" : ""}`}>
          <label id="report-from-label" htmlFor="report-from">De</label>
          <MonthPicker id="report-from" aria-labelledby="report-from-label" value={draft.from} max={anchor} onChange={from => { setDraft(current => ({ ...current, from })); setDraftError(null); }} aria-describedby={draftError ? "report-range-error" : undefined} />
        </div>
        <div className={`field${draftError ? " field-invalid" : ""}`}>
          <label id="report-to-label" htmlFor="report-to">Até</label>
          <MonthPicker id="report-to" aria-labelledby="report-to-label" value={draft.to} onChange={to => { setDraft(current => ({ ...current, to })); setDraftError(null); }} aria-describedby={draftError ? "report-range-error" : undefined} />
        </div>
        <button type="submit" className="btn small">Aplicar</button>
        {draftError && <p id="report-range-error" className="field-error" role="alert">{draftError}</p>}
      </form>}
    </div>

    {error && !data && (disconnected
      ? <EmptyState icon={RefreshCw} title="Relatórios abre quando o servidor voltar." description="Sem dados enquanto o servidor estiver fora. A página recarrega sozinha assim que ele responder." />
      : <EmptyState icon={RefreshCw} title="Não foi possível carregar o relatório" description={error} actionLabel="Tentar novamente" onAction={reload} />)}
    {error && data && !disconnected && <p className="form-error" role="alert">{error} <button type="button" className="btn small ghost" onClick={reload}>Tentar novamente</button></p>}
    {!data && loading && <Skeleton label="Carregando relatório…" lines={6} />}

    {/* R3-REL-2: the header keeps the range of the numbers on screen; the chosen period is named here until it loads. */}
    {stale && <p className="report-stale-note" role="status">Mostrando {periodLabel(shownPeriod)}. O período escolhido ({periodLabel(period)}) {disconnected ? "carrega quando o servidor responder" : "não pôde ser carregado"}.</p>}
    {data && <div className={`report-body${loading ? " is-refreshing" : ""}${stale ? " is-stale" : ""}`} aria-busy={loading || undefined}>
      <ReportKpis items={kpis} />
      {priorEmpty && <p className="muted report-compare-note" role="note">Sem dados no período anterior ({periodLabel(previousPeriod(shownPeriod))}) para comparar.</p>}
      {!hasData(data)
        ? <div className="empty-state report-empty">
          <span className="empty-icon"><ChartColumn size={22} aria-hidden="true" /></span>
          <div><h3>Nada para mostrar neste período</h3><p>Registre receitas e despesas ou escolha outro período para ver os gráficos.</p></div>
          {/* R2-REL-4: the empty period leads somewhere. */}
          <div className="report-empty-actions">
            <button type="button" className="btn primary" onClick={() => openModal("transaction")}><Plus size={15} aria-hidden="true" />Registrar lançamento</button>
            {preset !== "12m" && !offline && <button type="button" className="btn" onClick={() => choosePreset("12m")}>Ver 12 meses</button>}
          </div>
        </div>
        : <div className="report-grid">
          <ReportCard title="Receitas × despesas por mês" description="Barras por mês e a linha do resultado (receitas − despesas − investimentos)." span>
            <BarChart title="Receitas, despesas e investimentos por mês" xLabel="Mês"
              categories={data.months.map(item => ({ id: item.month, label: shortMonthLabel(item.month), title: formatMonthLabel(item.month) }))}
              series={[
                { id: "income", label: "Receitas", values: data.months.map(item => item.income_cents), color: seriesColor("income") },
                { id: "expense", label: "Despesas", values: data.months.map(item => item.expense_cents), color: seriesColor("expense") },
                { id: "investment", label: "Investimentos", values: data.months.map(item => item.investment_cents), color: seriesColor("investment") },
              ]}
              line={{ label: "Resultado", values: data.months.map(item => item.net_cents) }}
              highlightIndex={data.months.findIndex(item => item.month === anchor)} height={260} />
          </ReportCard>
          <ReportCard title="Despesas por categoria" description="As seis maiores e o restante em Outras.">
            {expenseItems.length === 1
              ? <SingleShare label={expenseItems[0]!.label} cents={expenseItems[0]!.value} />
              : expenseItems.length
              ? <DonutChart title="Despesas por categoria" items={ringColors(expenseItems, EXPENSE_RING)} otherLabel="Outras" centerLabel="Despesas" />
              : <EmptyState compact icon={ChartColumn} title="Sem despesas no período" description="As despesas aparecem aqui por categoria." actionLabel="Registrar despesa" onAction={() => openModal("transaction", { kind: "expense" })} />}
          </ReportCard>
          {!singleIncome && <ReportCard title="Receitas por categoria" description="De onde veio o dinheiro do período.">
            {incomeItems.length
              ? <DonutChart title="Receitas por categoria" items={ringColors(incomeItems, INCOME_RING)} otherLabel="Outras" centerLabel="Receitas" />
              : <EmptyState compact icon={TrendingUp} title="Sem receitas no período" description="Registre o salário e outras entradas para ver a origem da renda." actionLabel="Registrar receita" onAction={() => openModal("transaction", { kind: "income" })} />}
          </ReportCard>}
          <ReportCard title="Maiores gastos" description="Lançamentos repetidos aparecem juntos. Selecione uma barra para editar o lançamento (o mais recente, quando agrupado).">
            {topGroups.length && narrow
              ? <RankedBars title="Maiores gastos do período" color={seriesColor("expense")}
                items={topGroups.map(group => ({ id: group.key, label: group.label, detail: group.detail, value: group.totalCents }))}
                onSelect={index => { const group = topGroups[index]; if (group) void openExpense(group.latest.id, group.latest.date); }} />
              : topGroups.length
              ? <BarChart title="Maiores gastos do período" orientation="horizontal" xLabel="Lançamento"
                categories={topGroups.map(group => ({ id: group.key, label: group.label, title: group.label, detail: group.detail }))}
                series={[{ id: "amount", label: "Valor em R$", values: topGroups.map(group => group.totalCents), color: seriesColor("expense") }]}
                onSelect={index => { const group = topGroups[index]; if (group) void openExpense(group.latest.id, group.latest.date); }} />
              : <p className="muted">Sem despesas no período.</p>}
          </ReportCard>
          <ReportCard title="Formas de pagamento" description="Despesas do período por forma de pagamento.">
            {data.payment_methods.length && narrow
              ? <RankedBars title="Despesas por forma de pagamento" color={seriesColor("expense")}
                items={data.payment_methods.map(item => ({ id: item.method, label: methodLabel(item.method), detail: `${item.count} ${item.count === 1 ? "lançamento" : "lançamentos"}`, value: item.total_cents }))} />
              : data.payment_methods.length
              ? <BarChart title="Despesas por forma de pagamento" orientation="horizontal" xLabel="Forma de pagamento"
                categories={data.payment_methods.map(item => ({ id: item.method, label: methodLabel(item.method), detail: `${item.count} ${item.count === 1 ? "lançamento" : "lançamentos"}` }))}
                series={[{ id: "total", label: "Total", values: data.payment_methods.map(item => item.total_cents), color: seriesColor("expense") }]} />
              : <p className="muted">Sem despesas no período.</p>}
          </ReportCard>
          {/* R1-REL-3: the span-2 plan card comes after the pair of half cards (no holes in the grid). */}
          {plan && state.settings.monthly_net_income_cents > 0 && <PlanDistributionCard data={data} categories={state.categories} plan={plan} salaryCents={state.settings.monthly_net_income_cents} navigate={navigate} />}
          <ReportCard title="Evolução do patrimônio" description="Fotografia mensal de contas e investimentos, em reais." span>
            {data.net_worth.length === 1
              ? <SingleSnapshot item={data.net_worth[0]!} />
              : data.net_worth.length
              ? <AreaChart title="Evolução do patrimônio" xLabel="Mês" labels={data.net_worth.map(item => shortMonthLabel(item.month))} tooltipLabels={data.net_worth.map(item => formatMonthLabel(item.month))}
                series={[
                  { id: "total", label: "Patrimônio", values: data.net_worth.map(item => item.total_cents), fill: true, color: seriesColor("net_worth") },
                  { id: "bank", label: "Contas", values: data.net_worth.map(item => item.bank_cents), color: seriesColor("bank") },
                  { id: "investments", label: "Investimentos", values: data.net_worth.map(item => item.investments_cents), color: seriesColor("investments") },
                ]} height={240} />
              : <p className="muted">As fotografias mensais do patrimônio começam a ser registradas a partir deste mês.</p>}
          </ReportCard>
          <ReportCard title="Exposição por moeda" description="Saldos de contas e investimentos agrupados pela moeda, convertidos para reais." span>
            {data.currency_exposure.length ? <CurrencyExposure items={data.currency_exposure} /> : <EmptyState compact icon={Landmark} title="Nenhuma conta ou investimento ativo" description="Cadastre uma conta bancária ou um investimento para ver em que moedas está o seu patrimônio." actionLabel="Cadastrar conta" onAction={() => openModal("bank-account")} />}
          </ReportCard>
        </div>}
      {monthLabels.length > 0 && <p className="muted report-footnote">Período de {formatMonthLabel(data.from)} a {formatMonthLabel(data.to)}. Lançamentos em outras moedas usam a cotação do dia do lançamento.</p>}
    </div>}
  </div>;
}
