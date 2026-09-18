import { ArrowRight, CalendarClock, CheckCircle2, Circle, CreditCard, PiggyBank, SlidersHorizontal, Tags, Target, Tv } from "lucide-react";
import { api } from "../../api/client";
import { Badge, EmptyState, Money } from "../../components/ui";
import { BrandBadge } from "../../components/ui/BrandBadge";
import { CategoryIcon } from "../../components/ui/CategoryIcon";
import { useAsyncList } from "../../hooks/useAsyncList";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { dateInMonth, daysBetween, formatMonthLabel, todayISO } from "../../lib/date";
import { daysLabel, labelFor, monthlyEquivalentCents, subscriptionFrequencyLabels } from "../../lib/labels";
import { formatProgress, progressRatio } from "../../lib/progress";
import type { Card, Category, ChecklistItem, FinanceState, Goal, OpenModal } from "../../types";
import { chargedLabel } from "../catalog/catalogMetrics";
import { MONTH_CLOSED } from "../closing/closingModel";
import { buildInvoiceRows, invoiceRowTitle, type InvoiceDueRow } from "../planning/invoiceRows";
import { billStatus, budgetBadge, budgetLevel, percent, type CategoryRow } from "./dashboardModel";
import type { ChartWidgetState } from "./ChartWidgets";
import { WidgetFrame } from "./WidgetFrame";

const MAX_ROWS = 6;
/** R2-PAINEL-1: the budget list stops at 5 rows (the rest is one link away), so it never towers over its neighbours. */
const BUDGET_ROWS = 5;
const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function ProgressBar({ value, tone, label, valueText }: { value: number; tone?: "warning" | "danger" | "gold"; label: string; valueText: string }) {
  const width = Math.max(0, Math.min(100, value));
  return <div className={`progress${tone ? ` ${tone}` : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={width} aria-valuetext={valueText}>
    <span style={{ width: `${width}%` }} />
  </div>;
}

type TimelineEntry =
  | { type: "bill"; key: string; due: string; paid: boolean; name: string; amount: number; item: ChecklistItem }
  | { type: "invoice"; key: string; due: string; paid: boolean; name: string; amount: number; row: InvoiceDueRow };

/** Unpaid first, then by due date and name — bills and card invoices in one timeline. */
const byDue = (left: TimelineEntry, right: TimelineEntry) =>
  Number(left.paid) - Number(right.paid) || left.due.localeCompare(right.due) || left.name.localeCompare(right.name, "pt-BR");

/** "Fatura de agosto"; another year keeps it ("Fatura de dezembro de 2025"). */
const invoiceMonthText = (invoiceMonth: string, month: string): string => {
  const label = formatMonthLabel(invoiceMonth);
  return `Fatura de ${invoiceMonth.slice(0, 4) === month.slice(0, 4) ? label.replace(/ de \d{4}$/, "") : label}`;
};

const toneClass = (paid: boolean, tone: string) => (paid ? "is-paid" : tone === "negative" ? "is-overdue" : tone === "warning" ? "is-soon" : "");

function TimelineDate({ date }: { date: string }) {
  return <span className="timeline-date" aria-hidden="true"><b>{date.slice(8, 10)}</b><small>{MONTH_SHORT[Number(date.slice(5, 7)) - 1]}</small></span>;
}

export interface BillsWidgetProps {
  checklist: ChecklistItem[];
  month: string;
  busyBillId: number | null;
  onToggleBill: (item: ChecklistItem) => void;
  openModal: OpenModal;
  cards: Card[];
  /** Data version (App refresh): the card invoices are fetched again with it. */
  version?: number;
  /** The month is closed (payments cannot change). */
  locked: boolean;
  /** Why payments are unavailable besides a closed month (offline). */
  lockReason?: string;
  /** The local server is unreachable (R4-PAINEL-3: the invoices that could not load are named as missing). */
  offline?: boolean;
  onOpenCards: () => void;
  state: ChartWidgetState;
}

/**
 * contas — the month's bills and card invoices as one due-date timeline (auto-debit, pay/unpay, pay with details,
 * "Pagar fatura"). R2-PAINEL-2: invoices come from `/api/card-invoices?month=` (the same rows as Contas a pagar, so both
 * pages count the same items), and a past month lists only the invoices due in it — never today's balances.
 */
export function BillsWidget({ checklist, month, busyBillId, onToggleBill, openModal, cards, version = 0, locked, lockReason, offline = false, onOpenCards, state }: BillsWidgetProps) {
  const fmt = useMoneyFormat();
  const today = todayISO();
  const invoiceList = useAsyncList(() => api.cardInvoicesDue(month), cards.length ? `widget-invoices:${month}:${version}` : null);
  const invoicesLoaded = invoiceList.loadedKey?.startsWith(`widget-invoices:${month}:`) ?? false;
  const invoices = invoicesLoaded ? buildInvoiceRows(invoiceList.items, month, today, locked) : [];
  const blocked = locked ? MONTH_CLOSED : lockReason;
  // R4-PAINEL-3: like Contas a pagar, when the invoices could not load (offline or failed) the count says they are missing
  // instead of silently shrinking ("0 de 5 · sem as faturas de cartão"); no retry here — the global banner has it.
  const invoicesMissing = cards.length > 0 && !invoicesLoaded && (offline || invoiceList.error !== null);
  const missingNote = invoicesMissing ? " · sem as faturas de cartão" : "";

  const entries: TimelineEntry[] = [
    ...checklist.map((item): TimelineEntry => ({ type: "bill", key: `bill:${item.id}`, due: dateInMonth(month, item.due_day), paid: item.paid, name: item.name, amount: item.amount_cents, item })),
    ...invoices.map((row): TimelineEntry => ({ type: "invoice", key: `invoice:${row.invoice.card_id}:${row.invoice.month}`, due: row.invoice.due_date, paid: row.paid, name: row.invoice.card_name, amount: row.invoice.total_cents, row })),
  ].sort(byDue);
  const paidEntries = entries.filter(entry => entry.paid);
  const totalCents = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const paidCents = paidEntries.reduce((sum, entry) => sum + entry.amount, 0);

  const billRow = (item: ChecklistItem) => {
    const busy = busyBillId === item.id;
    // R3-PAINEL-1: a closed month is history — "Não paga" (neutral), the same status as the invoices and Contas a pagar.
    const status = billStatus(item, month, today, locked, true);
    const due = dateInMonth(month, item.due_day);
    // R4-PAINEL-2: the date tile beside the pill already says "28 set" — the pill keeps the days, which must never be cut.
    const daysAhead = daysBetween(today, due);
    const autoLabel = daysAhead === 0 ? "Débito hoje" : daysAhead === 1 ? "Débito amanhã" : `Débito em ${daysLabel(daysAhead)}`;
    // R2-PAINEL-3: one status per row — an auto-debit bill still ahead reads "Débito em N dias" (auto-debit badge).
    const auto = item.auto_debit && !item.paid && !locked && status.tone !== "negative";
    const fullLabel = auto ? `Débito automático em ${due.slice(8, 10)}/${due.slice(5, 7)}` : billStatus(item, month, today, locked).label;
    return <li className={`timeline-item ${toneClass(item.paid, status.tone)}`.trim()} key={`bill:${item.id}`}>
      <TimelineDate date={due} />
      <button type="button" className="btn row bill-check" disabled={busy || Boolean(blocked)} title={blocked} aria-pressed={item.paid} aria-busy={busy || undefined} onClick={() => onToggleBill(item)}>
        <span className="check">
          {item.paid ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
          <span><b title={item.name}>{item.name}</b><small>{busy ? "Atualizando…" : auto
            ? <span className="badge auto-debit" title={fullLabel}>{autoLabel}</span>
            : <Badge tone={status.tone} title={fullLabel !== status.label ? fullLabel : undefined}>{status.label}</Badge>}</small></span>
        </span>
      </button>
      <span className="timeline-amount">
        <Money cents={item.amount_cents} currency={item.currency} />
        {!item.paid && <button type="button" className="icon-btn" disabled={busy || Boolean(blocked)} aria-label={`Pagar ${item.name} com detalhes`} title={blocked ?? "Pagar com detalhes"} onClick={() => openModal("bill-payment", { bill_id: item.id, month, name: item.name, amount: item.amount_cents })}>
          <SlidersHorizontal size={16} aria-hidden="true" />
        </button>}
      </span>
    </li>;
  };

  const invoiceRow = (row: InvoiceDueRow) => {
    const { invoice } = row;
    const title = invoiceRowTitle(invoice);
    return <li className={`timeline-item is-invoice ${toneClass(row.paid, row.status.tone)}`.trim()} key={`invoice:${invoice.card_id}:${invoice.month}`}>
      <TimelineDate date={invoice.due_date} />
      <div className="timeline-invoice">
        <span className="timeline-invoice-logo"><BrandBadge brand={invoice.brand} name={invoice.card_name} kind="bank" size={18} decorative /></span>
        {/* R3-PAINEL-3: "Fatura de agosto" says which bill this is when a card has two rows (e.g. an overdue one). */}
        <span><b title={title}>{invoice.card_name}</b><small><span className="timeline-invoice-month">{invoiceMonthText(invoice.month, month)}</span><Badge tone={row.status.tone}>{row.status.label}</Badge></small></span>
      </div>
      <span className="timeline-amount">
        <Money cents={invoice.total_cents} />
        {!row.paid && <button type="button" className="icon-btn" disabled={Boolean(blocked)} aria-label={`Pagar ${title}`} title={blocked ?? "Pagar fatura"}
          onClick={() => openModal("invoice-payment", { card_id: invoice.card_id, card_name: invoice.card_name, month: invoice.month, total_cents: invoice.total_cents, due_date: invoice.due_date })}>
          <CreditCard size={16} aria-hidden="true" />
        </button>}
      </span>
    </li>;
  };

  return <WidgetFrame id="contas" className="tour-checklist" {...state}
    description={entries.length ? `${fmt(paidCents)} de ${fmt(totalCents)} pagos${missingNote}` : `Compromissos de ${formatMonthLabel(month)}${missingNote}`}
    aside={entries.length > 0 ? <Badge tone={paidEntries.length === entries.length ? "positive" : "neutral"}>{paidEntries.length} de {entries.length} pagas</Badge> : undefined}>
    {entries.length ? <>
      <ol className="timeline" aria-label="Vencimentos do mês">
        {entries.map(entry => (entry.type === "bill" ? billRow(entry.item) : invoiceRow(entry.row)))}
      </ol>
      <p className="muted kpi-hint">{locked
        ? "Mês fechado: reabra o mês para marcar ou desmarcar pagamentos."
        : <>Marcar como paga lança a despesa no mês; o botão ao lado informa data, valor ou conta.{invoices.length > 0 && <>{" "}
          <a className="widget-link" href="#/cartoes" onClick={event => { event.preventDefault(); onOpenCards(); }}>Faturas em Cartões<ArrowRight size={13} aria-hidden="true" /></a></>}</>}</p>
    </> : invoicesMissing ? <p className="muted">{offline ? "Sem dados das faturas de cartão enquanto o servidor estiver fora." : "Não foi possível carregar as faturas de cartão."}</p>
      : <EmptyState compact icon={CalendarClock} title="Nenhuma conta a pagar" description="Cadastre as contas fixas do mês para acompanhar os pagamentos." actionLabel="Nova conta a pagar" onAction={() => openModal("bill")} />}
  </WidgetFrame>;
}

function CategoryLine({ row, expenses, category }: { row: CategoryRow; expenses: number; category?: Category }) {
  const fmt = useMoneyFormat();
  const level = budgetLevel(row.spent, row.budget);
  const name = <span className="budget-name"><CategoryIcon icon={category?.icon} color={category?.color} name={row.name} kind="expense" size="sm" /><b>{row.name}</b>{!row.active && <> <span className="muted">(removido)</span></>}</span>;
  // R3-PAINEL-5: two levels per row (name | amount, then bar + one status line); a badge only when the budget is exceeded,
  // like Categorias.
  if (level === "none") return <li className="stack budget-line">
    <div className="row">{name}<Money cents={row.spent} /></div>
    <small className="muted"><span>Sem orçamento</span> · {row.spent > 0 ? `${percent(row.spent, expenses)}% dos gastos do mês` : "sem gastos no mês"}</small>
  </li>;
  const used = formatProgress(row.spent, row.budget);
  const over = level === "over";
  return <li className="stack budget-line">
    <div className="row">{name}<span className="amount-of"><Money cents={row.spent} /><small className="muted">de {fmt(row.budget)}</small></span></div>
    <div className="budget-meter">
      <ProgressBar value={Math.min(100, progressRatio(row.spent, row.budget) * 100)} tone={over ? "danger" : level === "near" ? "warning" : undefined} label={`Orçamento de ${row.name}`} valueText={over ? "Orçamento excedido" : `${used} do orçamento`} />
      {over ? <Badge tone={budgetBadge.over.tone}><span className="sr-only">{budgetBadge.over.label}: </span>{fmt(row.spent - row.budget)} acima</Badge>
        : level === "near" ? <small className="budget-status is-near">{budgetBadge.near.label} · {used}</small>
        : <small className="muted budget-status">Restam {fmt(row.budget - row.spent)} · {used}</small>}
    </div>
  </li>;
}

/** orcamento — spending vs budget per category with status badges. */
export function BudgetWidget({ rows, categories, uncategorized, expenses, openModal, onOpenCategories, state }: { rows: CategoryRow[]; categories: Category[]; uncategorized: number; expenses: number; openModal: OpenModal; onOpenCategories?: () => void; state: ChartWidgetState }) {
  const relevant = rows.filter(row => row.budget > 0 || row.spent > 0);
  const shown = relevant.slice(0, BUDGET_ROWS);
  const hidden = relevant.length - shown.length;
  const byId = new Map(categories.map(category => [category.id, category]));
  return <WidgetFrame id="orcamento" className="tour-budget" description="Gastos do mês comparados ao orçamento de cada categoria." aside={<Money cents={expenses} className="widget-total" />} {...state}>
    {shown.length || uncategorized > 0 ? <ul className="stack list" aria-label="Categorias de gasto">
      {shown.map(row => <CategoryLine key={row.id} row={row} expenses={expenses} category={byId.get(row.id)} />)}
      {uncategorized > 0 && <li className="stack">
        <div className="row"><span><b>Sem categoria</b></span><Money cents={uncategorized} /></div>
        <small className="muted">{percent(uncategorized, expenses)}% dos gastos do mês não têm categoria.</small>
      </li>}
      {hidden > 0 && <li>{onOpenCategories
        ? <a className="widget-link" href="#/categorias" onClick={event => { event.preventDefault(); onOpenCategories(); }}>Mais {hidden} {hidden === 1 ? "categoria" : "categorias"} em Categorias<ArrowRight size={13} aria-hidden="true" /></a>
        : <small className="muted">Mais {hidden} {hidden === 1 ? "categoria" : "categorias"} na página Categorias.</small>}</li>}
    </ul> : rows.length
      ? <EmptyState compact icon={Tags} title="Nenhum gasto no mês" description="Os gastos registrados aparecerão aqui, comparados ao orçamento de cada categoria." />
      : <EmptyState compact icon={Tags} title="Nenhuma categoria de gasto" description="Crie categorias com orçamento para saber quando um tipo de gasto está perto do limite." actionLabel="Nova categoria" onAction={() => openModal("category")} />}
  </WidgetFrame>;
}

/** metas — progress per goal; "Registrar aporte" is disabled while the current month is closed (MEL-44). */
export function GoalsWidget({ goals, reserveGoalId, openModal, lockedReason, state }: { goals: Goal[]; reserveGoalId: number | null; openModal: OpenModal; lockedReason?: string; state: ChartWidgetState }) {
  const fmt = useMoneyFormat();
  const shown = goals.slice(0, MAX_ROWS);
  return <WidgetFrame id="metas" className="tour-goals" description="Quanto falta para cada objetivo." {...state}>
    {shown.length ? <ul className="stack list" aria-label="Progresso das metas">
      {shown.map(goal => {
        const reached = goal.current_cents >= goal.target_cents;
        // R3-PAINEL-2 / decision 3: the same percentage as Metas and Configurações ("1,7%", never "2%").
        const done = formatProgress(goal.current_cents, goal.target_cents);
        return <li className="stack" key={goal.id}>
          {/* R1-PAINEL-6: name | amount | action as grid columns — the amount can never slide under the button */}
          <div className="goal-line">
            <span className="goal-line-name"><b>{goal.name}</b>{goal.id === reserveGoalId && <> <Badge tone="positive">Reserva</Badge></>}</span>
            <span className="amount-of"><Money cents={goal.current_cents} currency={goal.currency} /><small className="muted">de {fmt(goal.target_cents, goal.currency)}</small></span>
            <button type="button" className="icon-btn" disabled={Boolean(lockedReason)} aria-label={`Registrar aporte em ${goal.name}`} title={lockedReason ?? "Registrar aporte"} onClick={() => openModal("goal-entry", { goal_id: goal.id })}><PiggyBank size={16} aria-hidden="true" /></button>
          </div>
          <ProgressBar value={Math.min(100, progressRatio(goal.current_cents, goal.target_cents) * 100)} tone={reached ? "gold" : undefined} label={`Progresso de ${goal.name}`} valueText={`${done} da meta`} />
          <small className="muted">{reached ? "Meta atingida" : `Faltam ${fmt(goal.target_cents - goal.current_cents, goal.currency)} · ${done}`}</small>
        </li>;
      })}
      {goals.length > shown.length && <li><small className="muted">Mais {goals.length - shown.length} na página Metas.</small></li>}
    </ul> : <EmptyState compact icon={Target} title="Nenhuma meta criada" description="Crie uma meta quando tiver um objetivo financeiro para acompanhar." actionLabel="Nova meta" onAction={() => openModal("goal")} />}
  </WidgetFrame>;
}

/** assinaturas — recurring cost in monthly equivalent, with brand badges and the charge of the month. */
export function SubscriptionsWidget({ finance, openModal, state }: { finance: FinanceState; openModal: OpenModal; state: ChartWidgetState }) {
  const fmt = useMoneyFormat();
  const rows = finance.subscriptions
    .map(item => ({ item, monthly: monthlyEquivalentCents(item.amount_cents, item.frequency) }))
    .sort((left, right) => right.monthly - left.monthly);
  const total = rows.reduce((sum, row) => sum + row.monthly, 0);
  const shown = rows.slice(0, MAX_ROWS);
  const today = todayISO();
  const activeCards = new Set(finance.cards.map(card => card.id));
  return <WidgetFrame id="assinaturas" description="Custo recorrente em equivalente mensal." aside={rows.length > 0 ? <span className="widget-total">{fmt(total)}/mês</span> : undefined} {...state}>
    {shown.length ? <ul className="list" aria-label="Assinaturas ativas">
      {shown.map(({ item, monthly }) => {
        const charged = chargedLabel(item, today);
        const cardRemoved = item.card_id !== null && !activeCards.has(item.card_id);
        return <li className="list-item" key={item.id}>
          <BrandBadge brand={item.brand} name={item.name} kind="service" size="sm" decorative />
          <div className="list-main"><b>{item.name}{charged && <>{" "}<Badge tone="positive">{charged}</Badge></>}{item.auto_debit && <>{" "}<span className="badge auto-debit">Débito automático</span></>}</b>
            <small className="muted">{labelFor(subscriptionFrequencyLabels, item.frequency)}{item.frequency !== "monthly" ? ` · ${fmt(item.amount_cents, item.currency)}` : ""} · {item.card_name ? `${item.card_name}${cardRemoved ? " (removido)" : ""}` : item.account_name ?? "Sem cartão"}</small></div>
          <div className="list-amount">{fmt(monthly, item.currency)}/mês</div>
        </li>;
      })}
      {rows.length > shown.length && <li className="list-item"><small className="muted">Mais {rows.length - shown.length} na página Assinaturas.</small></li>}
    </ul> : <EmptyState compact icon={Tv} title="Nenhuma assinatura" description="Cadastre apenas os serviços recorrentes que você realmente utiliza." actionLabel="Nova assinatura" onAction={() => openModal("subscription")} />}
  </WidgetFrame>;
}
