import { useState, type ReactNode } from "react";
import { History, Trash2, Undo2 } from "lucide-react";
import { errorMessage } from "../../api/client";
import { Drawer } from "../../components/ui/Drawer";
import { Badge, EmptyState, Money, Skeleton } from "../../components/ui";
import { DataTable, RowMenu, type DataTableColumn } from "../../components/ui/DataTable";
import type { MenuEntry } from "../../components/ui/Menu";
import { useConfirm } from "../../components/useConfirm";
import { PAGE_SIZE } from "../../hooks/usePagedList";
import { formatDate, formatMonthLabel } from "../../lib/date";
import type { Notify } from "../../types";
import { runningBalances, type HistoryRow } from "./historyRows";

export interface HistoryDialogProps {
  title: string;
  /** Context shown above the list (e.g. current balance). */
  summary?: ReactNode;
  rows: HistoryRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  emptyTitle: string;
  emptyDescription: string;
  onClose: () => void;
  refresh: () => Promise<void>;
  notify: Notify;
  /** Pagination (MEL-14): total rows on the server (null when unknown), whether more rows exist and how to load them. */
  total?: number | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** Action failures as an error toast (MEL-28); without it the message is shown inside the panel. */
  notifyError?: (reason: unknown) => void;
  /** Currency of the amounts (MEL-26; default BRL). */
  currency?: string | null;
  /** CR-20: current balance/value; enables the "Saldo após" column (running balance, newest first). */
  balanceCents?: number | null;
  /** Header of the running balance column (default "Saldo após"). */
  balanceLabel?: string;
}

function Amount({ row, currency }: { row: HistoryRow; currency?: string }) {
  if (row.deltaCents !== null) return <Money cents={row.deltaCents} currency={currency} signed />;
  return <span>Novo saldo <Money cents={row.amountCents} currency={currency} /></span>;
}

interface Line { row: HistoryRow; balance: number | null; }

const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
const movements = (count: number) => `${count} ${count === 1 ? "movimentação" : "movimentações"}`;

/**
 * Movement history (statement) in a side Drawer — a bottom sheet on phones. CR-20: the description leads and the kind
 * is a badge; months get a header; each line shows the balance after it; reversing ("Estornar") and removing a linked
 * transaction live in the row "…" menu. "Desfazer" in the notice, pagination and loading, empty and error states.
 */
export function HistoryDialog({ title, summary, rows, loading, error, onRetry, emptyTitle, emptyDescription, onClose, refresh, notify, total = null, hasMore = false, loadingMore = false, onLoadMore, notifyError, currency, balanceCents, balanceLabel = "Saldo após" }: HistoryDialogProps) {
  const confirm = useConfirm();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const code = currency ?? undefined;
  const withBalance = typeof balanceCents === "number";
  const balances = runningBalances(rows, withBalance ? balanceCents : null);
  const lines: Line[] = rows.map((row, index) => ({ row, balance: balances[index] ?? null }));

  async function reverse(row: HistoryRow) {
    if (!row.reverse) return;
    const confirmed = await confirm({
      title: `Estornar ${row.kindLabel.toLowerCase()} de ${formatDate(row.date)}?`,
      message: row.restore
        ? "O saldo volta ao valor anterior a esta movimentação, que deixa de aparecer no histórico. Você poderá desfazer o estorno em seguida."
        : "O saldo volta ao valor anterior a esta movimentação, que deixa de aparecer no histórico.",
      confirmLabel: "Estornar",
      cancelLabel: "Cancelar",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusyKey(row.key);
    setActionError(null);
    try {
      await row.reverse();
      await refresh();
      const restore = row.restore;
      notify("Movimentação estornada.", restore && {
        label: "Desfazer",
        run: async () => {
          await restore();
          await refresh();
          notify("Estorno desfeito.");
        },
      });
    } catch (reason) {
      if (notifyError) notifyError(reason);
      else setActionError(errorMessage(reason));
    } finally {
      setBusyKey(null);
    }
  }

  const busy = busyKey !== null;
  const rowName = (row: HistoryRow) => `${row.kindLabel.toLowerCase()} de ${formatDate(row.date)}`;
  const menu = ({ row }: Line) => {
    const items: MenuEntry[] = [];
    if (row.reverse) items.push({ label: "Estornar", icon: Undo2, tone: "danger", disabled: busy, onSelect: () => void reverse(row), description: "Desfaz o efeito no saldo" });
    if (row.action) {
      const action = row.action;
      items.push({ label: action.label, icon: Trash2, tone: "danger", disabled: busy, onSelect: action.run });
    }
    if (!items.length) return null;
    return <RowMenu label={rowName(row)} items={items} busyLabel={busyKey === row.key ? "Estornando…" : null} />;
  };
  const extra = (row: HistoryRow) => [row.detail, row.notes].filter(Boolean).join(" · ");

  const columns: DataTableColumn<Line>[] = [
    { id: "date", header: "Data", width: "7rem", cell: ({ row }) => formatDate(row.date) },
    { id: "description", header: "Movimentação", cell: ({ row }) => <div className="history-line">
      <b>{row.description ?? row.kindLabel}</b>
      {(row.description || extra(row)) && <small className="tag-row">
        {row.description && <Badge>{row.kindLabel}</Badge>}
        {extra(row) && <span className="muted">{extra(row)}</span>}
      </small>}
    </div> },
    { id: "amount", header: "Valor", align: "right", cell: ({ row }) => <Amount row={row} currency={code} /> },
    ...(withBalance ? [{ id: "balance", header: balanceLabel, align: "right" as const, cell: ({ balance }: Line) => balance === null ? <span className="muted">—</span> : <Money cents={balance} currency={code} tone={balance < 0 ? "negative" : "neutral"} /> }] : []),
    { id: "actions", header: "", actions: true, cell: menu },
  ];

  const content = (() => {
    if (loading && !rows.length) return <Skeleton label="Carregando histórico…" />;
    if (error && !rows.length) return <div className="stack" role="alert">
      <p>{error}</p>
      <div><button type="button" className="btn small" onClick={onRetry}>Tentar novamente</button></div>
    </div>;
    if (!rows.length) return <EmptyState compact icon={History} title={emptyTitle} description={emptyDescription} />;
    return <DataTable rows={lines} columns={columns} rowKey={line => line.row.key} caption={title} className="history-table"
      rowClassName={line => (busyKey === line.row.key ? "is-removing" : undefined)}
      groups={{ key: line => line.row.date.slice(0, 7), header: (month, items) => <>
        <span className="ui-group-title">{capitalize(formatMonthLabel(month))}</span>
        <span className="ui-group-meta">{movements(items.length)}</span>
      </> }}
      compact={{
        title: ({ row }) => row.description ?? row.kindLabel,
        meta: ({ row }) => [formatDate(row.date).slice(0, 5), row.description ? row.kindLabel : null, extra(row) || null],
        amount: ({ row }) => <Amount row={row} currency={code} />,
        aside: withBalance ? ({ balance }) => balance === null ? null : <>{balanceLabel === "Saldo após" ? "Saldo" : balanceLabel} <Money cents={balance} currency={code} /></> : undefined,
        actions: menu,
      }} />;
  })();

  const shownCount = rows.length;
  // Shown once the history spans more than one page (MEL-14).
  const pager = shownCount > 0 && (hasMore || (total ?? shownCount) > PAGE_SIZE) && <div className="history-pager">
    <span className="muted" role="status">{total !== null ? `Mostrando ${shownCount} de ${total}` : `Mostrando ${shownCount}`}</span>
    {hasMore && onLoadMore && <button type="button" className="btn small" disabled={loadingMore || busy} onClick={onLoadMore}>{loadingMore ? "Carregando…" : "Carregar mais"}</button>}
  </div>;

  return <Drawer open title={title} size="lg" busy={busy} onClose={onClose} className="history-drawer" footer={<button type="button" className="btn" disabled={busy} onClick={onClose}>Fechar</button>}>
    <div className="stack">
      {summary && <div className="history-summary">{summary}</div>}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      {content}
      {pager}
    </div>
  </Drawer>;
}
