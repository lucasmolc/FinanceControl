import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { normalizeHex, readableOn } from "../shared/color";
import { nextEnabled } from "../shared/typeahead";
import { DEFAULT_SWATCHES, type ColorSwatch } from "./swatches";

export interface ColorPickerProps {
  /** "#rrggbb" or "" (none). */
  value: string;
  onChange: (hex: string) => void;
  swatches?: ColorSwatch[];
  /** Shows the "#rrggbb" text field. Default true. */
  allowCustom?: boolean;
  /** Adds a "Sem cor" choice (value ""). */
  allowNone?: boolean;
  size?: Size;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/**
 * Swatch radio group (roving tabindex; arrows move and choose) plus an optional "#rrggbb" field with live preview.
 * Each swatch has a pt-BR name, so the choice never depends on color alone.
 */
export const ColorPicker = forwardRef<HTMLDivElement, ColorPickerProps>(function ColorPicker({ value, onChange, swatches = DEFAULT_SWATCHES, allowCustom = true, allowNone = false, size = "md", disabled = false, id, className, ...aria }, ref) {
  const hexId = useId();
  const choices: ColorSwatch[] = allowNone ? [{ value: "", name: "Sem cor" }, ...swatches] : swatches;
  const current = normalizeHex(value) ?? "";
  const selectedIndex = choices.findIndex(swatch => (normalizeHex(swatch.value) ?? "") === current);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [text, setText] = useState(current);
  useEffect(() => { setText(current); }, [current]);
  const [typing, setTyping] = useState(false);
  const customInvalid = !typing && text.trim() !== "" && !normalizeHex(text);

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const never = () => false;
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = nextEnabled(choices.length, index, 1, never);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = nextEnabled(choices.length, index, -1, never);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = choices.length - 1;
    else return;
    event.preventDefault();
    const swatch = choices[next];
    if (!swatch) return;
    onChange(normalizeHex(swatch.value) ?? "");
    buttons.current[next]?.focus();
  };

  return <div ref={ref} id={id} className={cx("ui-colorpicker", sizeClass(size), className)}>
    <div role="radiogroup" className="ui-swatches" aria-label={aria["aria-label"] ?? (aria["aria-labelledby"] ? undefined : "Cor")} aria-labelledby={aria["aria-labelledby"]} aria-describedby={aria["aria-describedby"]}>
      {choices.map((swatch, index) => {
        const hex = normalizeHex(swatch.value);
        const checked = index === selectedIndex;
        return <button
          key={swatch.value || "none"}
          ref={element => { buttons.current[index] = element; }}
          type="button"
          role="radio"
          aria-checked={checked}
          aria-label={swatch.name}
          title={swatch.name}
          tabIndex={checked || (selectedIndex < 0 && index === 0) ? 0 : -1}
          disabled={disabled}
          className={cx("ui-swatch", !hex && "is-none", checked && "is-checked")}
          style={hex ? { background: hex, color: readableOn(hex) } : undefined}
          onClick={() => onChange(hex ?? "")}
          onKeyDown={event => handleKey(event, index)}
        >{checked && <Check size={14} strokeWidth={3} aria-hidden="true" />}</button>;
      })}
    </div>
    {allowCustom && <div className="ui-colorpicker-custom">
      <span className="ui-colorpicker-preview" aria-hidden="true" style={current ? { background: current } : undefined} />
      <label htmlFor={hexId} className="sr-only">Cor personalizada (hexadecimal)</label>
      <input id={hexId} type="text" className="ui-control ui-colorpicker-hex" placeholder="#rrggbb" maxLength={7} spellCheck={false} autoComplete="off"
        value={text} disabled={disabled} aria-invalid={customInvalid || undefined}
        onChange={event => {
          const next = event.target.value.startsWith("#") || event.target.value === "" ? event.target.value : `#${event.target.value}`;
          setText(next);
          setTyping(true);
          const hex = normalizeHex(next);
          if (hex && next.length === 7) onChange(hex);
          if (next === "" && allowNone) onChange("");
        }}
        onBlur={() => { setTyping(false); const hex = normalizeHex(text); if (hex) { setText(hex); if (hex !== current) onChange(hex); } else if (!text && !allowNone) setText(current); }} />
      {customInvalid && <span className="field-error" role="alert">Use o formato #rrggbb.</span>}
    </div>}
  </div>;
});
