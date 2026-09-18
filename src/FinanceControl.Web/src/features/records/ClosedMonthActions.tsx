// R3-REC-2: ways out of a date in a closed month, right under the date field (components only: react-refresh).
import { useState } from "react";
import { CalendarCheck, LockOpen } from "lucide-react";
import { formatDate, formatMonthLabel, todayISO } from "../../lib/date";
import { firstOpenDay, inClosedMonth, trimmed } from "./formUtils";
import type { FieldsProps } from "./types";

/**
 * Shown while the date falls in a closed month (the field already says so): "Usar hoje (18/10/2026)" / "Usar 01/10/2026"
 * moves the date to the first open day, "Reabrir setembro" reopens the month (with its confirmation) and keeps the date.
 */
export function ClosedMonthActions({ f, name = "date" }: { f: FieldsProps; name?: string }) {
  const [busy, setBusy] = useState(false);
  const date = trimmed(f.form, name);
  if (!inClosedMonth(date, f.ctx.closedMonths)) return null;
  const today = todayISO();
  const alternative = firstOpenDay(date, f.ctx.closedMonths, today);
  const month = date.slice(0, 7);
  const monthName = formatMonthLabel(month).replace(/ de \d{4}$/, "");
  const reopen = f.ctx.reopenMonth;
  if (!alternative && !reopen) return null;
  return <div className="closed-month-actions" role="group" aria-label={`Resolver data em ${formatMonthLabel(month)}, mês fechado`}>
    {alternative && <button type="button" className="btn small" onClick={() => { f.set(name, alternative); f.set(`${name}_autofix`, alternative); }}>
      <CalendarCheck size={14} aria-hidden="true" />{alternative === today ? `Usar hoje (${formatDate(alternative)})` : `Usar ${formatDate(alternative)}`}
    </button>}
    {reopen && <button type="button" className="btn small ghost" disabled={busy} onClick={() => {
      setBusy(true);
      void reopen(month).finally(() => setBusy(false));
    }}><LockOpen size={14} aria-hidden="true" />{busy ? "Reabrindo…" : `Reabrir ${monthName}`}</button>}
  </div>;
}
