import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { todayISO } from "../../../lib/date";
import { cx, sizeClass, type Size } from "../shared/cx";
import { addDays, addMonths, brToISO, fromISO, isoToBR, longDateLabel, maskBR, monthGrid, monthTitle, outOfRange, toISODate, WEEKDAY_NAMES, WEEKDAY_SHORT } from "../shared/dates";
import { useDismiss } from "../shared/useDismiss";
import { useFloating } from "../shared/useFloating";

export interface DatePickerProps {
  /** ISO "YYYY-MM-DD" or "" (empty). */
  value: string;
  /** Called with a valid ISO date inside [min, max], or "" when the field is cleared. Invalid text is kept (aria-invalid) and not emitted. */
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  size?: Size;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  className?: string;
  placeholder?: string;
  /** Shortcut buttons in the calendar ("Hoje", "Início do mês"). Default true. */
  shortcuts?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

/**
 * pt-BR date field (MEL-42): type "dd/mm/aaaa" (slashes are inserted while typing; "18092026" and "18/9/26" work)
 * or pick in the calendar dialog (APG date picker: arrows, PageUp/PageDown = month, Shift+PageUp/PageDown = year,
 * Home/End = week, Enter chooses, Esc closes). ISO in and out.
 */
export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker({ value, onChange, min, max, size = "md", disabled = false, required, name, id, className, placeholder = "dd/mm/aaaa", shortcuts = true, ...aria }, ref) {
  const [text, setText] = useState(() => isoToBR(value));
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);
  const [focusDate, setFocusDate] = useState<Date>(() => fromISO(value) ?? new Date());
  const wrapRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  const titleId = useId();
  /** Whether a focusDate change should move focus into the grid (not when clicking the month arrows). */
  const moveFocus = useRef(true);
  const style = useFloating(wrapRef, popRef, open, "bottom-start");

  // Keep the text in sync when the value changes from outside.
  useEffect(() => {
    setText(current => (brToISO(current) === value || (value === "" && current.trim() === "") ? current : isoToBR(value)));
  }, [value]);

  const closeCalendar = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  };
  useDismiss(open, [wrapRef, popRef], reason => closeCalendar(reason === "escape"));

  useEffect(() => {
    if (!open || !moveFocus.current) return;
    const button = gridRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${toISODate(focusDate)}"]`);
    button?.focus();
  }, [open, focusDate]);

  const parsed = brToISO(text);
  const invalid = touched && text.trim() !== "" && (!parsed || outOfRange(parsed, min, max));

  const commit = (iso: string) => {
    setText(isoToBR(iso));
    onChange(iso);
  };

  const pick = (date: Date) => {
    const iso = toISODate(date);
    if (outOfRange(iso, min, max)) return;
    commit(iso);
    setTouched(false);
    closeCalendar(true);
  };

  const openCalendar = () => {
    if (disabled) return;
    const base = fromISO(parsed ?? value) ?? fromISO(todayISO())!;
    const clamped = min && toISODate(base) < min ? fromISO(min)! : max && toISODate(base) > max ? fromISO(max)! : base;
    moveFocus.current = true;
    setFocusDate(clamped);
    setOpen(true);
  };

  const handleGridKey = (event: KeyboardEvent<HTMLTableElement>) => {
    let next: Date | null = null;
    switch (event.key) {
      case "ArrowLeft": next = addDays(focusDate, -1); break;
      case "ArrowRight": next = addDays(focusDate, 1); break;
      case "ArrowUp": next = addDays(focusDate, -7); break;
      case "ArrowDown": next = addDays(focusDate, 7); break;
      case "Home": next = addDays(focusDate, -focusDate.getDay()); break;
      case "End": next = addDays(focusDate, 6 - focusDate.getDay()); break;
      case "PageUp": next = addMonths(focusDate, event.shiftKey ? -12 : -1); break;
      case "PageDown": next = addMonths(focusDate, event.shiftKey ? 12 : 1); break;
      case "Enter": case " ": event.preventDefault(); pick(focusDate); return;
      default: return;
    }
    event.preventDefault();
    moveFocus.current = true;
    setFocusDate(next);
  };

  const today = todayISO();
  const selected = parsed ?? (value || null);
  const grid = monthGrid(focusDate);
  const shortcut = (label: string, iso: string) => <button type="button" className="btn small ghost" disabled={outOfRange(iso, min, max)} onClick={() => pick(fromISO(iso)!)}>{label}</button>;

  return <div ref={wrapRef} className={cx("ui-datepicker ui-control", sizeClass(size), invalid && "is-invalid", disabled && "is-disabled", className)}>
    <input
      ref={ref}
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className="ui-datepicker-input"
      placeholder={placeholder}
      maxLength={10}
      disabled={disabled}
      value={text}
      aria-label={aria["aria-label"]}
      aria-labelledby={aria["aria-labelledby"]}
      aria-describedby={aria["aria-describedby"]}
      aria-invalid={aria["aria-invalid"] || invalid || undefined}
      aria-required={aria["aria-required"] ?? (required || undefined)}
      onChange={event => {
        const next = maskBR(event.target.value);
        setText(next);
        if (next.trim() === "") { onChange(""); return; }
        const iso = brToISO(next);
        if (iso && !outOfRange(iso, min, max) && next.length >= 8) onChange(iso);
      }}
      onBlur={() => {
        setTouched(true);
        const iso = brToISO(text);
        if (iso && !outOfRange(iso, min, max)) setText(isoToBR(iso));
      }}
      onKeyDown={event => {
        if (event.key === "ArrowDown" && event.altKey) { event.preventDefault(); openCalendar(); }
      }}
    />
    <button ref={toggleRef} type="button" className="ui-datepicker-toggle" aria-label="Abrir calendário" aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => (open ? closeCalendar(false) : openCalendar())}>
      <CalendarDays size={16} aria-hidden="true" />
    </button>
    {open && <div ref={popRef} className="ui-popover ui-calendar" role="dialog" aria-modal="false" aria-labelledby={titleId} style={style}>
      <div className="ui-calendar-header">
        <button type="button" className="icon-btn" aria-label="Mês anterior" onClick={() => { moveFocus.current = false; setFocusDate(addMonths(focusDate, -1)); }}><ChevronLeft size={16} aria-hidden="true" /></button>
        <div id={titleId} className="ui-calendar-title" aria-live="polite">{monthTitle(focusDate)}</div>
        <button type="button" className="icon-btn" aria-label="Próximo mês" onClick={() => { moveFocus.current = false; setFocusDate(addMonths(focusDate, 1)); }}><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
      <table ref={gridRef} role="grid" className="ui-calendar-grid" aria-labelledby={titleId} onKeyDown={handleGridKey}>
        <thead><tr>{WEEKDAY_SHORT.map((short, index) => <th key={index} scope="col" abbr={WEEKDAY_NAMES[index]}><span aria-hidden="true">{short}</span><span className="sr-only">{WEEKDAY_NAMES[index]}</span></th>)}</tr></thead>
        <tbody>{grid.map((week, row) => <tr key={row}>{week.map(date => {
          const iso = toISODate(date);
          const outside = date.getMonth() !== focusDate.getMonth();
          const blocked = outOfRange(iso, min, max);
          const isSelected = iso === selected;
          const isFocus = iso === toISODate(focusDate);
          return <td key={iso} role="gridcell" aria-selected={isSelected}>
            <button type="button" data-date={iso} tabIndex={isFocus ? 0 : -1}
              className={cx("ui-day", outside && "is-outside", isSelected && "is-selected", iso === today && "is-today", blocked && "is-blocked")}
              aria-label={longDateLabel(date)} aria-current={iso === today ? "date" : undefined} aria-disabled={blocked || undefined}
              onClick={() => { setFocusDate(date); pick(date); }}>{date.getDate()}</button>
          </td>;
        })}</tr>)}</tbody>
      </table>
      {shortcuts && <div className="ui-calendar-footer">
        {shortcut("Hoje", today)}
        {shortcut("Início do mês", `${today.slice(0, 7)}-01`)}
        {!required && value && <button type="button" className="btn small ghost" onClick={() => { commit(""); closeCalendar(true); }}>Limpar</button>}
      </div>}
    </div>}
  </div>;
});
