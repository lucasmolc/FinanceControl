import { useState, type ReactNode } from "react";
import { CalendarClock, CheckCircle2, Eye, History, Link2, PiggyBank, RotateCcw, Target, Undo2, Unlink, Wallet } from "lucide-react";
import { api, errorMessage, isConnectivityError } from "../../api/client";
import { Badge, EmptyState, LinkedName, Money, PageHeader, RowActions, StatStrip } from "../../components/ui";
import { BrandBadge } from "../../components/ui/BrandBadge";
import { CategoryIcon } from "../../components/ui/CategoryIcon";
import { DataTable, RowMenu, type DataTableColumn } from "../../components/ui/DataTable";
import { recordMenuItems } from "../../components/ui/DataTable/menuItems";
import { Progress } from "../../components/ui/Progress";
import { useConfirm } from "../../components/useConfirm";
import { useMarketRates } from "../../hooks/useMarketRates";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { useGoalEntries } from "../../hooks/useStatement";
import { currencyOf } from "../../lib/currencies";
import { currentMonth, formatDate, formatMonthLabel, todayISO } from "../../lib/date";
import { countLabel, goalTypeLabels, labelFor, monthsLabel } from "../../lib/labels";
import { formatProgress } from "../../lib/progress";
import { isRemoving } from "../../lib/removing";
import type { CardInvoiceRow, Goal, PageProps, Settings } from "../../types";
import { HistoryDialog } from "../history/HistoryDialog";
import { goalEntryRows } from "../history/historyRows";
import { isMonthClosed, MONTH_CLOSED } from "../closing/closingModel";
import { goalTypeIcon } from "../records/optionIcons";
import { baseTotal, hasForeignCurrency, missingRatesNote } from "../wealth/conversion";
import { autoDebitAhead, billDisplayStatus, billTotals, buildBillRows, sortBillsForAction, type BillRow } from "./billStatus";
import { formatDayMonth } from "./dueDates";
import { buildInvoiceRows, invoiceMonthTitle, invoiceRowTitle, type InvoiceDueRow } from "./invoiceRows";
import { InvoiceDialog } from "../catalog/InvoiceDialog";
import { MonthCloseBar } from "../closing/MonthCloseBar";
import { blockedReason, OFFLINE_REASON } from "../records/offline";
import { useAsyncList } from "../../hooks/useAsyncList";
import { goalProgress } from "./goalProgress";
import { isAutoReserveGoal } from "./reserveModel";
import { AutoGoalsNotice } from "./AutoGoalsNotice";

/** Error toast (MEL-28) with a plain notice as fallback when the host gives no `notifyError`. */
const reportError = (notifyError: PageProps["notifyError"], notify: PageProps["notify"]) => (reason: unknown) =>
  notifyError ? notifyError(reason) : notify(errorMessage(reason));

// ── Contas a pagar ───────────────────────────────────────────────────────────

/** Name cell: service badge + name + auto-debit badge (MEL-29/39). */
function BillName({ row, closed }: { row: BillRow; closed: boolean }) {
  const { bill } = row;
  // R2-BILLS-3: while the debit is ahead the status already says "Débito automático em …"; the name keeps only the account.
  const ahead = autoDebitAhead(row, closed);
  return <div className="entity-cell">
    <BrandBadge brand={bill.brand} name={bill.name} kind="service" size={28} decorative />
    <div className="entity-text">
      <span className="entity-name">{bill.name}</span>
      {bill.auto_debit && (ahead
        ? bill.account_name ? <small className="muted">Débito em {bill.account_name}</small> : null
        : <small><span className="badge auto-debit">Débito automático</span>{bill.account_name ? <span className="muted"> · {bill.account_name}</span> : null}</small>)}
    </div>
  </div>;
}

/** Card invoice name cell (R1-BILLS-2): card mark + "Fatura Nubank · Agosto/2026". */
function InvoiceName({ row }: { row: InvoiceDueRow }) {
  const { invoice } = row;
  return <div className="entity-cell">
    <BrandBadge brand={invoice.brand} name={invoice.card_name} kind="bank" size={28} decorative />
    <div className="entity-text">
      <span className="entity-name" title={invoiceRowTitle(invoice)}>{invoiceRowTitle(invoice)}</span>
      <small className="muted">{row.carried ? "Fatura de um mês anterior ainda em aberto" : `${invoice.items_count} ${invoice.items_count === 1 ? "compra" : "compras"} no cartão`}</small>
    </div>
  </div>;
}

export function BillsPage({ state, month, summary, checklist, version, openModal, openEdit, onRemove, notify, notifyError, refresh, removing, onReopenMonth, offline }: PageProps) {
  const confirm = useConfirm();
  const format = useMoneyFormat();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<CardInvoiceRow | null>(null);
  const today = todayISO();
  // MEL-22: payments of a closed month cannot change; R1-BILLS-1: its unpaid bills read "Não paga", not "Vencida".
  const closed = isMonthClosed(summary, month);
  const lockReason = blockedReason(offline, closed ? MONTH_CLOSED : undefined);
  const add = () => openModal("bill");
  const rows = sortBillsForAction(buildBillRows(state.bills, checklist, state.categories, month, today, { closed }));
  // R1-BILLS-2: card invoices due this month (and earlier ones still unpaid) sit next to the bills.
  const invoiceList = useAsyncList(() => api.cardInvoicesDue(month), state.cards.length ? `due-invoices:${month}:${version}` : null);
  const invoicesLoaded = invoiceList.loadedKey?.startsWith(`due-invoices:${month}:`) ?? false;
  const invoiceRows = invoicesLoaded ? buildInvoiceRows(invoiceList.items, month, today, closed) : [];
  // R3-BILLS-1 / decisions 1-2: without the invoices the totals say so next to the numbers, and the invoice section says
  // why it is missing (offline: no retry here — the global banner has it).
  const invoicesDisconnected = Boolean(offline) || (invoiceList.error !== null && isConnectivityError(invoiceList.error));
  const invoicesMissing = state.cards.length > 0 && !invoicesLoaded && (invoicesDisconnected || invoiceList.error !== null);
  const withoutInvoices = (hint: ReactNode) => invoicesMissing ? <>{hint} · <b>sem as faturas de cartão</b></> : hint;
  const totals = billTotals(rows);
  const { rates } = useMarketRates(hasForeignCurrency(state.bills));
  const inBase = (items: BillRow[]) => baseTotal(items.map(row => ({ minor: row.bill.amount_cents, currency: row.bill.currency })), rates);
  const invoiceSum = (items: InvoiceDueRow[]) => items.reduce((sum, row) => sum + row.invoice.total_cents, 0);
  const overdueInvoices = invoiceRows.filter(row => !row.paid && row.daysUntil < 0 && !closed);
  const paidInvoices = invoiceRows.filter(row => row.paid);
  const pendingInvoices = invoiceRows.filter(row => !row.paid);
  const total = inBase(rows);
  const paid = inBase(rows.filter(row => row.paid));
  const pending = inBase(rows.filter(row => !row.paid));
  const overdueRows = closed ? [] : rows.filter(row => !row.paid && row.daysUntil < 0);
  const overdue = inBase(overdueRows);
  const totalCents = total.cents + invoiceSum(invoiceRows);
  const paidCents = paid.cents + invoiceSum(paidInvoices);
  const pendingCents = pending.cents + invoiceSum(pendingInvoices);
  const overdueCount = overdueRows.length + overdueInvoices.length;
  const overdueCents = overdue.cents + invoiceSum(overdueInvoices);
  const itemCount = rows.length + invoiceRows.length;
  const paidCount = totals.paidCount + paidInvoices.length;
  const monthLabel = formatMonthLabel(month);
  const categoriesById = new Map(state.categories.map(category => [category.id, category]));
  const autoCount = rows.filter(row => row.bill.auto_debit).length;
  // Next due item among bills and invoices (overdue ones are counted apart).
  const nextInvoice = pendingInvoices.filter(row => row.daysUntil >= 0).sort((left, right) => left.invoice.due_date.localeCompare(right.invoice.due_date))[0] ?? null;
  const nextBill = totals.next;
  const next = nextBill && (!nextInvoice || nextBill.dueDate <= nextInvoice.invoice.due_date)
    ? { name: nextBill.bill.name, date: nextBill.dueDate, amount: format(nextBill.bill.amount_cents, nextBill.bill.currency), status: billDisplayStatus(nextBill, closed), auto: autoDebitAhead(nextBill, closed) }
    : nextInvoice ? { name: invoiceRowTitle(nextInvoice.invoice), date: nextInvoice.invoice.due_date, amount: format(nextInvoice.invoice.total_cents), status: nextInvoice.status, auto: false } : null;

  async function reopen(row: BillRow) {
    const confirmed = await confirm({
      title: `Reabrir o pagamento de "${row.bill.name}"?`,
      message: (row.transactionId
        ? `A conta volta a ficar pendente em ${monthLabel} e a despesa lançada no pagamento é removida (o saldo da conta usada é restaurado).`
        : `A conta volta a ficar pendente em ${monthLabel}.`)
        + (row.bill.auto_debit ? " O débito automático não será refeito neste mês." : ""),
      confirmLabel: "Reabrir pagamento",
      cancelLabel: "Cancelar",
      tone: "primary",
    });
    if (!confirmed) return;
    setBusyId(row.bill.id);
    try {
      await api.setChecklist({ bill_id: row.bill.id, month, paid: false });
      await refresh();
      notify(row.transactionId ? "Pagamento reaberto; o lançamento vinculado foi removido." : "Pagamento reaberto.");
    } catch (reason) {
      reportError(notifyError, notify)(reason);
    } finally {
      setBusyId(null);
    }
  }

  // R2-BILLS-2: every "Pagar" is secondary — the overdue rows already lead the list with a red status, so no single
  // button gets an emphasis whose rule the page never states.
  const pay = (row: BillRow) => openModal("bill-payment", { bill_id: row.bill.id, month, name: row.bill.name, amount: row.bill.amount_cents });
  const payInvoice = ({ invoice }: InvoiceDueRow) => openModal("invoice-payment", {
    card_id: invoice.card_id, card_name: invoice.card_name, month: invoice.month, total_cents: invoice.total_cents, due_date: invoice.due_date,
  });
  const note = missingRatesNote(total.missing);
  const payAction = (row: BillRow) => {
    const { bill } = row;
    // CR-18: short labels keep the column width stable after paying. R2-BILLS-3: a debit still ahead reads "Pagar antes".
    const early = autoDebitAhead(row, closed);
    return row.paid
      ? <button type="button" className="btn small ghost bill-action" disabled={busyId === bill.id || Boolean(lockReason)} title={lockReason} aria-label={`Reabrir pagamento de ${bill.name}`} onClick={() => void reopen(row)}><RotateCcw size={14} aria-hidden="true" />{busyId === bill.id ? "Reabrindo…" : "Reabrir"}</button>
      : <button type="button" className={`btn small bill-action${early ? " ghost" : ""}`} disabled={Boolean(lockReason)} title={lockReason} aria-label={`${early ? "Pagar antes" : "Pagar"} ${bill.name}`} onClick={() => pay(row)}><Wallet size={14} aria-hidden="true" />{early ? "Pagar antes" : "Pagar"}</button>;
  };
  const invoiceAction = (row: InvoiceDueRow) => row.paid ? null
    : <button type="button" className="btn small bill-action" disabled={Boolean(lockReason)} title={lockReason} aria-label={`Pagar ${invoiceRowTitle(row.invoice)}`} onClick={() => payInvoice(row)}><Wallet size={14} aria-hidden="true" />Pagar fatura</button>;
  const categoryCell = (row: BillRow) => {
    const category = row.bill.category_id !== null ? categoriesById.get(row.bill.category_id) : undefined;
    return <span className="entity-cell compact">
      {(category || row.categoryName) && <CategoryIcon icon={category?.icon} color={category?.color} name={row.categoryName} kind="expense" size="sm" />}
      <LinkedName name={row.categoryName} removed={row.bill.category_id !== null && !category} fallback="Sem categoria" />
    </span>;
  };

  const columns: DataTableColumn<BillRow>[] = [
    { id: "name", header: "Conta", className: "col-name", sortValue: row => row.bill.name, cell: row => <BillName row={row} closed={closed} /> },
    { id: "category", header: "Categoria", sortValue: row => row.categoryName ?? "", cell: categoryCell },
    { id: "due", header: "Vencimento", sortValue: row => row.dueDate, cell: row => <div>{formatDate(row.dueDate)}{row.clamped && <small>Dia {row.bill.due_day} não existe neste mês; vence no último dia.</small>}</div> },
    { id: "amount", header: "Valor", align: "right", sortValue: row => row.bill.amount_cents, cell: row => <Money cents={row.bill.amount_cents} currency={row.bill.currency} /> },
    { id: "status", header: "Situação", className: "col-status", sortValue: row => (row.paid ? 100_000 : row.daysUntil), cell: row => { const status = billDisplayStatus(row, closed); return <Badge tone={status.tone}>{status.label}</Badge>; } },
    { id: "actions", header: "", actions: true, className: "bill-actions", cell: row => <RowActions label={row.bill.name} removing={isRemoving(removing, "bills", row.bill.id)} disabledReason={offline ? OFFLINE_REASON : undefined} onEdit={() => openEdit("bill", row.bill)} onRemove={() => onRemove("bills", row.bill.id, row.bill.name)}>{payAction(row)}</RowActions> },
  ];
  const invoiceColumns: DataTableColumn<InvoiceDueRow>[] = [
    { id: "name", header: "Fatura", className: "col-name", sortValue: row => row.invoice.card_name, cell: row => <InvoiceName row={row} /> },
    { id: "due", header: "Vencimento", sortValue: row => row.invoice.due_date, cell: row => formatDate(row.invoice.due_date) },
    { id: "amount", header: "Valor", align: "right", sortValue: row => row.invoice.total_cents, cell: row => <Money cents={row.invoice.total_cents} /> },
    { id: "status", header: "Situação", className: "col-status", sortValue: row => (row.paid ? 100_000 : row.daysUntil), cell: row => <Badge tone={row.status.tone}>{row.status.label}</Badge> },
    { id: "actions", header: "", actions: true, className: "bill-actions", cell: row => <div className="row-actions">
      {invoiceAction(row)}
      <button type="button" className="icon-btn" aria-label={`Ver ${invoiceRowTitle(row.invoice)}`} title="Ver fatura" onClick={() => setViewing(row.invoice)}><Eye size={16} aria-hidden="true" /></button>
    </div> },
  ];

  const hasItems = rows.length > 0 || invoiceRows.length > 0 || invoicesMissing;
  return <>
    <PageHeader title={`Compromissos de ${monthLabel}`} description="Vencidas no topo, pagas no fim. Ao pagar, a despesa é lançada; o débito automático paga sozinho no vencimento." actionLabel="Nova conta a pagar" onAction={add} actionDisabledReason={offline ? OFFLINE_REASON : undefined} />
    {/* R1-BILLS-5: the same closed-month banner as Painel and Lançamentos. */}
    <MonthCloseBar month={month} summary={summary} onReopenMonth={onReopenMonth} />
    {hasItems ? <>
      <StatStrip label={`Resumo de ${monthLabel}`} items={[
        // R3-BILLS-3: counts only ("5 contas · 3 faturas"); the automatic debits are told with the next due item.
        { label: "Total do mês", value: <Money cents={totalCents} />, hint: withoutInvoices(note ?? [countLabel(rows.length, "conta", "contas"), invoiceRows.length ? countLabel(invoiceRows.length, "fatura", "faturas") : null].filter(Boolean).join(" · ")) },
        { label: "Pago", value: <Money cents={paidCents} />, tone: paidCents > 0 ? "positive" : undefined, hint: withoutInvoices(pendingCents > 0 ? <>{paidCount} de {itemCount} · faltam <Money cents={pendingCents} /></> : `${paidCount} de ${itemCount} · tudo pago`) },
        closed
          ? { label: "Não pagas", value: pendingCents > 0 ? <Money cents={pendingCents} /> : "Nenhuma", hint: withoutInvoices(`${monthLabel} está fechado`) }
          : { label: "Em atraso", value: overdueCount ? <Money cents={overdueCents} /> : "Nenhuma", tone: overdueCount ? "negative" : undefined,
            hint: withoutInvoices(overdueCount ? [overdueRows.length ? countLabel(overdueRows.length, "conta vencida", "contas vencidas") : null, overdueInvoices.length ? countLabel(overdueInvoices.length, "fatura vencida", "faturas vencidas") : null].filter(Boolean).join(" · ") : "Nada vencido") },
        { label: "Próximo vencimento", value: next ? next.name : "Nenhum", tone: next && next.status.tone === "warning" ? "warning" : undefined,
          // R2-BILLS-3 / R3-BILLS-2: the status already carries the date ("vence em 28/09 (10 dias)", "débito automático em 22/09 (4 dias)").
          hint: [
            next ? next.auto || next.status.label.includes(formatDayMonth(next.date)) ? `${next.amount} · ${next.status.label.toLowerCase()}` : `${formatDayMonth(next.date)} · ${next.amount} · ${next.status.label.toLowerCase()}` : closed ? "Mês encerrado" : overdueCount ? "Só restam os itens em atraso" : "Nada mais a pagar no mês",
            // R4-BILLS-1: when the next item is itself an automatic debit, its status already says so.
            autoCount && !next?.auto ? `${autoCount} em débito automático` : null,
          ].filter(Boolean).join(" · ") },
      ]} />
      {invoicesMissing && <section className="bills-invoices" aria-label={`Faturas de cartão de ${monthLabel}`}>
        <h3 className="section-title">Faturas de cartão</h3>
        {invoicesDisconnected
          ? <p className="page-offline-note" role="status">Sem dados enquanto o servidor estiver fora. As faturas de cartão aparecem quando ele voltar e só então entram nos totais acima.</p>
          : <p className="field-hint" role="status">Não foi possível carregar as faturas de cartão; os totais acima estão sem elas. <button type="button" className="btn small ghost" onClick={() => void invoiceList.reload()}>Tentar novamente</button></p>}
      </section>}
      {invoiceRows.length > 0 && <section className="bills-invoices" aria-label={`Faturas de cartão de ${monthLabel}`}>
        <h3 className="section-title">Faturas de cartão</h3>
        <DataTable rows={invoiceRows} columns={invoiceColumns} rowKey={row => `${row.invoice.card_id}:${row.invoice.month}`} caption={`Faturas de cartão a pagar em ${monthLabel}`} rowLabel={row => invoiceRowTitle(row.invoice)}
          rowClassName={row => (row.daysUntil < 0 && !row.paid && !closed ? "is-overdue" : undefined)}
          compactOnOverflow className="records-compact"
          compact={{
            leading: ({ invoice }) => <BrandBadge brand={invoice.brand} name={invoice.card_name} kind="bank" size={28} decorative />,
            // R2-BILLS-1: on phones the month is the title and the card the subtitle, so two Nubank invoices never look alike.
            title: ({ invoice }) => <span title={invoiceRowTitle(invoice)}>{invoiceMonthTitle(invoice)}</span>,
            meta: row => [row.invoice.card_name, `Vence ${formatDayMonth(row.invoice.due_date)}`, row.carried ? "mês anterior" : null],
            amount: ({ invoice }) => <Money cents={invoice.total_cents} />,
            aside: row => <Badge tone={row.status.tone}>{row.status.label}</Badge>,
            detail: row => row.paid ? null : <div className="compact-cta">{invoiceAction(row)}</div>,
            actions: row => <button type="button" className="icon-btn" aria-label={`Ver ${invoiceRowTitle(row.invoice)}`} onClick={() => setViewing(row.invoice)}><Eye size={16} aria-hidden="true" /></button>,
          }} />
      </section>}
      {rows.length > 0 && <section className="bills-list" aria-label={`Contas de ${monthLabel}`}>
        {invoiceRows.length > 0 && <h3 className="section-title">Contas</h3>}
        <DataTable rows={rows} columns={columns} rowKey={row => row.bill.id} caption={`Contas a pagar de ${monthLabel}`} rowLabel={row => row.bill.name}
          rowClassName={row => [row.daysUntil < 0 && !row.paid && !closed ? "is-overdue" : "", isRemoving(removing, "bills", row.bill.id) ? "is-removing" : ""].filter(Boolean).join(" ") || undefined}
          compactOnOverflow className="records-compact"
          compact={{
            leading: ({ bill }) => <BrandBadge brand={bill.brand} name={bill.name} kind="service" size={28} decorative />,
            title: ({ bill }) => bill.name,
            meta: row => [`Vence ${formatDayMonth(row.dueDate)}`, row.categoryName ?? "Sem categoria"],
            amount: row => <Money cents={row.bill.amount_cents} currency={row.bill.currency} />,
            aside: row => <Badge tone={row.status.tone}>{autoDebitAhead(row, closed) ? `Déb. auto ${formatDayMonth(row.dueDate)}` : row.status.label}</Badge>,
            // R1-BILLS-4: "Pagar" stays visible on phones, on its own line under the row; the rest lives in the menu.
            detail: row => !row.paid && !isRemoving(removing, "bills", row.bill.id) ? <div className="compact-cta">{payAction(row)}</div> : null,
            actions: row => <div className="row-actions">
              <RowMenu label={row.bill.name} removing={isRemoving(removing, "bills", row.bill.id)} items={recordMenuItems({
                before: [row.paid ? { label: "Reabrir pagamento", icon: RotateCcw, onSelect: () => void reopen(row), disabled: Boolean(lockReason) || busyId === row.bill.id, disabledReason: lockReason } : null],
                disabledReason: offline ? OFFLINE_REASON : undefined,
                onEdit: () => openEdit("bill", row.bill),
                onRemove: () => onRemove("bills", row.bill.id, row.bill.name),
              })} />
            </div>,
          }} />
      </section>}
    </> : <EmptyState icon={CalendarClock} title={state.bills.length ? `Nenhuma conta em ${monthLabel}` : "Nenhuma conta a pagar"}
      description={state.bills.length ? "As contas cadastradas começam a valer a partir do mês em que foram criadas." : "Cadastre compromissos que se repetem todo mês, como aluguel, internet ou energia, e acompanhe o que já foi pago."}
      actionLabel={state.bills.length || offline ? undefined : "Nova conta a pagar"} onAction={add} />}
    {viewing && <InvoiceDialog cardId={viewing.card_id} cardName={viewing.card_name} month={viewing.month} version={version} onClose={() => setViewing(null)} />}
  </>;
}

// ── Metas ────────────────────────────────────────────────────────────────────

type LinkedState = "auto" | "manual" | "freedom" | null;

/**
 * MEL-43: the settings-linked emergency goal, automatic (salary × months) or detached. R1 decision 3: the linked freedom
 * goal ("Número da liberdade") follows the invested wealth — its saved amount is never typed.
 */
const linkedState = (settings: Settings, goal: Goal): LinkedState => {
  if (settings.freedom_goal_id === goal.id && (settings.freedom_goal_status ?? "linked") === "linked") return "freedom";
  if (settings.emergency_goal_id !== goal.id) return null;
  return isAutoReserveGoal(settings, goal.id) ? "auto" : "manual";
};

interface GoalCardProps {
  goal: Goal; today: string; removing: boolean; linked: LinkedState; settings: Settings; lockReason?: string; busy: boolean; featured?: boolean;
  onContribute: () => void; onWithdraw: () => void; onHistory: () => void; onEdit: () => void; onRemove: () => void; onDetach: () => void; onRelink: () => void; onComplete: () => void;
}

function GoalCard({ goal, today, removing, linked, settings, lockReason, busy, featured = false, onContribute, onWithdraw, onHistory, onEdit, onRemove, onDetach, onRelink, onComplete }: GoalCardProps) {
  const format = useMoneyFormat();
  const progress = goalProgress(goal, today);
  const currency = currencyOf(goal.currency).code;
  // R3 decision 3 (R3-METAS-1): the same percentage as Painel and Configurações ("1,7%", not "1%").
  const percentText = formatProgress(goal.current_cents, goal.target_cents);
  const disabled = removing || busy;
  const freedom = linked === "freedom";
  // CR-19: the linked reserve is always a reserve, whatever type it was created with.
  const type = linked === "auto" || linked === "manual" ? "emergency" : freedom ? "retirement" : goal.type;
  const deadline = (() => {
    if (progress.reached) return <span className="achievement">Meta atingida</span>;
    if (freedom) return <span className="muted">Cresce com os seus investimentos; aportes em Investimentos contam aqui.</span>;
    if (!goal.target_date) return <span className="muted">Sem prazo definido</span>;
    if (progress.overdue) return <Badge tone="negative">Prazo encerrado em {formatDate(goal.target_date)}</Badge>;
    return <span>≈ <b>{format(progress.monthlyNeededCents ?? 0, currency)}/mês</b> até {formatDate(goal.target_date)} <span className="muted">({monthsLabel(progress.monthsLeft ?? 1)})</span></span>;
  })();
  const items = recordMenuItems({
    before: [
      !freedom && goal.current_cents > 0 ? { label: "Resgatar", icon: Undo2, onSelect: onWithdraw, disabled: disabled || Boolean(lockReason), disabledReason: lockReason } : null,
      { label: "Histórico", icon: History, onSelect: onHistory, disabled },
      linked === "auto" ? { label: "Desligar cálculo automático", icon: Unlink, onSelect: onDetach, disabled, description: "O alvo deixa de acompanhar o salário" } : null,
      linked === "manual" ? { label: "Voltar a acompanhar o salário", icon: Link2, onSelect: onRelink, disabled } : null,
    ],
    onEdit,
    onRemove,
  });
  // R1-METAS-3: one quiet action per card; a reached goal is concluded instead of receiving more money.
  const canComplete = progress.reached && linked === null;
  // R3-METAS-2: the type is carried by the icon on every card (named for assistive tech and on hover), never by a badge
  // on only some of them (R2-METAS-4: a badge repeated names like "Reserva de emergência").
  const typeLabel = labelFor(goalTypeLabels, type);
  return <article className={`card goal-card${progress.reached ? " is-achieved" : ""}${featured ? " is-featured" : ""}${removing ? " is-removing" : ""}`} aria-busy={removing || undefined}>
    <div className="card-header wealth-card-header">
      <span className="goal-icon" role="img" aria-label={typeLabel} title={typeLabel}>{goalTypeIcon(type)}</span>
      <div className="wealth-card-title"><h3>{goal.name}</h3>{currency !== "BRL" && <p className="tag-row"><Badge>{currency}</Badge></p>}</div>
      <RowMenu label={goal.name} removing={removing} items={items} />
    </div>
    {linked && <div className="reserve-row">
      {/* R1-METAS-4: every linked goal says so, with what drives it. */}
      <span className="badge reserve-badge">{linked === "manual" ? "Valor manual" : freedom ? "Automática · patrimônio" : "Automática"}</span>
      <small className="muted">{freedom
        ? `Alvo = ${settings.freedom_multiplier ?? 150} × ${format(settings.monthly_net_income_cents)} de salário líquido. O guardado é o seu patrimônio investido.`
        : linked === "auto"
          ? `Alvo = ${monthsLabel(settings.emergency_months_target)} × ${format(settings.monthly_net_income_cents)} de salário líquido.`
          : "O alvo não acompanha mais o salário. Para religar, use o menu da meta."}</small>
    </div>}
    <div className="goal-amounts">
      <div className="value compact-value"><Money cents={goal.current_cents} currency={currency} /></div>
      <p className="muted">{freedom ? <>Patrimônio investido · de {format(goal.target_cents, currency)}</> : <>de {format(goal.target_cents, currency)}</>}</p>
    </div>
    <Progress label={`Progresso de ${goal.name}`} value={Math.round(progress.percent)} valueText={`${percentText} da meta`} tone={progress.reached ? "positive" : "accent"} />
    <p className="muted goal-percent">{percentText} concluído{progress.reached ? "" : <> · Faltam <b>{format(progress.remainingCents, currency)}</b></>}</p>
    <p className="goal-deadline">{deadline}</p>
    {lockReason && !freedom && <p className="field-hint">{lockReason}</p>}
    {!freedom && <div className="card-actions">
      {canComplete
        // R2-METAS-1: concluding removes the goal from the list, so it is blocked offline like the other saves.
        ? <button type="button" className="btn" disabled={disabled || Boolean(lockReason)} title={lockReason} onClick={onComplete}><CheckCircle2 size={15} aria-hidden="true" />Concluir meta</button>
        : <button type="button" className="btn" disabled={disabled || Boolean(lockReason)} title={lockReason} onClick={onContribute}><PiggyBank size={15} aria-hidden="true" />Registrar aporte</button>}
    </div>}
  </article>;
}

export function GoalsPage({ state, version, summary, openModal, openEdit, onRemove, notify, notifyError, refresh, removing, offline }: PageProps) {
  const confirm = useConfirm();
  const format = useMoneyFormat();
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const history = useGoalEntries(historyId, version);
  const historyGoal = state.goals.find(goal => goal.id === historyId) ?? null;
  const today = todayISO();
  const add = () => openModal("goal");
  const settings = state.settings;
  // R1-METAS-2: the freedom number is a long-term milestone — it gets its own card and stays out of the KPIs.
  const freedomGoal = state.goals.find(goal => linkedState(settings, goal) === "freedom") ?? null;
  const goals = state.goals.filter(goal => goal !== freedomGoal);
  const { rates } = useMarketRates(hasForeignCurrency(goals));
  const target = baseTotal(goals.map(goal => ({ minor: goal.target_cents, currency: goal.currency })), rates);
  const saved = baseTotal(goals.map(goal => ({ minor: goal.current_cents, currency: goal.currency })), rates);
  const monthly = baseTotal(goals.map(goal => ({ minor: goalProgress(goal, today).monthlyNeededCents ?? 0, currency: goal.currency })), rates);
  const withDeadline = goals.filter(goal => goalProgress(goal, today).monthlyNeededCents !== null).length;
  const reached = goals.filter(goal => goalProgress(goal, today).reached).length;
  const inProgress = goals.length - reached;
  const missing = baseTotal(goals.map(goal => ({ minor: Math.max(0, goal.target_cents - goal.current_cents), currency: goal.currency })), rates);
  const note = missingRatesNote(saved.missing);
  // MEL-44: contributions default to today; a closed current month blocks them until reopened.
  const lockReason = blockedReason(offline, isMonthClosed(summary, currentMonth()) ? `${MONTH_CLOSED}: reabra o mês para registrar aportes e resgates.` : undefined);

  async function detach(goal: Goal) {
    const confirmed = await confirm({
      title: "Desligar o cálculo automático da reserva?",
      message: `O alvo de "${goal.name}" fica em ${format(goal.target_cents, goal.currency)} e deixa de acompanhar o salário líquido × meses de reserva. Você pode religar depois.`,
      confirmLabel: "Desligar",
      cancelLabel: "Manter automático",
      tone: "primary",
    });
    if (!confirmed) return;
    setBusyId(goal.id);
    try {
      await api.update("goals", goal.id, { target_cents: goal.target_cents, detach_auto: true });
      await refresh();
      notify("Cálculo automático da reserva desligado.", { label: "Desfazer", run: async () => { await api.createEmergencyGoal(); await refresh(); notify("A reserva voltou a acompanhar o salário."); } });
    } catch (reason) {
      reportError(notifyError, notify)(reason);
    } finally {
      setBusyId(null);
    }
  }

  async function relink(goal: Goal) {
    setBusyId(goal.id);
    try {
      await api.createEmergencyGoal();
      await refresh();
      notify("A reserva voltou a acompanhar o salário.");
    } catch (reason) {
      reportError(notifyError, notify)(reason);
    } finally {
      setBusyId(null);
    }
  }

  /** R1-METAS-3: a reached goal leaves the list (its history is kept) with "Desfazer". */
  async function complete(goal: Goal) {
    const confirmed = await confirm({
      title: `Concluir "${goal.name}"?`,
      message: `Parabéns! A meta sai da lista de objetivos com ${format(goal.current_cents, goal.currency)} guardados. O histórico continua salvo e você pode desfazer em seguida.`,
      confirmLabel: "Concluir meta",
      cancelLabel: "Manter na lista",
      tone: "primary",
    });
    if (!confirmed) return;
    setBusyId(goal.id);
    try {
      await api.remove("goals", goal.id);
      await refresh();
      notify(`Meta "${goal.name}" concluída.`, { label: "Desfazer", run: async () => { await api.restore("goals", goal.id); await refresh(); notify("A meta voltou para a lista."); } });
    } catch (reason) {
      reportError(notifyError, notify)(reason);
    } finally {
      setBusyId(null);
    }
  }

  const card = (goal: Goal, featured = false) => <GoalCard key={goal.id} goal={goal} today={today} removing={isRemoving(removing, "goals", goal.id)} featured={featured}
    linked={linkedState(settings, goal)} settings={settings} lockReason={lockReason} busy={busyId === goal.id}
    onContribute={() => openModal("goal-entry", { goal_id: goal.id })}
    onWithdraw={() => openModal("goal-entry", { goal_id: goal.id, kind: "withdrawal" })}
    onHistory={() => setHistoryId(goal.id)}
    onEdit={() => openEdit("goal", goal)}
    onRemove={() => onRemove("goals", goal.id, goal.name)}
    onDetach={() => void detach(goal)}
    onRelink={() => void relink(goal)}
    onComplete={() => void complete(goal)} />;

  return <>
    <PageHeader title="Seus objetivos" description="Quanto já foi guardado, quanto falta e quanto aportar por mês para chegar no prazo." actionLabel="Nova meta" onAction={add} actionDisabledReason={offline ? OFFLINE_REASON : undefined} />
    {/* As metas do planejamento (reserva e número da liberdade) não voltam sozinhas depois de removidas. */}
    <AutoGoalsNotice settings={settings} refresh={refresh} notify={notify} onError={reportError(notifyError, notify)} offline={offline} />
    {state.goals.length ? <>
      {goals.length > 0 && <StatStrip label="Resumo das metas" items={[
        { label: "Guardado", value: <Money cents={saved.cents} />, hint: note ?? <>de <Money cents={target.cents} />{freedomGoal ? " · sem o Número da liberdade" : ""}</> },
        // R4-METAS-1: what is missing per goal (a reached goal adds nothing), counted over the goals still in progress.
        { label: "Falta", value: <Money cents={missing.cents} />, hint: inProgress ? countLabel(inProgress, "meta em andamento", "metas em andamento") : "Todas atingidas" },
        { label: "Aporte mensal sugerido", value: <Money cents={monthly.cents} />, hint: withDeadline ? `Soma de ${countLabel(withDeadline, "meta com prazo", "metas com prazo")}` : "Nenhuma meta com prazo" },
        { label: "Metas atingidas", value: `${reached} de ${goals.length}`, tone: reached ? "positive" : undefined, hint: freedomGoal ? "Sem o Número da liberdade" : undefined },
      ]} />}
      {freedomGoal && <div className="goal-featured">{card(freedomGoal, true)}</div>}
      {goals.length > 0 && <div className="grid two">{goals.map(goal => card(goal))}</div>}
    </> : <EmptyState icon={Target} title="Nenhuma meta definida" description="Crie um objetivo, como uma reserva de emergência, viagem ou compra planejada, e acompanhe quanto falta." actionLabel={offline ? undefined : "Nova meta"} onAction={add} />}
    {historyId !== null && <HistoryDialog
      title={`Histórico · ${historyGoal?.name ?? "meta"}`}
      summary={historyGoal && <p className="muted">Guardado até agora: <b>{format(historyGoal.current_cents, historyGoal.currency)}</b> de {format(historyGoal.target_cents, historyGoal.currency)}.</p>}
      rows={goalEntryRows(historyId, history.items)}
      currency={historyGoal?.currency}
      balanceCents={historyGoal?.current_cents ?? null} balanceLabel="Guardado após"
      loading={history.loading} error={history.error} onRetry={() => void history.reload()}
      total={history.total} hasMore={history.hasMore} loadingMore={history.loadingMore} onLoadMore={() => void history.loadMore()}
      emptyTitle="Nenhuma movimentação registrada"
      emptyDescription="Os aportes e resgates desta meta aparecem aqui e podem ser estornados."
      onClose={() => setHistoryId(null)} refresh={refresh} notify={notify} notifyError={notifyError} />}
  </>;
}
