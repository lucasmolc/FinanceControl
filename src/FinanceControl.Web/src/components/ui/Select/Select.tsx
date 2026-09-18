import { forwardRef, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { Listbox } from "../shared/Listbox";
import { flattenOptions, optionId, type FlatOption, type OptionsInput, type SelectOption } from "../shared/options";
import { mergeRefs } from "../shared/refs";
import { edgeEnabled, nextEnabled, useTypeahead } from "../shared/typeahead";
import { useControllable } from "../shared/useControllable";
import { useDismiss } from "../shared/useDismiss";
import { useFloating } from "../shared/useFloating";

export interface SelectProps {
  options: OptionsInput;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, option: SelectOption | undefined) => void;
  /** Shown when nothing is selected. */
  placeholder?: string;
  /** Adds a blank first choice with this label (value ""), e.g. "Sem categoria". */
  emptyLabel?: string;
  /** Label for a stored value missing from `options` (removed record, unknown code). Defaults to the raw value. */
  missingLabel?: string;
  size?: Size;
  disabled?: boolean;
  required?: boolean;
  /** Form field name: renders a hidden input with the value. */
  name?: string;
  id?: string;
  className?: string;
  /** Custom rendering of the trigger content. */
  renderValue?: (option: SelectOption | undefined) => ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

/**
 * Select-only combobox (WAI-ARIA APG) replacing the native `<select>`: groups, icons, descriptions and type-ahead.
 * The trigger is a `<button role="combobox">`, so `<label htmlFor>` / `Field` label it. Keyboard: ↓/↑/Enter/Space/Alt+↓
 * open; ↑/↓/Home/End/PageUp/PageDown move; Enter/Space choose; Esc closes (without closing an enclosing dialog);
 * typing jumps to the matching option.
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select({ options, value, defaultValue = "", onChange, placeholder = "Selecione…", emptyLabel, missingLabel, size = "md", disabled = false, required, name, id, className, renderValue, ...aria }, ref) {
  const [current, setCurrent] = useControllable<string>(value, defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const typeahead = useTypeahead();

  const items: FlatOption[] = useMemo(() => {
    const flat = flattenOptions(options);
    const blank = emptyLabel !== undefined ? [{ option: { value: "", label: emptyLabel } }] : [];
    const missing = current !== "" && !flat.some(item => item.option.value === current) ? [{ option: { value: current, label: missingLabel ?? current } }] : [];
    return [...blank, ...missing, ...flat];
  }, [options, emptyLabel, missingLabel, current]);

  const selectedIndex = items.findIndex(item => item.option.value === current);
  const selectedOption = selectedIndex >= 0 ? items[selectedIndex]!.option : undefined;
  const isDisabled = (index: number) => Boolean(items[index]?.option.disabled);
  const style = useFloating(triggerRef, listRef, open, "bottom-start", true);

  useDismiss(open, [triggerRef, listRef], reason => { setOpen(false); if (reason === "escape") triggerRef.current?.focus(); });

  const openAt = (index: number) => {
    if (disabled) return;
    setActive(index);
    setOpen(true);
  };
  const choose = (index: number) => {
    const item = items[index];
    if (!item || item.option.disabled) return;
    setCurrent(item.option.value);
    onChange?.(item.option.value, item.option.value === "" && emptyLabel !== undefined ? undefined : item.option);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const count = items.length;
    const first = edgeEnabled(count, 1, isDisabled);
    const last = edgeEnabled(count, -1, isDisabled);
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openAt(selectedIndex >= 0 ? selectedIndex : event.key === "ArrowUp" ? last : first);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        openAt(event.key === "Home" ? first : last);
      } else {
        const found = typeahead(event.key, items.map(item => item.option.label), selectedIndex, isDisabled);
        if (found >= 0) { event.preventDefault(); openAt(found); }
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); setActive(index => nextEnabled(count, index, 1, isDisabled, false)); break;
      case "ArrowUp":
        event.preventDefault();
        if (event.altKey) choose(active);
        else setActive(index => nextEnabled(count, index < 0 ? count : index, -1, isDisabled, false));
        break;
      case "Home": event.preventDefault(); setActive(first); break;
      case "End": event.preventDefault(); setActive(last); break;
      case "PageDown": event.preventDefault(); setActive(index => Math.min(last, nextEnabled(count, Math.min(count - 1, index + 9), 1, isDisabled, false))); break;
      case "PageUp": event.preventDefault(); setActive(index => Math.max(first, nextEnabled(count, Math.max(0, index - 9), -1, isDisabled, false))); break;
      case "Enter": case " ": event.preventDefault(); choose(active); break;
      case "Escape": event.preventDefault(); event.stopPropagation(); setOpen(false); break;
      case "Tab": setOpen(false); break;
      default: {
        const found = typeahead(event.key, items.map(item => item.option.label), active, isDisabled);
        if (found >= 0) { event.preventDefault(); setActive(found); }
      }
    }
  };

  const showPlaceholder = !selectedOption || (selectedOption.value === "" && emptyLabel === undefined);
  return <div className={cx("ui-select", sizeClass(size), open && "is-open", className)}>
    <button
      ref={mergeRefs(ref, triggerRef)}
      id={id}
      type="button"
      role="combobox"
      className="ui-select-trigger ui-control"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open && active >= 0 ? optionId(listId, active) : undefined}
      aria-label={aria["aria-label"]}
      aria-labelledby={aria["aria-labelledby"]}
      aria-describedby={aria["aria-describedby"]}
      aria-invalid={aria["aria-invalid"] || undefined}
      aria-required={aria["aria-required"] ?? (required || undefined)}
      disabled={disabled}
      onClick={() => (open ? setOpen(false) : openAt(selectedIndex >= 0 ? selectedIndex : edgeEnabled(items.length, 1, isDisabled)))}
      onKeyDown={handleKeyDown}
    >
      <span className={cx("ui-select-value", showPlaceholder && "is-placeholder")}>
        {renderValue ? renderValue(selectedOption) : showPlaceholder ? placeholder : <>
          {selectedOption.icon && <span className="ui-option-icon" aria-hidden="true">{selectedOption.icon}</span>}
          <span className="ui-select-text">{selectedOption.label}</span>
        </>}
      </span>
      <ChevronDown className="ui-select-chevron" size={16} aria-hidden="true" />
    </button>
    {name && <input type="hidden" name={name} value={current} />}
    {open && <Listbox ref={listRef} id={listId} items={items} activeIndex={active} selected={new Set([current])} onSelect={choose} onActivate={setActive} style={style} labelledBy={aria["aria-labelledby"]} label={aria["aria-label"]} />}
  </div>;
});
