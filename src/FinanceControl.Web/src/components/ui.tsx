import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";
import { currentMonth, formatMonthLabel, shiftMonth } from "../lib/date";
import { useHideValues } from "../hooks/usePreferences";
import { currencyOf } from "../lib/currencies";
import { formatMoney, formatMoneyInput, hiddenMoney, parseMoney } from "../lib/money";

type FieldControlProps = {
  id?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
};

/**
 * Label + control + hint/error. `optional` adds the "(opcional)" suffix to the label (MEL-06);
 * `required` (or a child with `required`) adds `aria-required="true"` to the control.
 */
export function Field({ label, children, hint, error, optional = false, required }: { label: string; children: ReactElement<FieldControlProps>; hint?: string; error?: string; optional?: boolean; required?: boolean }) {
  const generatedId = useId();
  const controlId = children.props.id ?? generatedId;
  const messageId = `${controlId}-message`;
  const describedBy = [children.props["aria-describedby"], hint || error ? messageId : undefined].filter(Boolean).join(" ") || undefined;
  const isRequired = required ?? children.props.required === true;
  const control = cloneElement(children, {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : children.props["aria-invalid"],
    ...(isRequired ? { "aria-required": true } : {}),
  });

  return <div className={`field${error ? " field-invalid" : ""}`}>
    <label htmlFor={controlId}>{label}{optional && !isRequired && <> <span className="field-optional">(opcional)</span></>}</label>
    {control}
    {(error || hint) && <p id={messageId} className={error ? "field-error" : "field-hint"}>{error || hint}</p>}
  </div>;
}

export interface MoneyInputProps {
  value: string;
  onChange: (text: string) => void;
  allowNegative?: boolean;
  placeholder?: string;
  /** Currency code (MEL-26): prefix symbol and decimals of the minor unit (default BRL). */
  currency?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

/**
 * Money text input: keeps the raw text while typing and reformats valid values on blur ("1.234,56").
 * `currency` sets the prefix symbol and the accepted decimals (JPY 0, BTC 8; default BRL).
 */
export function MoneyInput({ value, onChange, allowNegative = false, placeholder, currency, ...rest }: MoneyInputProps) {
  const info = currencyOf(currency);
  const reformat = () => {
    const minor = parseMoney(value, info.decimals);
    if (minor === null || (!allowNegative && minor < 0)) return;
    const formatted = formatMoneyInput(minor, info.decimals);
    if (formatted !== value) onChange(formatted);
  };
  return <div className="money-input" data-currency={info.code}>
    <span aria-hidden="true">{info.symbol}</span>
    <input {...rest} type="text" inputMode="decimal" autoComplete="off" placeholder={placeholder ?? (info.decimals === 0 ? "0" : "0,00")} value={value} onChange={event => onChange(event.target.value)} onBlur={reformat} />
  </div>;
}

/** `actionDisabledReason` disables the primary action and explains why (e.g. "Mês fechado", MEL-22). */
export function PageHeader({ title, description, actionLabel, onAction, actionDisabledReason, children }: { title: string; description?: string; actionLabel?: string; onAction?: () => void; actionDisabledReason?: string; children?: ReactNode }) {
  return <div className="page-header">
    <div className="page-header-text"><h2>{title}</h2>{description && <p className="muted">{description}</p>}</div>
    {(children || (actionLabel && onAction)) && <div className="page-header-actions">
      {children}
      {actionLabel && onAction && <button type="button" className="btn primary" disabled={Boolean(actionDisabledReason)} title={actionDisabledReason} onClick={onAction}><Plus size={15} aria-hidden="true" />{actionLabel}</button>}
    </div>}
  </div>;
}

export type Tone = "positive" | "negative" | "warning";

export interface StatItem { label: string; value: ReactNode; tone?: Tone; hint?: ReactNode; }

export function StatStrip({ items, label }: { items: StatItem[]; label?: string }) {
  return <dl className="stat-strip" aria-label={label}>
    {items.map(item => <div className="stat" key={item.label}>
      <dt className="stat-label">{item.label}</dt>
      <dd className={`stat-value${item.tone ? ` ${item.tone}` : ""}`}>{item.value}</dd>
      {item.hint && <dd className="stat-hint">{item.hint}</dd>}
    </div>)}
  </dl>;
}

export function Badge({ tone = "neutral", title, children }: { tone?: "neutral" | "positive" | "negative" | "warning" | "accent"; title?: string; children: ReactNode }) {
  return <span className={`badge ${tone}`} title={title}>{children}</span>;
}

/**
 * Money display. `signed` adds +/− and defaults the tone to "auto" (positive/negative by sign).
 * `currency` formats minor units of that currency (default BRL). In privacy mode (`hide_values`) the value is masked
 * ("R$ •••••", aria-label "Valor oculto") unless `reveal` is set.
 */
export function Money({ cents, signed = false, tone, currency, compact = false, reveal = false, className }: { cents: number; signed?: boolean; tone?: "auto" | "positive" | "negative" | "neutral"; currency?: string; compact?: boolean; reveal?: boolean; className?: string }) {
  const hidden = useHideValues() && !reveal;
  const resolved = tone ?? (signed ? "auto" : "neutral");
  const toneClass = resolved === "auto" ? (cents > 0 ? " positive" : cents < 0 ? " negative" : "") : resolved === "neutral" ? "" : ` ${resolved}`;
  const classes = `money${toneClass}${hidden ? " money-hidden" : ""}${className ? ` ${className}` : ""}`;
  if (hidden) return <span className={classes} role="img" aria-label="Valor oculto">{hiddenMoney(currency)}</span>;
  return <span className={classes}>{formatMoney(cents, currency, { signed, compact })}</span>;
}

/**
 * Edit/remove icon buttons for a row or card; `label` names the record in the aria-labels.
 * While `removing`, every action is disabled and a "Removendo…" status replaces them (MEL-07).
 * `disabledReason` disables edit/remove and shows the reason as tooltip (e.g. "Mês fechado", MEL-22).
 */
export function RowActions({ label, onEdit, onRemove, removing = false, disabledReason, children }: { label: string; onEdit?: () => void; onRemove?: () => void; removing?: boolean; disabledReason?: string; children?: ReactNode }) {
  if (removing) return <div className="row-actions"><span className="removing-status muted" role="status">Removendo…</span></div>;
  return <div className="row-actions">
    {children}
    {onEdit && <button type="button" className="icon-btn" aria-label={`Editar ${label}`} title={disabledReason ?? "Editar"} disabled={Boolean(disabledReason)} onClick={onEdit}><Pencil size={16} aria-hidden="true" /></button>}
    {onRemove && <button type="button" className="icon-btn danger" aria-label={`Remover ${label}`} title={disabledReason ?? "Remover"} disabled={Boolean(disabledReason)} onClick={onRemove}><Trash2 size={16} aria-hidden="true" /></button>}
  </div>;
}

/** Name of a linked record, with "(removido)" when it no longer exists among the active records (MEL-09). */
export function LinkedName({ name, removed, fallback }: { name: string | null | undefined; removed: boolean; fallback?: string }) {
  if (!name) return fallback ? <span className="muted">{fallback}</span> : <span className="muted">—</span>;
  return removed ? <span>{name} <span className="muted">(removido)</span></span> : <>{name}</>;
}

/** Light loading placeholder (MEL-07); `label` is announced to screen readers. */
export function Skeleton({ label, lines = 3 }: { label: string; lines?: number }) {
  return <div className="skeleton-list" role="status">
    <span className="sr-only">{label}</span>
    {Array.from({ length: lines }, (_, index) => <span key={index} className="skeleton-line" aria-hidden="true" />)}
  </div>;
}

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const current = currentMonth();
  return <div className="month-switcher" role="group" aria-label="Mês de referência">
    <button type="button" className="icon-btn" aria-label="Mês anterior" onClick={() => onChange(shiftMonth(month, -1))}><ChevronLeft size={18} aria-hidden="true" /></button>
    <span className="month-label" aria-live="polite">{formatMonthLabel(month)}</span>
    <button type="button" className="icon-btn" aria-label="Próximo mês" onClick={() => onChange(shiftMonth(month, 1))}><ChevronRight size={18} aria-hidden="true" /></button>
    <button type="button" className="btn small ghost" disabled={month === current} onClick={() => onChange(current)}>Mês atual</button>
  </div>;
}

export function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: Tone; hint?: string }) {
  return <div className="card"><div className="label">{label}</div><div className={`value ${tone ? `kpi-${tone}` : ""}`}>{value}</div>{hint && <small className="kpi-hint">{hint}</small>}</div>;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, compact = false }: { icon: LucideIcon; title: string; description: string; actionLabel?: string; onAction?: () => void; compact?: boolean }) {
  return <div className={`empty-state${compact ? " compact" : ""}`}><span className="empty-icon"><Icon size={22} aria-hidden="true" /></span><div><h3>{title}</h3><p>{description}</p></div>{actionLabel && onAction && <button type="button" className="btn" onClick={onAction}>{actionLabel}</button>}</div>;
}
