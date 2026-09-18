import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { currentMonth, formatMonthLabel, shiftMonth } from "../../../lib/date";
import { cx, sizeClass, type Size } from "../shared/cx";
import { MONTH_NAMES, MONTH_SHORT, monthKey, parseMonthKey } from "../shared/dates";
import { mergeRefs } from "../shared/refs";
import { useDismiss } from "../shared/useDismiss";
import { useFloating } from "../shared/useFloating";

export interface MonthPickerProps {
  /** "YYYY-MM". */
  value: string;
  onChange: (month: string) => void;
  min?: string;
  max?: string;
  size?: Size;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Shows "Mês anterior"/"Próximo mês" arrows around the trigger (like MonthSwitcher). */
  stepper?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

const COLUMNS = 3;

/**
 * Month field (MEL-42): trigger shows "setembro de 2026"; the popover has year arrows and a 4×3 month grid
 * (arrows move, PageUp/PageDown change the year, Enter chooses, Esc closes) plus "Mês atual".
 */
export const MonthPicker = forwardRef<HTMLButtonElement, MonthPickerProps>(function MonthPicker({ value, onChange, min, max, size = "md", disabled = false, id, className, stepper = false, ...aria }, ref) {
  const parsed = parseMonthKey(value) ?? parseMonthKey(currentMonth())!;
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(parsed);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(true);
  const titleId = useId();
  const style = useFloating(triggerRef, popRef, open, "bottom-start");

  const blocked = (key: string) => Boolean((min && key < min) || (max && key > max));
  const close = (returnFocus: boolean) => { setOpen(false); if (returnFocus) triggerRef.current?.focus(); };
  useDismiss(open, [triggerRef, popRef], reason => close(reason === "escape"));

  useEffect(() => {
    if (!open || !moveFocus.current) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`button[data-month="${monthKey(focus.year, focus.month)}"]`)?.focus();
  }, [open, focus]);

  const choose = (key: string) => {
    if (blocked(key)) return;
    onChange(key);
    close(true);
  };

  const move = (delta: number) => {
    const index = focus.year * 12 + focus.month + delta;
    moveFocus.current = true;
    setFocus({ year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 });
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowLeft": move(-1); break;
      case "ArrowRight": move(1); break;
      case "ArrowUp": move(-COLUMNS); break;
      case "ArrowDown": move(COLUMNS); break;
      case "Home": move(-(focus.month % COLUMNS)); break;
      case "End": move(COLUMNS - 1 - (focus.month % COLUMNS)); break;
      case "PageUp": move(-12); break;
      case "PageDown": move(12); break;
      case "Enter": case " ": choose(monthKey(focus.year, focus.month)); break;
      default: return;
    }
    event.preventDefault();
  };

  const now = currentMonth();
  const trigger = <button
    ref={mergeRefs(ref, triggerRef)}
    id={id}
    type="button"
    className="ui-monthpicker-trigger ui-control"
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label={aria["aria-label"]}
    aria-labelledby={aria["aria-labelledby"]}
    aria-describedby={aria["aria-describedby"]}
    disabled={disabled}
    onClick={() => { if (open) close(false); else { moveFocus.current = true; setFocus(parsed); setOpen(true); } }}
  >
    <CalendarRange size={16} aria-hidden="true" />
    <span className="ui-monthpicker-value">{formatMonthLabel(value)}</span>
  </button>;

  return <div className={cx("ui-monthpicker", sizeClass(size), stepper && "has-stepper", className)} role={stepper ? "group" : undefined} aria-label={stepper ? aria["aria-label"] ?? "Mês de referência" : undefined}>
    {stepper && <button type="button" className="icon-btn" aria-label="Mês anterior" disabled={disabled || blocked(shiftMonth(value, -1))} onClick={() => onChange(shiftMonth(value, -1))}><ChevronLeft size={18} aria-hidden="true" /></button>}
    {trigger}
    {stepper && <button type="button" className="icon-btn" aria-label="Próximo mês" disabled={disabled || blocked(shiftMonth(value, 1))} onClick={() => onChange(shiftMonth(value, 1))}><ChevronRight size={18} aria-hidden="true" /></button>}
    {open && <div ref={popRef} className="ui-popover ui-monthgrid-pop" role="dialog" aria-modal="false" aria-labelledby={titleId} style={style}>
      <div className="ui-calendar-header">
        <button type="button" className="icon-btn" aria-label="Ano anterior" onClick={() => { moveFocus.current = false; setFocus({ ...focus, year: focus.year - 1 }); }}><ChevronLeft size={16} aria-hidden="true" /></button>
        <div id={titleId} className="ui-calendar-title" aria-live="polite">{focus.year}</div>
        <button type="button" className="icon-btn" aria-label="Próximo ano" onClick={() => { moveFocus.current = false; setFocus({ ...focus, year: focus.year + 1 }); }}><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
      <div ref={gridRef} className="ui-monthgrid" role="grid" aria-labelledby={titleId} onKeyDown={handleKey}>
        {[0, 1, 2, 3].map(row => <div role="row" key={row} className="ui-monthgrid-row">
          {[0, 1, 2].map(column => {
            const month = row * COLUMNS + column;
            const key = monthKey(focus.year, month);
            const isFocus = month === focus.month;
            const isSelected = key === value;
            return <span role="gridcell" key={key} aria-selected={isSelected}>
              <button type="button" data-month={key} tabIndex={isFocus ? 0 : -1}
                className={cx("ui-month", isSelected && "is-selected", key === now && "is-today", blocked(key) && "is-blocked")}
                aria-label={`${MONTH_NAMES[month]} de ${focus.year}`} aria-current={key === now ? "date" : undefined} aria-disabled={blocked(key) || undefined}
                onClick={() => choose(key)}>{MONTH_SHORT[month]}</button>
            </span>;
          })}
        </div>)}
      </div>
      <div className="ui-calendar-footer">
        <button type="button" className="btn small ghost" disabled={blocked(now)} onClick={() => choose(now)}>Mês atual</button>
      </div>
    </div>}
  </div>;
});
