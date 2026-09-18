import { forwardRef, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Search } from "lucide-react";
import { ICON_GROUPS, iconById, searchIcons, type IconDefinition, type IconKind } from "../../../lib/icons";
import { CategoryIcon } from "../CategoryIcon/CategoryIcon";
import { cx, sizeClass, type Size } from "../shared/cx";
import { mergeRefs } from "../shared/refs";
import { useDismiss } from "../shared/useDismiss";
import { useFloating } from "../shared/useFloating";
import { gridMove } from "./gridNavigation";

export interface IconPickerProps {
  /** Glyph id from lib/icons (null/"" = none). */
  value: string | null;
  onChange: (id: string) => void;
  /** Tint of the previews ("#rrggbb"). */
  color?: string | null;
  /** Only glyphs suited to this kind. */
  kind?: IconKind;
  placeholder?: string;
  size?: Size;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

const COLUMNS = 6;

/**
 * Category glyph picker (MEL-39): trigger with the current icon; popover with search and a grouped grid listbox.
 * Typing filters (labels, groups and aliases in pt-BR); arrows move in the grid (↑/↓ keep the column across groups, gridNavigation.ts); Enter chooses; Esc closes.
 */
export const IconPicker = forwardRef<HTMLButtonElement, IconPickerProps>(function IconPicker({ value, onChange, color, kind, placeholder = "Escolher ícone", size = "md", disabled = false, id, className, ...aria }, ref) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const style = useFloating(triggerRef, popRef, open, "bottom-start");
  const current = iconById(value);

  const results = useMemo(() => {
    const found = searchIcons(query, kind);
    return ICON_GROUPS.flatMap(group => found.filter(item => item.group === group.id));
  }, [query, kind]);
  const groups = useMemo(() => {
    const blocks: Array<{ id: string; label: string; start: number; items: IconDefinition[] }> = [];
    results.forEach((item, index) => {
      const last = blocks[blocks.length - 1];
      if (last?.id === item.group) last.items.push(item);
      else blocks.push({ id: item.group, label: ICON_GROUPS.find(group => group.id === item.group)!.label, start: index, items: [item] });
    });
    return blocks;
  }, [results]);

  const close = (restore: boolean) => { setOpen(false); setQuery(""); if (restore) triggerRef.current?.focus(); };
  useDismiss(open, [triggerRef, popRef], reason => close(reason === "escape"));

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" }); }, [active, listId]);

  const openPicker = () => {
    if (disabled) return;
    const index = searchIcons("", kind).findIndex(item => item.id === value);
    setActive(Math.max(0, index));
    setOpen(true);
  };
  const choose = (index: number) => {
    const item = results[index];
    if (!item) return;
    onChange(item.id);
    close(true);
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") { event.preventDefault(); choose(active); return; }
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setActive(gridMove(groups.map(group => group.items.length), active, event.key, COLUMNS));
  };

  return <div className={cx("ui-iconpicker", sizeClass(size), className)}>
    <button ref={mergeRefs(ref, triggerRef)} id={id} type="button" className="ui-select-trigger ui-control" aria-haspopup="dialog" aria-expanded={open}
      aria-label={aria["aria-label"]} aria-labelledby={aria["aria-labelledby"]} aria-describedby={aria["aria-describedby"]} disabled={disabled}
      onClick={() => (open ? close(false) : openPicker())}>
      <span className={cx("ui-select-value", !current && "is-placeholder")}>
        {current ? <><CategoryIcon icon={current.id} color={color} size="sm" /><span className="ui-select-text">{current.label}</span></> : placeholder}
      </span>
      <ChevronDown className="ui-select-chevron" size={16} aria-hidden="true" />
    </button>
    {open && <div ref={popRef} className="ui-popover ui-iconpicker-pop" role="dialog" aria-modal="false" aria-label="Escolher ícone" style={style}>
      <div className="ui-search ui-control size-sm">
        <Search className="ui-search-icon" size={14} aria-hidden="true" />
        <input ref={inputRef} type="text" role="combobox" className="ui-search-input" aria-label="Buscar ícone" aria-expanded="true" aria-controls={listId}
          aria-autocomplete="list" aria-activedescendant={results[active] ? `${listId}-${active}` : undefined} placeholder="Buscar: mercado, academia, luz…"
          autoComplete="off" spellCheck={false} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={handleKey} />
      </div>
      <div id={listId} role="listbox" aria-label="Ícones" className="ui-iconpicker-list">
        {!results.length && <p className="ui-listbox-empty" role="presentation">Nenhum ícone para “{query}”.</p>}
        {groups.map(group => <div key={group.id} role="group" aria-labelledby={`${listId}-g-${group.id}`}>
          <div id={`${listId}-g-${group.id}`} role="presentation" className="ui-listbox-group-label">{group.label}</div>
          <div className="ui-iconpicker-grid" role="presentation">
            {group.items.map((item, offset) => {
              const index = group.start + offset;
              return <div key={item.id} id={`${listId}-${index}`} role="option" aria-selected={item.id === value} title={item.label}
                className={cx("ui-iconpicker-option", index === active && "is-active", item.id === value && "is-selected")}
                onMouseDown={event => event.preventDefault()} onMouseMove={() => { if (index !== active) setActive(index); }} onClick={() => choose(index)}>
                <CategoryIcon icon={item.id} color={color ?? item.color} size={32} />
                <span className="sr-only">{item.label}</span>
              </div>;
            })}
          </div>
        </div>)}
      </div>
      {results[active] && <p className="ui-iconpicker-hint muted" aria-hidden="true">{results[active].label}</p>}
    </div>}
  </div>;
});
