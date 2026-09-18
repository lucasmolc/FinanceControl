// Form field components for the record definitions in ./forms.tsx (components only: react-refresh).
import { api } from "../../api/client";
import { Money, StatStrip } from "../../components/ui";
import { useAsyncList } from "../../hooks/useAsyncList";
import { formatMonthLabel } from "../../lib/date";
import { FormContextNote, TextAreaField } from "../records/fields";
import { monthOr } from "../records/formUtils";
import type { FieldsProps } from "../records/types";
import { formTotals, monthPendencies, monthTitle, pendencyCountText } from "./closingModel";

/**
 * R4-LANC-3 (R2-X-2): what is still unpaid in the month before it is closed — bills of the checklist and card invoices,
 * the same rows as Contas a pagar. Informative only: closing is still allowed.
 */
function MonthPendencies({ month, hasCards }: { month: string; hasCards: boolean }) {
  const bills = useAsyncList(() => api.checklist(month), `close-bills:${month}`);
  const invoices = useAsyncList(() => api.cardInvoicesDue(month), hasCards ? `close-invoices:${month}` : null);
  const billsReady = bills.loadedKey !== null;
  const invoicesReady = !hasCards || invoices.loadedKey !== null;
  const monthName = formatMonthLabel(month).replace(/\s+de\s+\d{4}$/, "");
  if (bills.error || (hasCards && invoices.error)) {
    return <p className="muted month-close-pending" role="note">Não foi possível conferir as contas a pagar de {monthName} agora.</p>;
  }
  if (!billsReady || !invoicesReady) return <p className="muted month-close-pending" aria-busy="true">Conferindo as contas a pagar de {monthName}…</p>;
  const pending = monthPendencies(bills.items, hasCards ? invoices.items : []);
  if (!pending.items.length) return <p className="muted month-close-pending is-clear" role="note">Nenhuma conta ou fatura pendente em {monthName}.</p>;
  return <div className="month-close-pending is-pending" role="note" aria-label={`Pendências de ${monthName}`}>
    <p><b>Pendências de {monthName}:</b> {pendencyCountText(pending)} (<Money cents={pending.totalCents} />).</p>
    <ul>
      {pending.items.map(item => <li key={item.key}><span>{item.name}</span><Money cents={item.cents} /></li>)}
    </ul>
    <small className="muted">Você pode fechar mesmo assim; para pagá-las com data deste mês, reabra o mês depois.</small>
  </div>;
}

export function MonthCloseFields(f: FieldsProps) {
  const month = monthOr(f.form, "month", f.ctx.month);
  const totals = formTotals(f.form);
  return <>
    {totals
      ? <StatStrip label={`Resumo de ${monthTitle(month).toLowerCase()}`} items={[
        { label: "Receitas", value: <Money cents={totals.incomeCents} /> },
        { label: "Despesas", value: <Money cents={totals.expenseCents} /> },
        { label: "Investimentos", value: <Money cents={totals.investmentCents} /> },
        { label: "Resultado", value: <Money cents={totals.resultCents} signed tone="neutral" />, tone: totals.resultCents < 0 ? "negative" : totals.resultCents > 0 ? "positive" : undefined, hint: "Receitas − despesas − investimentos" },
      ]} />
      : <FormContextNote>O resumo do mês não está disponível agora; o fechamento guarda o resumo calculado pelo servidor.</FormContextNote>}
    <MonthPendencies month={month} hasCards={f.ctx.state.cards.some(card => card.active)} />
    <p className="muted">Depois de fechado, lançamentos, contas pagas, cobranças e movimentações datadas neste mês ficam bloqueados até você reabrir o mês.</p>
    <TextAreaField f={f} name="notes" label="Observações do fechamento" maxLength={500} placeholder="Ex.: conferido com o extrato do banco" />
  </>;
}
