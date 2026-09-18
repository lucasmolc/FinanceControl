import { AlertTriangle, ArrowRight, Gauge, PieChart, Receipt, TrendingUp, Wallet } from "lucide-react";
import type { ReportsData } from "../../api/insights";
import { AreaChart, BarChart, DonutChart, seriesColor, type DonutSelection } from "../../components/charts";
import { formatShare, topWithOther } from "../../components/charts/chartMath";
import { EmptyState, Money } from "../../components/ui";
import { KpiDelta } from "../../components/ui/Stat";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { formatDate, formatMonthLabel } from "../../lib/date";
import { labelFor, paymentMethodLabels } from "../../lib/labels";
import type { SummaryPaymentMethod, TopExpense } from "../../types";
import { shortMonthLabel } from "../reports/reportsModel";
import { changeRatio, forecastText, paceLine, previousSnapshot, type CategoryRow, type MonthForecast } from "./dashboardModel";
import type { WidgetEditing } from "./widgetDrag";
import { WidgetFrame } from "./WidgetFrame";

/** Frame state shared by the chart widgets. */
export interface ChartWidgetState { editing: WidgetEditing | null; switching: boolean; loading: boolean; }

/**
 * R4-PAINEL-1: why a report-based chart has no data to show (offline / failed request). Never an empty state: "Sem
 * movimento" would claim there is nothing when the data just could not load. No retry here — the banner (offline) or the
 * page note (other errors) has it.
 */
function Unavailable({ reason }: { reason: string }) {
  return <p className="muted widget-unavailable" role="note">{reason}</p>;
}

const methodLabel = (method: string) => labelFor(paymentMethodLabels, method, "Outro");

/** fluxo — income × expenses × investments over 6 months with the net line; the selected month is highlighted. */
export function FlowWidget({ data, month, unavailable, state }: { data: ReportsData | null; month: string; unavailable?: string; state: ChartWidgetState }) {
  const months = data?.months ?? [];
  const hasData = months.some(item => item.income_cents || item.expense_cents || item.investment_cents);
  return <WidgetFrame id="fluxo" description={`Receitas, despesas e aportes até ${formatMonthLabel(month)}, com a linha do resultado.`} {...state}>
    {unavailable ? <Unavailable reason={unavailable} /> : hasData ? <BarChart title="Fluxo de 6 meses" xLabel="Mês" height={240}
      categories={months.map(item => ({ id: item.month, label: shortMonthLabel(item.month), title: formatMonthLabel(item.month) }))}
      series={[
        { id: "income", label: "Receitas", values: months.map(item => item.income_cents), color: seriesColor("income") },
        { id: "expense", label: "Despesas", values: months.map(item => item.expense_cents), color: seriesColor("expense") },
        { id: "investment", label: "Investimentos", values: months.map(item => item.investment_cents), color: seriesColor("investment") },
      ]}
      line={{ label: "Resultado", values: months.map(item => item.net_cents), color: seriesColor("net") }}
      highlightIndex={months.findIndex(item => item.month === month)} />
      : <EmptyState compact icon={TrendingUp} title="Sem movimento nos últimos 6 meses" description="Receitas, despesas e aportes registrados aparecem aqui mês a mês." />}
  </WidgetFrame>;
}

/** maiores_gastos — top expenses of the month (horizontal bars); a bar opens the transaction for editing. */
export function TopExpensesWidget({ items, available, onOpen, state }: { items: TopExpense[]; available: boolean; onOpen: (item: TopExpense) => void; state: ChartWidgetState }) {
  const fmt = useMoneyFormat();
  const shown = items.slice(0, 7);
  return <WidgetFrame id="maiores_gastos" description="Selecione uma barra para editar o lançamento." {...state}>
    {!available ? <p className="muted">O resumo do mês não está disponível no momento.</p>
      : shown.length ? <BarChart title="Maiores gastos do mês" orientation="horizontal" xLabel="Lançamento"
        categories={shown.map(item => ({
          id: item.id, label: item.description || "Sem descrição", title: item.description || "Sem descrição",
          detail: [item.category_name ?? "Sem categoria", formatDate(item.date), item.currency !== "BRL" ? fmt(item.amount_cents, item.currency) : null].filter(Boolean).join(" · "),
        }))}
        series={[{ id: "amount", label: "Valor em R$", values: shown.map(item => item.base_amount_cents), color: seriesColor("amount") }]}
        onSelect={index => { const item = shown[index]; if (item) onOpen(item); }} />
        : <EmptyState compact icon={Receipt} title="Nenhum gasto no mês" description="As maiores despesas do mês aparecem aqui assim que forem registradas." />}
  </WidgetFrame>;
}

/** categorias — donut of the month's spending by category; a slice opens Lançamentos filtered by it. */
export function CategoriesWidget({ categories, uncategorized, onSelect, state }: { categories: CategoryRow[]; uncategorized: number; onSelect: (selection: DonutSelection) => void; state: ChartWidgetState }) {
  const items = [
    ...categories.filter(row => row.spent > 0).map(row => ({ id: row.id, label: row.active ? row.name : `${row.name} (removida)`, value: row.spent })),
    ...(uncategorized > 0 ? [{ id: "sem", label: "Sem categoria", value: uncategorized }] : []),
  ];
  return <WidgetFrame id="categorias" description="Selecione uma fatia para ver os lançamentos." {...state}>
    {items.length ? <DonutChart title="Gastos por categoria" items={items} maxSlices={6} otherLabel="Outras" centerLabel="Gastos" onSelect={onSelect} />
      : <EmptyState compact icon={PieChart} title="Nenhum gasto no mês" description="Os gastos por categoria aparecem aqui assim que forem registrados." />}
  </WidgetFrame>;
}

/** ritmo — cumulative daily spend vs the spending limit and the ideal pace, with the month-end forecast. */
export function PaceWidget({ forecast, limit, available, state }: { forecast: MonthForecast; limit: number; available: boolean; state: ChartWidgetState }) {
  const fmt = useMoneyFormat();
  const labels = Array.from({ length: forecast.days }, (_, index) => String(index + 1));
  const text = forecastText(forecast, limit, value => fmt(value));
  const tone = forecast.status === "danger" ? " danger" : forecast.status === "warning" ? " warning" : "";
  return <WidgetFrame id="ritmo" description={limit > 0 ? "Gasto acumulado dia a dia contra o teto e o ritmo ideal." : "Gasto acumulado dia a dia. Defina um teto de gastos para comparar."} {...state}>
    {!available ? <p className="muted">O resumo do mês não está disponível no momento.</p> : <>
      <AreaChart title="Gasto acumulado no mês" xLabel="Dia" labels={labels} tooltipLabels={labels.map(day => `Dia ${day}`)} height={220}
        series={[
          { id: "spent", label: "Gasto acumulado", values: forecast.cumulative, fill: true, color: seriesColor("spent") },
          ...(limit > 0 ? [{ id: "pace", label: "Ritmo ideal", values: paceLine(limit, forecast.days), dashed: true, color: seriesColor("pace") }] : []),
        ]}
        singlePointNote={null}
        references={limit > 0 ? [{ label: "Teto de gastos", value: limit, color: seriesColor("limit") }] : []} />
      <p className={`forecast${tone}`} role="note">
        {forecast.status === "danger" || forecast.status === "warning" ? <AlertTriangle size={16} aria-hidden="true" /> : <Gauge size={16} aria-hidden="true" />}
        <span>{text}{forecast.status === "danger" ? " Acima do teto." : forecast.status === "warning" ? " Perto do teto." : ""}</span>
      </p>
    </>}
  </WidgetFrame>;
}

/**
 * pagamentos — spending by payment method. MEL-46: the month's split from `/api/summary` (`methods` + `month`); older
 * servers without it fall back to the 6-month window of the reports (`data`).
 * R1-PAINEL-5: a single stacked share bar + ranked list (not a second donut next to "Gastos por categoria").
 */
export function PaymentsWidget({ data = null, month, methods, unavailable, state }: { data?: ReportsData | null; month?: string; methods?: SummaryPaymentMethod[]; unavailable?: string; state: ChartWidgetState }) {
  const monthly = methods !== undefined && month !== undefined;
  const source = monthly ? methods : data?.payment_methods ?? [];
  const items = topWithOther(source.map(item => ({ id: item.method, label: methodLabel(item.method), value: item.total_cents })), 5, "Outras");
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return <WidgetFrame id="pagamentos" description={monthly ? `Despesas de ${formatMonthLabel(month)} por forma de pagamento.` : "Despesas dos últimos 6 meses por forma de pagamento."} {...state}
    aside={!unavailable && total > 0 ? <Money cents={total} className="widget-total" /> : undefined}>
    {unavailable ? <Unavailable reason={unavailable} /> : total > 0 ? <div className="share-bar-widget">
      <div className="share-bar" aria-hidden="true">
        {items.map(item => <span key={item.id} style={{ flexGrow: item.value, background: item.color }} title={`${item.label}: ${formatShare(item.value / total)}`} />)}
      </div>
      <ul className="share-list" aria-label="Formas de pagamento">
        {items.map(item => <li key={item.id}>
          <span className="share-swatch" style={{ background: item.color }} aria-hidden="true" />
          <span className="share-label">{item.label}</span>
          <span className="share-pct">{formatShare(item.value / total)}</span>
          <Money cents={item.value} className="share-value" />
        </li>)}
      </ul>
    </div>
      : <EmptyState compact icon={Wallet} title={monthly ? "Sem despesas no mês" : "Sem despesas no período"} description="As formas de pagamento mais usadas aparecem aqui." />}
  </WidgetFrame>;
}

/** patrimonio — monthly net-worth snapshots (BRL) with the change since the previous month. */
export function NetWorthWidget({ data, month, unavailable, onOpenReports, state }: { data: ReportsData | null; month: string; unavailable?: string; onOpenReports?: () => void; state: ChartWidgetState }) {
  const series = unavailable ? [] : data?.net_worth ?? [];
  const last = series.find(item => item.month === month) ?? series[series.length - 1] ?? null;
  const previous = last ? previousSnapshot(series, last.month) : null;
  return <WidgetFrame id="patrimonio" description="Fotografia mensal de contas e investimentos, em reais." {...state}
    aside={last ? <Money cents={last.total_cents} className="widget-total" /> : undefined}
    footer={onOpenReports ? <button type="button" className="btn small ghost widget-link" onClick={onOpenReports}>Ver relatórios<ArrowRight size={14} aria-hidden="true" /></button> : undefined}>
    {unavailable ? <Unavailable reason={unavailable} /> : series.length ? <>
      {last && previous && <p className="widget-delta"><KpiDelta value={changeRatio(last.total_cents, previous.total_cents)} context={`em relação a ${formatMonthLabel(previous.month)}`} /> <span className="muted">desde {formatMonthLabel(previous.month)}</span></p>}
      <AreaChart title="Evolução do patrimônio" xLabel="Mês" height={170} labels={series.map(item => shortMonthLabel(item.month))} tooltipLabels={series.map(item => formatMonthLabel(item.month))}
        series={[{ id: "total", label: "Patrimônio", values: series.map(item => item.total_cents), fill: true, color: seriesColor("net_worth") }]} />
    </> : <EmptyState compact icon={TrendingUp} title="Ainda sem histórico" description="A fotografia mensal do patrimônio começa a ser registrada a partir deste mês." />}
  </WidgetFrame>;
}
