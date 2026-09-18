import { forwardRef, useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { cx, sizeClass, type Size } from "../shared/cx";

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: Size;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  /** Text for screen readers (aria-valuetext), e.g. "110% do CDI". */
  format?: (value: number) => string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/** Styled native range input (native slider semantics and keys: arrows, PageUp/PageDown, Home/End). */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider({ value, onChange, min = 0, max = 100, step = 1, size = "md", disabled, id, name, className, format, ...aria }, ref) {
  const fill = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0;
  return <input
    ref={ref}
    id={id}
    name={name}
    type="range"
    className={cx("ui-slider", sizeClass(size), className)}
    style={{ "--fill": `${fill}%` } as CSSProperties}
    min={min}
    max={max}
    step={step}
    value={value}
    disabled={disabled}
    aria-valuetext={format ? format(value) : undefined}
    {...aria}
    onChange={event => onChange(Number(event.target.value))}
  />;
});

export interface RangeFieldProps extends Omit<SliderProps, "aria-label" | "aria-labelledby"> {
  label: ReactNode;
  hint?: ReactNode;
  /** Shows a numeric text input next to the slider. Default true. */
  showInput?: boolean;
  /** Suffix shown after the numeric input (e.g. "%", "meses"). */
  unit?: string;
  /** Fraction digits accepted by the numeric input (default: from `step`). */
  decimals?: number;
}

const decimalsOf = (step: number) => (String(step).split(".")[1] ?? "").length;
const toText = (value: number, decimals: number) => value.toFixed(decimals).replace(".", ",");

/**
 * Slider + numeric input + live `<output>` (`.range-field` contract). Typed values accept "12,5"; they are clamped to
 * [min, max] and rounded to `step` on blur/Enter.
 */
export const RangeField = forwardRef<HTMLInputElement, RangeFieldProps>(function RangeField({ label, hint, showInput = true, unit, decimals, value, onChange, min = 0, max = 100, step = 1, format, id, className, disabled, size, ...rest }, ref) {
  const generated = useId();
  const sliderId = id ?? generated;
  const labelId = `${sliderId}-label`;
  const hintId = `${sliderId}-hint`;
  const digits = decimals ?? decimalsOf(step);
  const [text, setText] = useState(() => toText(value, digits));
  useEffect(() => { setText(toText(value, digits)); }, [value, digits]);

  const commitText = () => {
    const parsed = Number(text.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(parsed) || text.trim() === "") { setText(toText(value, digits)); return; }
    const clamped = Math.min(max, Math.max(min, parsed));
    const snapped = Number((Math.round((clamped - min) / step) * step + min).toFixed(Math.max(digits, decimalsOf(step))));
    setText(toText(snapped, digits));
    if (snapped !== value) onChange(snapped);
  };

  return <div className={cx("range-field ui-range-field", sizeClass(size), className)}>
    <div className="ui-range-head">
      <span id={labelId} className="ui-range-label">{label}</span>
      <output htmlFor={sliderId} aria-live="off">{format ? format(value) : `${toText(value, digits)}${unit ? ` ${unit}` : ""}`}</output>
    </div>
    <div className="ui-range-body">
      <Slider ref={ref} id={sliderId} value={value} onChange={onChange} min={min} max={max} step={step} format={format} disabled={disabled} size={size} aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined} {...rest} />
      {showInput && <span className="ui-range-input ui-control">
        <input type="text" inputMode="decimal" aria-labelledby={labelId} value={text} disabled={disabled}
          onChange={event => setText(event.target.value)} onBlur={commitText}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commitText(); } }} />
        {unit && <span className="ui-range-unit" aria-hidden="true">{unit}</span>}
      </span>}
    </div>
    {hint && <p id={hintId} className="field-hint">{hint}</p>}
  </div>;
});
