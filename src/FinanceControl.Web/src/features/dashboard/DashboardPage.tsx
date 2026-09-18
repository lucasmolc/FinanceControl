import { useCallback, useMemo, useState } from "react";
import { ArrowRight, Check, Eye, Gauge, LayoutGrid, Receipt, RotateCcw } from "lucide-react";
import { api, isConnectivityError } from "../../api/client";
import type { DonutSelection } from "../../components/charts";
import { Kpi } from "../../components/ui";
import { useMarketRates } from "../../hooks/useMarketRates";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { usePreferences } from "../../hooks/usePreferences";
import { currentMonth, daysInMonth, formatMonthLabel, todayISO } from "../../lib/date";
import type { DashboardWidgetId } from "../../lib/preferences";
import type { ChecklistItem, PageProps, TopExpense } from "../../types";
import { MonthCloseBar } from "../closing/MonthCloseBar";
import { isMonthClosed, MONTH_CLOSED } from "../closing/closingModel";
import { reserveTargetCents } from "../planning/reserveModel";
import { CategoriesWidget, FlowWidget, NetWorthWidget, PaceWidget, PaymentsWidget, TopExpensesWidget, type ChartWidgetState } from "./ChartWidgets";
import { availableKpi, expensesKpi, heroLabel, incomeKpi, isFirstUse, monthForecast, monthTotals, previousSnapshot, wealthFigures, wealthKpi, type KpiView } from "./dashboardModel";
import { HeroWidget, MarketTicker, MarketWidget } from "./HeroWidgets";
import { BillsWidget, BudgetWidget, GoalsWidget, SubscriptionsWidget } from "./ListWidgets";
import { PlanWidget } from "./PlanWidget";
import { useDashboardReports } from "./useDashboardReports";
import { useMasonry } from "./useMasonry";
import { useMediaQuery } from "./useMediaQuery";
import type { WidgetEditing } from "./widgetDrag";
import { defaultWidgets, hiddenWidgets, moveWidget, moveWidgetTo, setWidgetVisible, tickerCodes, visibleWidgets, widgetLabel } from "./widgetModel";

export interface DashboardPageProps extends PageProps { onToggleBill: (item: ChecklistItem) => void; onPlanSetup: () => void; busyBillId?: number | null; }

function KpiGrid({ items, className, label }: { items: KpiView[]; className: string; label: string }) {
  return <div className={className} role="group" aria-label={label}>
    {items.map(item => <Kpi key={item.label} label={item.label} value={item.value} tone={item.tone} hint={item.hint} />)}
  </div>;
}

function ActivationPanel({ planConfigured, onPlan, onFirstTransaction }: { planConfigured: boolean; onPlan: () => void; onFirstTransaction: () => void }) {
  return <section className="activation-panel card tour-activation" aria-labelledby="activation-title">
    <div className="activation-copy">
      <span className="activation-icon" aria-hidden="true">{planConfigured ? <Receipt size={22} /> : <Gauge size={22} />}</span>
      <div>
        <h2 id="activation-title">{planConfigured ? "Registre o primeiro movimento do mês" : "Defina a referência do seu mês"}</h2>
        <p className="muted">{planConfigured ? "Uma receita ou despesa já transforma o planejamento em acompanhamento real." : "Informe renda e teto de gastos para ver imediatamente quanto está disponível. Leva menos de um minuto."}</p>
      </div>
      <div className="activation-actions">
        <button type="button" className="btn primary" onClick={planConfigured ? onFirstTransaction : onPlan}>
          {planConfigured ? "Registrar primeiro lançamento" : "Definir renda e teto"}<ArrowRight size={16} aria-hidden="true" />
        </button>
        {!planConfigured && <button type="button" className="btn ghost" onClick={onFirstTransaction}>Registrar lançamento agora</button>}
      </div>
    </div>
    <ol className="activation-path" aria-label="Caminho para acompanhar o mês">
      <li className={planConfigured ? "done" : "current"}><span>1</span><div><b>Planeje<span className="sr-only">{planConfigured ? " (concluído)" : " (etapa atual)"}</span></b><small>Renda e teto mensal</small></div></li>
      <li className={planConfigured ? "current" : ""}><span>2</span><div><b>Registre{planConfigured && <span className="sr-only"> (etapa atual)</span>}</b><small>Receitas e despesas reais</small></div></li>
      <li><span>3</span><div><b>Acompanhe</b><small>Orçamento, contas e objetivos</small></div></li>
    </ol>
  </section>;
}

/** Edit-mode bar: hidden widgets to show again, restore defaults, finish. */
function CustomizeBar({ hidden, onShow, onReset, onDone, announcement }: { hidden: DashboardWidgetId[]; onShow: (id: DashboardWidgetId) => void; onReset: () => void; onDone: () => void; announcement: string }) {
  return <section className="dashboard-customize-panel card" aria-labelledby="customize-title">
    <div className="card-header">
      <div><h2 id="customize-title">Personalizar painel</h2><p className="muted">Arraste os widgets pela alça, use as setas ou os botões para reordenar e o olho para ocultar.</p></div>
      <div className="row">
        <button type="button" className="btn small ghost" onClick={onReset}><RotateCcw size={14} aria-hidden="true" />Restaurar padrão</button>
        <button type="button" className="btn small primary" onClick={onDone}><Check size={14} aria-hidden="true" />Concluir</button>
      </div>
    </div>
    {hidden.length ? <div className="widget-hidden-list" role="group" aria-label="Widgets ocultos">
      <span className="muted">Ocultos:</span>
      {hidden.map(id => <button type="button" key={id} className="btn small" onClick={() => onShow(id)} aria-label={`Mostrar ${widgetLabel(id)}`}><Eye size={14} aria-hidden="true" />{widgetLabel(id)}</button>)}
    </div> : <p className="muted">Todos os widgets estão visíveis.</p>}
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
  </section>;
}

export function DashboardPage(props: DashboardPageProps) {
  const { state, month, summary, checklist, version, openModal, openEdit, onToggleBill, onPlanSetup, busyBillId = null, onCloseMonth, onReopenMonth, navigate, notifyError } = props;
  const { settings } = state;
  const fmt = useMoneyFormat();
  const money = useCallback((cents: number) => fmt(cents), [fmt]);
  const { preferences, update } = usePreferences();
  const firstUse = isFirstUse(state);
  const reports = useDashboardReports(month, version, !firstUse);
  const market = useMarketRates(!firstUse);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<DashboardWidgetId | null>(null);
  const [dropTarget, setDropTarget] = useState<DashboardWidgetId | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const phone = useMediaQuery("(max-width: 620px)");
  const gridKey = [firstUse, editing, preferences.show_market_ticker, ...visibleWidgets(preferences.dashboard_widgets)].join(",");
  const gridRef = useMasonry<HTMLDivElement>([gridKey]);

  const totals = monthTotals(state, month, summary);
  const limit = settings.monthly_spending_limit_cents;
  const planConfigured = settings.monthly_net_income_cents > 0 || limit > 0;
  const openFirstTransaction = () => openModal("transaction", { kind: "expense" });
  const now = currentMonth();
  const wealth = useMemo(() => wealthFigures(state, market.rates), [state, market.rates]);
  const saved = preferences.dashboard_widgets;
  const order = visibleWidgets(saved);
  // CR-13: the patrimônio KPI repeats the hero; it only shows when the hero is off (and on first use, without widgets).
  const heroVisible = !firstUse && order.includes("saldo");
  // Decision 1: "teto" is only the monthly spending ceiling; with a plan it is fixos + lazer (said in the hint).
  const planComposed = typeof settings.plan_fixed_pct === "number";
  const kpis = [
    incomeKpi(totals.income, settings.monthly_net_income_cents, money),
    expensesKpi(totals.expenses, limit, money, planComposed),
    availableKpi(limit, totals.expenses, money, planComposed),
    ...(heroVisible ? [] : [wealthKpi(wealth.bank, wealth.investments, money)]),
  ];
  const persist = useCallback((next: string[], message: string) => {
    setAnnouncement(message);
    update({ dashboard_widgets: next }).catch(reason => notifyError?.(reason));
  }, [update, notifyError]);

  const editingApi: WidgetEditing | null = editing ? {
    index: 0, count: order.length, dragging, dropTarget,
    move: (id, delta) => {
      const next = moveWidget(saved, id, delta);
      const position = visibleWidgets(next).indexOf(id) + 1;
      persist(next, `${widgetLabel(id)} na posição ${position} de ${order.length}.`);
    },
    hide: id => persist(setWidgetVisible(saved, id, false), `${widgetLabel(id)} ocultado.`),
    onDragStart: id => setDragging(id),
    onDragEnter: id => setDropTarget(id),
    onDrop: id => {
      if (dragging && dragging !== id) persist(moveWidgetTo(saved, dragging, id), `${widgetLabel(dragging)} movido.`);
      setDragging(null); setDropTarget(null);
    },
    onDragEnd: () => { setDragging(null); setDropTarget(null); },
  } : null;

  if (firstUse) return <>
    <ActivationPanel planConfigured={planConfigured} onPlan={onPlanSetup} onFirstTransaction={openFirstTransaction} />
    {planConfigured && <KpiGrid className="grid cards dashboard-kpis dashboard-section tour-summary" label="Resumo inicial do mês" items={kpis} />}
    <p className="activation-footnote muted">Metas, contas, categorias e assinaturas continuam disponíveis na navegação e podem ser configuradas quando fizerem sentido.</p>
  </>;

  // Month switch: the previous month's data stays dimmed until the new one arrives (crossfade); first load → skeletons.
  const summarySwitching = summary !== null && summary.month !== month;
  const reportsLoading = reports.data === null && reports.loading;
  const reportsSwitching = reports.data !== null && (reports.month !== month || reports.loading);
  const summaryState = (widgetEditing: WidgetEditing | null): ChartWidgetState => ({ editing: widgetEditing, switching: summarySwitching, loading: false });
  const reportsState = (widgetEditing: WidgetEditing | null): ChartWidgetState => ({ editing: widgetEditing, switching: reportsSwitching && !reportsUnavailable, loading: reportsLoading });
  // R4-PAINEL-1 / R3 decision 1: a connectivity failure is the banner's to report (no second strip with its own retry);
  // the report charts then say their data is missing instead of an empty state ("Sem movimento…") or another month's bars.
  const reportsDisconnected = Boolean(props.offline) || (reports.error !== null && isConnectivityError(reports.error));
  const reportsUnavailable = reports.error !== null && !reports.loading && (reports.data === null || reports.month !== month)
    ? (reportsDisconnected ? "Sem dados enquanto o servidor estiver fora." : "Não foi possível carregar este gráfico.")
    : undefined;

  const netWorth = reports.data?.net_worth ?? [];
  const isCurrent = month === now;
  const snapshot = netWorth.find(item => item.month === month) ?? null;
  const heroTotal = isCurrent ? wealth.total : snapshot?.total_cents ?? null;
  const forecast = monthForecast(summary?.daily_expenses ?? [], month, limit, todayISO());
  const goalLock = isMonthClosed(summary, now) && summary?.month === now ? MONTH_CLOSED : undefined;
  const closed = isMonthClosed(summary, month);
  const offlineReason = props.offline ? "Sem conexão com o servidor local." : undefined;
  const heldCurrencies = wealth.foreign.map(item => item.currency);
  const codes = tickerCodes(heldCurrencies);
  const goTo = (page: Parameters<NonNullable<PageProps["navigate"]>>[0], params?: Record<string, string>) => navigate?.(page, params);
  // CR-13: with the ticker on, "Cotações" would repeat it (still listed while customizing, so it can be arranged).
  const tickerOn = preferences.show_market_ticker;
  const shownWidgets = editing || !tickerOn ? order : order.filter(id => id !== "mercado");
  // CR-29: suggest closing the current month only in its last days (past months always); Lançamentos keeps the action.
  const today = todayISO();
  const closeSuggested = month < now || (month === now && Number(today.slice(8, 10)) >= daysInMonth(month) - 2);

  const openExpense = async (item: TopExpense) => {
    try {
      const match = (await api.transactions(item.date.slice(0, 7))).find(entry => entry.id === item.id);
      if (match) openEdit("transaction", match);
      else notifyError?.(new Error("Este lançamento não foi encontrado. Ele pode ter sido removido."));
    } catch (reason) {
      notifyError?.(reason);
    }
  };
  const selectCategory = (selection: DonutSelection) => {
    if (selection.other) goTo("transactions", { tipo: "expense" });
    else goTo("transactions", { categoria: String(selection.id), tipo: "expense" });
  };

  // R2-PAINEL-5: on phones "Personalizar painel" sits after the widgets (the Patrimônio comes first), at content width.
  // Starting from the bottom on a phone, the edit panel opens at the top: bring it (and the focus) there.
  const toggleEditing = () => {
    const next = !editing;
    setEditing(next);
    if (next && phone) window.requestAnimationFrame(() => {
      const heading = document.getElementById("customize-title");
      if (!heading) return;
      heading.setAttribute("tabindex", "-1");
      heading.scrollIntoView({ block: "start" });
      heading.focus({ preventScroll: true });
    });
  };
  const toolbar = <div className="dashboard-toolbar">
    <button type="button" className="btn small ghost dashboard-customize" aria-pressed={editing} onClick={toggleEditing}>
      <LayoutGrid size={15} aria-hidden="true" />{editing ? "Concluir personalização" : "Personalizar painel"}
    </button>
  </div>;

  const renderWidget = (id: DashboardWidgetId, index: number) => {
    const widgetEditing = editingApi ? { ...editingApi, index } : null;
    switch (id) {
      case "saldo": return <HeroWidget key={id} label={heroLabel(month, now)} total={heroTotal}
        bank={isCurrent ? wealth.bank : snapshot?.bank_cents ?? 0} investments={isCurrent ? wealth.investments : snapshot?.investments_cents ?? 0}
        reserveTarget={reserveTargetCents(settings)} previous={previousSnapshot(netWorth, month)} history={netWorth} missing={isCurrent ? wealth.missing : []} monthLabel={formatMonthLabel(month)}
        state={{ editing: widgetEditing, switching: reportsSwitching, loading: false }} />;
      case "fluxo": return <FlowWidget key={id} data={reports.data} month={month} unavailable={reportsUnavailable} state={reportsState(widgetEditing)} />;
      case "contas": return <BillsWidget key={id} checklist={checklist} month={month} busyBillId={busyBillId} onToggleBill={onToggleBill} openModal={openModal}
        cards={state.cards} version={version} locked={closed} lockReason={offlineReason} offline={Boolean(props.offline)} onOpenCards={() => goTo("cards")} state={summaryState(widgetEditing)} />;
      case "categorias": return <CategoriesWidget key={id} categories={totals.categories} uncategorized={totals.uncategorized} onSelect={selectCategory} state={summaryState(widgetEditing)} />;
      case "metas": return <GoalsWidget key={id} goals={state.goals} reserveGoalId={settings.emergency_goal_id ?? null} openModal={openModal} lockedReason={goalLock} state={{ editing: widgetEditing, switching: false, loading: false }} />;
      case "mercado": return <MarketWidget key={id} details={market.details} codes={codes} foreign={wealth.foreign} loading={market.loading} error={market.error} onOpenMarket={() => goTo("market")} state={{ editing: widgetEditing, switching: false, loading: false }} />;
      case "assinaturas": return <SubscriptionsWidget key={id} finance={state} openModal={openModal} state={{ editing: widgetEditing, switching: false, loading: false }} />;
      case "patrimonio": return <NetWorthWidget key={id} data={reports.data} month={month} unavailable={reportsUnavailable} onOpenReports={navigate ? () => goTo("reports") : undefined} state={reportsState(widgetEditing)} />;
      case "maiores_gastos": return <TopExpensesWidget key={id} items={summary?.top_expenses ?? []} available={summary === null ? false : summary.top_expenses !== undefined} onOpen={item => void openExpense(item)} state={summaryState(widgetEditing)} />;
      case "ritmo": return <PaceWidget key={id} forecast={forecast} limit={limit} available={summary !== null && summary.daily_expenses !== undefined} state={summaryState(widgetEditing)} />;
      case "orcamento": return <BudgetWidget key={id} rows={totals.categories} categories={state.categories} uncategorized={totals.uncategorized} expenses={totals.expenses} openModal={openModal} onOpenCategories={navigate ? () => goTo("categories") : undefined} state={summaryState(widgetEditing)} />;
      case "pagamentos": return summary?.payment_methods && summary.month === month
        ? <PaymentsWidget key={id} month={month} methods={summary.payment_methods} state={summaryState(widgetEditing)} />
        : <PaymentsWidget key={id} data={reports.data} unavailable={reportsUnavailable} state={reportsState(widgetEditing)} />;
      case "plano": return <PlanWidget key={id} plan={summary?.plan} hasPlan={typeof settings.plan_fixed_pct === "number"} month={month} current={isCurrent} openModal={openModal} onPlanSetup={onPlanSetup} onOpenCategories={() => goTo("categories", { balde: "sem" })} state={summaryState(widgetEditing)}
        forecastStatus={isCurrent ? forecast.status : undefined} lockedReason={offlineReason ?? (closed ? MONTH_CLOSED : undefined)} closed={closed} categories={state.categories} />;
    }
  };

  return <>
    <KpiGrid className="grid cards dashboard-kpis tour-summary" label={`Resumo de ${formatMonthLabel(month)}`} items={kpis} />
    {totals.estimated && <p className="muted kpi-hint" role="note">Totais calculados a partir dos lançamentos mais recentes; o resumo do servidor não está disponível.</p>}
    <MonthCloseBar month={month} summary={summary} onCloseMonth={closeSuggested ? onCloseMonth : undefined} onReopenMonth={onReopenMonth} />
    {tickerOn && <MarketTicker details={market.details} codes={codes} onOpenMarket={() => goTo("market")} />}
    {reports.error && !reports.data && !reportsDisconnected && <p className="muted dashboard-note" role="note">{reports.error} <button type="button" className="btn small ghost" onClick={reports.reload}>Tentar novamente</button></p>}

    {(!phone || editing) && toolbar}
    {editing && <CustomizeBar hidden={hiddenWidgets(saved)} announcement={announcement}
      onShow={id => persist(setWidgetVisible(saved, id, true), `${widgetLabel(id)} voltou ao painel.`)}
      onReset={() => persist(defaultWidgets(), "Painel restaurado para o padrão.")}
      onDone={() => setEditing(false)} />}

    {shownWidgets.length
      ? <div ref={gridRef} className={`widget-grid${editing ? " is-editing" : ""}`} data-testid="widget-grid" aria-busy={summarySwitching || reports.loading || undefined}>
        {shownWidgets.map((id, index) => renderWidget(id, index))}
      </div>
      : <p className="muted dashboard-note">Todos os widgets estão ocultos. Use “Personalizar painel” para mostrar algum.</p>}
    {phone && !editing && toolbar}
  </>;
}
