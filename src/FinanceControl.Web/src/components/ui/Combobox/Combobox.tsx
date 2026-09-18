import { forwardRef, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { Listbox } from "../shared/Listbox";
import { flattenOptions, optionId, type FlatOption, type OptionsInput, type SelectOption } from "../shared/options";
import { mergeRefs } from "../shared/refs";
import { fuzzyScore } from "../shared/text";
import { edgeEnabled, nextEnabled } from "../shared/typeahead";
import { useDismiss } from "../shared/useDismiss";
import { useFloating } from "../shared/useFloating";

interface ComboboxBaseProps {
  options: OptionsInput;
  placeholder?: string;
  /** Shown when the search matches nothing. */
  emptyMessage?: ReactNode;
  size?: Size;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  className?: string;
  /** Custom filter; default = fuzzy match on label, description and keywords. */
  filter?: (option: SelectOption, query: string) => boolean;
  /** Called with the typed text (e.g. to load options remotely). */
  onInputChange?: (text: string) => void;
  /** Show a clear (×) button when there is a value. */
  clearable?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

export interface ComboboxSingleProps extends ComboboxBaseProps {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null, option: SelectOption | undefined) => void;
}

export interface ComboboxMultiProps extends ComboboxBaseProps {
  multiple: true;
  value: string[];
  onChange: (values: string[]) => void;
  /** Max chips shown before "+N". */
  maxChips?: number;
}

export type ComboboxProps = ComboboxSingleProps | ComboboxMultiProps;

function matches(option: SelectOption, query: string): number {
  return Math.max(fuzzyScore(query, option.label), ...(option.keywords ?? []).map(keyword => fuzzyScore(query, keyword) * 0.9), option.description ? fuzzyScore(query, option.description) * 0.5 : 0);
}

/**
 * Editable combobox with list autocomplete (WAI-ARIA APG): search, groups, icons, empty state and optional multi-selection
 * (chips; Backspace on an empty input removes the last one). The `<input role="combobox">` is labelable by `Field`.
 */
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(props, ref) {
  const { options, placeholder = "Buscar…", emptyMessage = "Nenhum resultado.", size = "md", disabled = false, required, name, id, className, filter, onInputChange, clearable = true, ...rest } = props;
  const aria = { label: rest["aria-label"], labelledBy: rest["aria-labelledby"], describedBy: rest["aria-describedby"], invalid: rest["aria-invalid"], required: rest["aria-required"] };
  const multiple = props.multiple === true;
  const selectedValues = useMemo(() => new Set(props.multiple ? props.value : props.value != null ? [props.value] : []), [props.multiple, props.value]);
  const all = useMemo(() => flattenOptions(options), [options]);
  const selectedSingle = !multiple ? all.find(item => selectedValues.has(item.option.value))?.option : undefined;

  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const style = useFloating(wrapRef, listRef, open, "bottom-start", true);

  const items: FlatOption[] = useMemo(() => {
    const text = query ?? "";
    if (!text.trim()) return all;
    if (filter) return all.filter(item => filter(item.option, text));
    const groups = [...new Set(all.map(item => item.group ?? ""))];
    return all.map(item => ({ item, score: matches(item.option, text), rank: groups.indexOf(item.group ?? "") }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => a.rank - b.rank || b.score - a.score)
      .map(entry => entry.item);
  }, [all, query, filter]);

  const isDisabled = (index: number) => Boolean(items[index]?.option.disabled);
  const close = () => { setOpen(false); setQuery(null); };
  useDismiss(open, [wrapRef, listRef], reason => { close(); if (reason === "escape") inputRef.current?.focus(); });

  const openList = (index?: number) => {
    if (disabled) return;
    setOpen(true);
    setActive(index ?? edgeEnabled(items.length, 1, isDisabled));
  };

  const choose = (index: number) => {
    const item = items[index];
    if (!item || item.option.disabled) return;
    if (props.multiple) {
      const next = selectedValues.has(item.option.value) ? props.value.filter(value => value !== item.option.value) : [...props.value, item.option.value];
      props.onChange(next);
      setQuery(null);
      onInputChange?.("");
    } else {
      props.onChange(item.option.value, item.option);
      close();
    }
    inputRef.current?.focus();
  };

  const clear = () => {
    if (props.multiple) props.onChange([]);
    else props.onChange(null, undefined);
    setQuery(null);
    inputRef.current?.focus();
  };

  const removeValue = (value: string) => {
    if (props.multiple) props.onChange(props.value.filter(entry => entry !== value));
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = items.length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openList(event.altKey ? -1 : undefined);
        else setActive(index => nextEnabled(count, index, 1, isDisabled, false));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openList(edgeEnabled(count, -1, isDisabled));
        else setActive(index => nextEnabled(count, index < 0 ? count : index, -1, isDisabled, false));
        break;
      case "Home": if (open && event.ctrlKey) { event.preventDefault(); setActive(edgeEnabled(count, 1, isDisabled)); } break;
      case "End": if (open && event.ctrlKey) { event.preventDefault(); setActive(edgeEnabled(count, -1, isDisabled)); } break;
      case "Enter":
        if (open && active >= 0) { event.preventDefault(); choose(active); }
        break;
      case "Escape":
        if (open) { event.preventDefault(); event.stopPropagation(); close(); }
        else if (query) { event.preventDefault(); event.stopPropagation(); setQuery(null); }
        break;
      case "Backspace":
        if (props.multiple && !(query ?? "") && props.value.length) removeValue(props.value[props.value.length - 1]!);
        break;
      case "Tab": close(); break;
    }
  };

  const inputValue = query ?? (!multiple ? selectedSingle?.label ?? (props.value ?? "") : "");
  const chips = props.multiple ? props.value.map(value => all.find(item => item.option.value === value)?.option ?? { value, label: value }) : [];
  const maxChips = props.multiple ? props.maxChips ?? 4 : 0;
  const hasValue = selectedValues.size > 0;
  const hiddenValue = props.multiple ? props.value.join(",") : props.value ?? "";

  return <div ref={wrapRef} className={cx("ui-combobox ui-control", sizeClass(size), open && "is-open", disabled && "is-disabled", multiple && "is-multiple", className)} onClick={event => { if (event.target === event.currentTarget) inputRef.current?.focus(); }}>
    {!multiple && selectedSingle?.icon && query === null ? <span className="ui-option-icon" aria-hidden="true">{selectedSingle.icon}</span> : <Search className="ui-combobox-search" size={15} aria-hidden="true" />}
    {chips.slice(0, maxChips).map(option => <span key={option.value} className="ui-chip">
      {option.icon && <span className="ui-option-icon" aria-hidden="true">{option.icon}</span>}
      <span className="ui-chip-label">{option.label}</span>
      <button type="button" className="ui-chip-remove" aria-label={`Remover ${option.label}`} disabled={disabled} onClick={() => removeValue(option.value)}><X size={12} aria-hidden="true" /></button>
    </span>)}
    {chips.length > maxChips && <span className="ui-chip is-more">+{chips.length - maxChips}</span>}
    <input
      ref={mergeRefs(ref, inputRef)}
      id={id}
      type="text"
      role="combobox"
      className="ui-combobox-input"
      autoComplete="off"
      spellCheck={false}
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open && active >= 0 && items[active] ? optionId(listId, active) : undefined}
      aria-label={aria.label}
      aria-labelledby={aria.labelledBy}
      aria-describedby={aria.describedBy}
      aria-invalid={aria.invalid || undefined}
      aria-required={aria.required ?? (required || undefined)}
      placeholder={multiple && chips.length ? "" : placeholder}
      disabled={disabled}
      value={inputValue}
      onChange={event => {
        setQuery(event.target.value);
        onInputChange?.(event.target.value);
        setOpen(true);
        setActive(0);
      }}
      onFocus={event => { if (!multiple && query === null) event.currentTarget.select(); }}
      onClick={() => { if (!open) openList(); }}
      onKeyDown={handleKeyDown}
    />
    {clearable && hasValue && !disabled && <button type="button" className="ui-combobox-clear" aria-label="Limpar seleção" onClick={clear}><X size={14} aria-hidden="true" /></button>}
    <button type="button" className="ui-combobox-toggle" tabIndex={-1} aria-label={open ? "Fechar opções" : "Mostrar opções"} disabled={disabled} onClick={() => { if (open) close(); else { openList(); inputRef.current?.focus(); } }}>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {name && <input type="hidden" name={name} value={hiddenValue} />}
    {open && <Listbox ref={listRef} id={listId} items={items} activeIndex={active} selected={selectedValues} onSelect={choose} onActivate={setActive} multiselectable={multiple} emptyMessage={emptyMessage} style={style} label={aria.label} labelledBy={aria.labelledBy} />}
  </div>;
});
