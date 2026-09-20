import { useState } from "react";
import { CalendarClock, ChevronRight, Eye, Undo2, Wallet } from "lucide-react";
import { api, errorMessage, isConnectivityError } from "../../api/client";
import { Badge, Money, Skeleton } from "../../components/ui";
import { useConfirm } from "../../components/useConfirm";
import type { AsyncList } from "../../hooks/useAsyncList";
import { formatDate, todayISO } from "../../lib/date";
import type { Card, CardInvoice, Notify, OpenModal } from "../../types";
import { OFFLINE_REASON } from "../records/offline";
import { InvoiceDialog } from "./InvoiceDialog";
import { canPayInvoice, groupInvoices, invoiceMonthLabel, invoicePhase, invoicePhaseLabel, invoicePhaseTone, invoiceRef, invoiceTitle, type InvoicePhase } from "./invoiceModel";

export interface CardInvoicesProps {
  card: Card; version: number; openModal: OpenModal; notify: Notify; refresh: () => Promise<void>;
  /** The card's invoices (`api.cardInvoices`), loaded by the card tile so its header can point to overdue ones (R2-CARD-1). */
  list: AsyncList<CardInvoice>;
  /** Action failures as an error toast (MEL-28). */ notifyError?: (reason: unknown) => void;
  /** Disables paying/undoing (e.g. offline) with this reason. */ lockReason?: string;
  /** Id of the section, target of the header's "N faturas vencidas" jump. */ id?: string;
}

/** R3-CARD-1: what the folded list holds — "1 fatura paga", "2 faturas futuras", "3 faturas: 2 pagas, 1 futura". */
function othersLabel(phases: InvoicePhase[]): string {
  const noun = (count: number) => (count === 1 ? "fatura" : "faturas");
  const groups: Array<[number, string, string]> = [
    [phases.filter(phase => phase === "paga").length, "paga", "pagas"],
    [phases.filter(phase => phase === "futura").length, "futura", "futuras"],
    [phases.filter(phase => phase !== "paga" && phase !== "futura").length, "sem compras", "sem compras"],
  ];
  const present = groups.filter(([count]) => count > 0);
  if (present.length === 1) { const [count, one, many] = present[0]!; return `${count} ${noun(count)} ${count === 1 ? one : many}`; }
  return `${phases.length} ${noun(phases.length)}: ${present.map(([count, one, many]) => `${count} ${count === 1 ? one : many}`).join(", ")}`;
}

const purchases = (count: number) => `${count} ${count === 1 ? "compra" : "compras"}`;

/** What matters about each phase, in one line. */
function invoiceDetail(invoice: CardInvoice, phase: InvoicePhase): string {
  switch (phase) {
    case "vencida": return `Venceu em ${formatDate(invoice.due_date)} · ${purchases(invoice.items_count)}`;
    case "fechada": return `Fechou em ${formatDate(invoice.closing_date)} · vence em ${formatDate(invoice.due_date)} · ${purchases(invoice.items_count)}`;
    case "atual": return `Compras de ${formatDate(invoice.period_start)} a ${formatDate(invoice.period_end)} · fecha em ${formatDate(invoice.closing_date)} · vence em ${formatDate(invoice.due_date)}`;
    case "futura": return `Compras a partir de ${formatDate(invoice.period_start)} · vence em ${formatDate(invoice.due_date)}`;
    default: return `Vence em ${formatDate(invoice.due_date)} · ${purchases(invoice.items_count)}${invoice.paid ? ` · paga em ${formatDate(invoice.paid.date)}` : ""}`;
  }
}

/**
 * Card invoices (MEL-23, CR-05): unpaid closed invoices first — overdue in coral with "Pagar fatura" as the main action —
 * then the current one ("fecha em …"), and future/paid ones folded. One competency format: "Setembro/2026".
 */
export function CardInvoices({ card, version, openModal, notify, refresh, list, notifyError, lockReason, id }: CardInvoicesProps) {
  const confirm = useConfirm();
  const [viewing, setViewing] = useState<string | null>(null);
  const [busyMonth, setBusyMonth] = useState<string | null>(null);
  const today = todayISO();
  const { due, current, others } = groupInvoices(list.items, today);
  const primaryMonth = due[0]?.month ?? null;

  const pay = (invoice: CardInvoice) => openModal("invoice-payment", {
    card_id: card.id, card_name: card.name, month: invoice.month, total_cents: invoice.total_cents, due_date: invoice.due_date,
  });

  async function undo(invoice: CardInvoice) {
    const confirmed = await confirm({
      title: `Desfazer o pagamento da ${invoiceRef(invoice.month)}?`,
      message: "A saída registrada na conta é estornada e a fatura volta a ficar em aberto.",
      confirmLabel: "Desfazer pagamento",
      cancelLabel: "Cancelar",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusyMonth(invoice.month);
    try {
      await api.undoInvoicePayment(card.id, invoice.month);
      await refresh();
      notify("Pagamento da fatura desfeito.");
    } catch (reason) {
      if (notifyError) notifyError(reason);
      else notify(errorMessage(reason));
    } finally {
      setBusyMonth(null);
    }
  }

  const actions = (invoice: CardInvoice) => {
    const label = `${invoiceRef(invoice.month)} de ${card.name}`;
    const busy = busyMonth === invoice.month;
    const primary = invoice.month === primaryMonth;
    // R2-CARD-3: the invoice still collecting purchases can be paid ahead, but quietly — it is not due yet.
    const early = invoicePhase(invoice, today) === "atual";
    return <div className="row-actions">
      {canPayInvoice(invoice) && (early
        ? <button type="button" className="btn small ghost" disabled={Boolean(lockReason)} title={lockReason} aria-label={`Antecipar pagamento da ${label}`} onClick={() => pay(invoice)}><Wallet size={14} aria-hidden="true" />Antecipar pagamento</button>
        : <button type="button" className={`btn small${primary ? " primary" : ""}`} disabled={Boolean(lockReason)} title={lockReason} aria-label={`Pagar ${label}`} onClick={() => pay(invoice)}><Wallet size={14} aria-hidden="true" />Pagar fatura</button>)}
      <button type="button" className="btn small ghost" aria-label={`Ver ${label}`} onClick={() => setViewing(invoice.month)}><Eye size={14} aria-hidden="true" />Ver fatura</button>
      {invoice.paid && <button type="button" className="btn small ghost" disabled={busy || Boolean(lockReason)} title={lockReason} aria-label={`Desfazer pagamento da ${label}`} onClick={() => void undo(invoice)}><Undo2 size={14} aria-hidden="true" />{busy ? "Desfazendo…" : "Desfazer pagamento"}</button>}
    </div>;
  };

  const block = (invoice: CardInvoice) => {
    const phase = invoicePhase(invoice, today);
    return <div key={invoice.month} className={`invoice-block is-${phase}`}>
      <div className="invoice-block-head">
        <div className="invoice-block-text">
          <p className="invoice-block-title"><b>{invoiceTitle(invoice.month)}</b> <Badge tone={invoicePhaseTone(phase)}>{invoicePhaseLabel(phase)}</Badge></p>
          <p className="muted">{invoiceDetail(invoice, phase)}</p>
          {/* v1.4: assinaturas ativas do cartão ainda não lançadas neste ciclo — previsão, fora do total realizado. */}
          {(invoice.projected_count ?? 0) > 0 && <p className="muted invoice-projected">
            <CalendarClock size={14} aria-hidden="true" />
            {invoice.projected_count === 1 ? "1 cobrança de assinatura prevista" : `${invoice.projected_count} cobranças de assinaturas previstas`}:{" "}
            <Money cents={invoice.projected_cents ?? 0} />
          </p>}
        </div>
        <div className="value compact-value"><Money cents={invoice.total_cents} /></div>
      </div>
      {actions(invoice)}
    </div>;
  };

  const body = (() => {
    if (!list.items.length && list.loading) return <Skeleton label={`Carregando faturas de ${card.name}…`} lines={2} />;
    // R3 decision 1: offline, the global banner has the retry; the panel only says when the invoices come back.
    if (!list.items.length && list.error && (lockReason === OFFLINE_REASON || isConnectivityError(list.error))) return <p className="muted" role="status">As faturas aparecem quando o servidor voltar.</p>;
    if (!list.items.length && list.error) return <div className="stack" role="alert">
      <p className="muted">{list.error}</p>
      <div><button type="button" className="btn small" onClick={() => void list.reload()}>Tentar novamente</button></div>
    </div>;
    if (!list.items.length) return <p className="muted">Nenhuma fatura no período.</p>;
    const overdue = due.filter(invoice => invoicePhase(invoice, today) === "vencida");
    return <>
      {overdue.length > 1 && <p className="invoice-overdue-note" role="note"><b>{overdue.length} faturas vencidas</b> somando <Money cents={overdue.reduce((sum, invoice) => sum + invoice.total_cents, 0)} />. Pague a mais antiga primeiro.</p>}
      {due.map(block)}
      {current && block(current)}
      {others.length > 0 && <details className="invoice-more">
        <summary>Ver {othersLabel(others.map(invoice => invoicePhase(invoice, today)))}<ChevronRight className="invoice-more-chevron" size={14} aria-hidden="true" /></summary>
        <ul className="list" aria-label={`Outras faturas de ${card.name}`}>
          {others.map(invoice => {
            const phase = invoicePhase(invoice, today);
            return <li className="list-item invoice-item" key={invoice.month}>
              <div className="list-main">
                <b>{invoiceMonthLabel(invoice.month)} <Badge tone={invoicePhaseTone(phase)}>{invoicePhaseLabel(phase)}</Badge></b>
                <small className="muted">{invoiceDetail(invoice, phase)}</small>
              </div>
              <div className="list-amount"><Money cents={invoice.total_cents} /></div>
              {actions(invoice)}
            </li>;
          })}
        </ul>
      </details>}
    </>;
  })();

  return <section className="stack invoice-panel" id={id} tabIndex={id ? -1 : undefined} aria-label={`Faturas de ${card.name}`}>
    <h4 className="label">Faturas</h4>
    {body}
    {viewing && <InvoiceDialog cardId={card.id} cardName={card.name} month={viewing} version={version} onClose={() => setViewing(null)} />}
  </section>;
}
