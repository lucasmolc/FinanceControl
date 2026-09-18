import { ReceiptText } from "lucide-react";
import { api } from "../../api/client";
import { Drawer } from "../../components/ui/Drawer";
import { Badge, EmptyState, Money, Skeleton } from "../../components/ui";
import { useAsyncList } from "../../hooks/useAsyncList";
import { formatDate, todayISO } from "../../lib/date";
import type { Transaction } from "../../types";
import { invoicePhase, invoicePhaseLabel, invoicePhaseTone, invoiceRef, invoiceTitle } from "./invoiceModel";

export interface InvoiceDialogProps { cardId: number; cardName: string; month: string; version: number; onClose: () => void; }

/** Purchases "−R$" (neutral), credits/estornos "+R$" (positive). */
function ItemAmount({ item }: { item: Transaction }) {
  if (item.kind === "income") return <Money cents={item.amount_cents} signed />;
  return <Money cents={-item.amount_cents} signed tone="neutral" />;
}

/** "Ver fatura" (MEL-23): the invoice items (dd/mm/aaaa, description, category, signed amount) and its total. */
export function InvoiceDialog({ cardId, cardName, month, version, onClose }: InvoiceDialogProps) {
  const detail = useAsyncList(() => api.cardInvoice(cardId, month).then(invoice => [invoice]), `invoice:${cardId}:${month}:${version}`);
  const invoice = detail.items[0] ?? null;

  const content = (() => {
    if (!invoice && detail.loading) return <Skeleton label="Carregando fatura…" />;
    if (!invoice && detail.error) return <div className="stack" role="alert">
      <p>{detail.error}</p>
      <div><button type="button" className="btn small" onClick={() => void detail.reload()}>Tentar novamente</button></div>
    </div>;
    if (!invoice) return null;
    const items = [...(invoice.items ?? [])].sort((left, right) => left.date.localeCompare(right.date) || left.id - right.id);
    return <>
      <p className="muted">
        <Badge tone={invoicePhaseTone(invoicePhase(invoice, todayISO()))}>{invoicePhaseLabel(invoicePhase(invoice, todayISO()))}</Badge>{" "}
        Compras de {formatDate(invoice.period_start)} a {formatDate(invoice.period_end)} · fecha em {formatDate(invoice.closing_date)} · vence em {formatDate(invoice.due_date)}
        {invoice.paid && <> · paga em {formatDate(invoice.paid.date)}{invoice.paid.account_name ? ` pela conta ${invoice.paid.account_name}` : ""} (<Money cents={invoice.paid.amount_cents} />)</>}
      </p>
      {items.length ? <div className="table-wrap"><table className="data-table">
        <caption className="sr-only">Itens da {invoiceRef(month)}</caption>
        <thead><tr><th scope="col">Data</th><th scope="col">Descrição</th><th scope="col">Categoria</th><th scope="col" className="num">Valor</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}>
          <td data-label="Data">{formatDate(item.date)}</td>
          <td data-label="Descrição">{item.description}</td>
          <td data-label="Categoria">{item.category_name ?? <span className="muted">Sem categoria</span>}</td>
          <td data-label="Valor" className="num"><ItemAmount item={item} /></td>
        </tr>)}</tbody>
      </table></div>
        : <EmptyState compact icon={ReceiptText} title="Nenhuma compra nesta fatura" description="Lançamentos com este cartão dentro do período aparecem aqui." />}
      <p className="invoice-total">Total da fatura <b><Money cents={invoice.total_cents} /></b></p>
    </>;
  })();

  return <Drawer open title={`${invoiceTitle(month)} · ${cardName}`} size="lg" onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>Fechar</button>}>
    <div className="stack">{content}</div>
  </Drawer>;
}
