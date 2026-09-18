import { Lock, LockOpen } from "lucide-react";
import { Badge } from "../../components/ui";
import { formatDate } from "../../lib/date";
import type { MonthlySummary } from "../../types";
import { canCloseMonth, closedAt, isMonthClosed } from "./closingModel";

export interface MonthCloseBarProps {
  month: string;
  summary: MonthlySummary | null;
  onCloseMonth?: () => void;
  onReopenMonth?: (month: string) => Promise<boolean>;
  /** R3-LANC-2: why closing/reopening is unavailable right now (e.g. offline); the buttons stay visible but disabled. */
  disabledReason?: string;
}

/** "Fechar mês" / "Mês fechado · Reabrir mês" line for the Painel and Lançamentos (MEL-22). */
export function MonthCloseBar({ month, summary, onCloseMonth, onReopenMonth, disabledReason }: MonthCloseBarProps) {
  // Unknown state (no summary for this month) or future month: nothing to offer.
  if (!summary || summary.month !== month) return null;
  if (isMonthClosed(summary, month)) {
    const date = closedAt(summary, month);
    return <div className="month-close-bar is-closed">
      <p><Badge tone="warning">Mês fechado</Badge> <span className="muted">{date ? `Fechado em ${formatDate(date)}. ` : ""}Reabra o mês para alterar lançamentos e pagamentos.</span></p>
      {onReopenMonth && <button type="button" className="btn small" disabled={Boolean(disabledReason)} title={disabledReason} onClick={() => void onReopenMonth(month)}><LockOpen size={14} aria-hidden="true" />Reabrir mês</button>}
    </div>;
  }
  if (!onCloseMonth || !canCloseMonth(month)) return null;
  return <div className="month-close-bar">
    <p className="muted">Conferiu tudo? Feche o mês para evitar alterações retroativas.</p>
    <button type="button" className="btn small ghost" disabled={Boolean(disabledReason)} title={disabledReason} onClick={onCloseMonth}><Lock size={14} aria-hidden="true" />Fechar mês</button>
  </div>;
}
