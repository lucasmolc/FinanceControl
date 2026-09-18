import { forwardRef, useEffect, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "./cx";
import { optionId, type FlatOption } from "./options";

export interface ListboxProps {
  id: string;
  items: FlatOption[];
  activeIndex: number;
  selected: ReadonlySet<string>;
  onSelect: (index: number) => void;
  onActivate: (index: number) => void;
  multiselectable?: boolean;
  emptyMessage?: ReactNode;
  style?: CSSProperties;
  className?: string;
  label?: string;
  labelledBy?: string;
}

/**
 * Presentational listbox (APG): focus stays on the controlling element, which points at the active option via
 * aria-activedescendant. Consecutive options with the same `group` render inside a labelled role="group".
 */
export const Listbox = forwardRef<HTMLDivElement, ListboxProps>(function Listbox({ id, items, activeIndex, selected, onSelect, onActivate, multiselectable = false, emptyMessage = "Nenhuma opção.", style, className, label, labelledBy }, ref) {
  useEffect(() => {
    if (activeIndex < 0) return;
    const element = document.getElementById(optionId(id, activeIndex));
    element?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, id]);

  const blocks: Array<{ group?: string; start: number; entries: FlatOption[] }> = [];
  items.forEach((item, index) => {
    const last = blocks[blocks.length - 1];
    if (last && last.group === item.group) last.entries.push(item);
    else blocks.push({ group: item.group, start: index, entries: [item] });
  });

  const renderOption = (item: FlatOption, index: number) => {
    const isSelected = selected.has(item.option.value);
    return <div
      key={`${item.option.value}-${index}`}
      id={optionId(id, index)}
      role="option"
      aria-selected={isSelected}
      aria-disabled={item.option.disabled || undefined}
      className={cx("ui-option", index === activeIndex && "is-active", isSelected && "is-selected", item.option.disabled && "is-disabled")}
      onMouseDown={event => event.preventDefault()}
      onMouseMove={() => { if (index !== activeIndex && !item.option.disabled) onActivate(index); }}
      onClick={() => { if (!item.option.disabled) onSelect(index); }}
    >
      {multiselectable && <span className="ui-option-check" aria-hidden="true">{isSelected && <Check size={12} />}</span>}
      {item.option.icon && <span className="ui-option-icon" aria-hidden="true">{item.option.icon}</span>}
      <span className="ui-option-text">
        <span className="ui-option-label">{item.option.label}</span>
        {item.option.description && <span className="ui-option-description">{item.option.description}</span>}
      </span>
      {!multiselectable && isSelected && <Check className="ui-option-tick" size={16} aria-hidden="true" />}
    </div>;
  };

  return <div ref={ref} id={id} role="listbox" aria-multiselectable={multiselectable || undefined} aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} className={cx("ui-listbox", className)} style={style} tabIndex={-1}>
    {!items.length && <div className="ui-listbox-empty" role="presentation">{emptyMessage}</div>}
    {blocks.map(block => block.group
      ? <div role="group" key={`g-${block.start}`} aria-labelledby={`${id}-g-${block.start}`} className="ui-listbox-group">
        <div role="presentation" id={`${id}-g-${block.start}`} className="ui-listbox-group-label">{block.group}</div>
        {block.entries.map((item, offset) => renderOption(item, block.start + offset))}
      </div>
      : block.entries.map((item, offset) => renderOption(item, block.start + offset)))}
  </div>;
});
