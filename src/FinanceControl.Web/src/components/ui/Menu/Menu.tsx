import { cloneElement, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement } from "react";
import { Ellipsis } from "lucide-react";
import { IconButton } from "../IconButton/IconButton";
import { cx, sizeClass, type Size } from "../shared/cx";
import { renderIcon, type IconProp } from "../shared/icon";
import { useTypeahead } from "../shared/typeahead";
import { useDismiss } from "../shared/useDismiss";
import { useFloating, type Placement } from "../shared/useFloating";

export interface MenuActionItem {
  type?: "item";
  id?: string;
  label: string;
  icon?: IconProp;
  onSelect: () => void;
  tone?: "neutral" | "danger";
  disabled?: boolean;
  /** Why it is disabled (shown as description/title). */
  disabledReason?: string;
  /** Display-only shortcut hint, e.g. "Ctrl+E". */
  shortcut?: string;
  description?: string;
}

export type MenuEntry = MenuActionItem | { type: "separator" } | { type: "label"; label: string };

interface TriggerProps {
  id?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  "aria-haspopup"?: "menu";
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
}

export interface DropdownMenuProps {
  items: MenuEntry[];
  /** Custom trigger (a button). Default: IconButton "⋯" labelled by `label`. */
  trigger?: ReactElement<TriggerProps>;
  /** Accessible name of the default trigger and the menu, e.g. "Ações de Nubank". */
  label?: string;
  placement?: Placement;
  size?: Size;
  disabled?: boolean;
  className?: string;
}

const isAction = (entry: MenuEntry): entry is MenuActionItem => entry.type === undefined || entry.type === "item";

/**
 * Menu button (APG): Enter/Space/↓ open on the first item, ↑ on the last; ↑/↓/Home/End move, typing jumps,
 * Enter/Space run the item, Esc closes (focus back to the trigger), Tab closes. Ideal for row actions.
 */
export function DropdownMenu({ items, trigger, label = "Mais ações", placement = "bottom-end", size = "md", disabled = false, className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const menuId = `${baseId}-menu`;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const typeahead = useTypeahead();
  const style = useFloating(anchorRef, menuRef, open, placement);

  const actions = items.map((entry, index) => ({ entry, index })).filter(({ entry }) => isAction(entry)) as Array<{ entry: MenuActionItem; index: number }>;
  const enabled = actions.filter(({ entry }) => !entry.disabled).map(({ index }) => index);

  const focusTrigger = () => document.getElementById(triggerId)?.focus();
  const close = (restore: boolean) => { setOpen(false); setFocusIndex(-1); if (restore) focusTrigger(); };
  useDismiss(open, [anchorRef, menuRef], reason => close(reason === "escape"));

  useEffect(() => {
    if (open && focusIndex >= 0) itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  const openAt = (which: "first" | "last") => {
    if (disabled || !enabled.length) return;
    setFocusIndex(which === "first" ? enabled[0]! : enabled[enabled.length - 1]!);
    setOpen(true);
  };

  const run = (entry: MenuActionItem) => {
    if (entry.disabled) return;
    close(true);
    entry.onSelect();
  };

  const move = (delta: number) => {
    const position = enabled.indexOf(focusIndex);
    const next = enabled[(position + delta + enabled.length) % enabled.length];
    if (next !== undefined) setFocusIndex(next);
  };

  const handleMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); move(1); break;
      case "ArrowUp": event.preventDefault(); move(-1); break;
      case "Home": event.preventDefault(); setFocusIndex(enabled[0] ?? -1); break;
      case "End": event.preventDefault(); setFocusIndex(enabled[enabled.length - 1] ?? -1); break;
      case "Tab": close(false); break;
      case "Enter": case " ": {
        event.preventDefault();
        const entry = items[focusIndex];
        if (entry && isAction(entry)) run(entry);
        break;
      }
      default: {
        const labels = items.map(entry => (isAction(entry) ? entry.label : ""));
        const found = typeahead(event.key, labels, focusIndex, index => !enabled.includes(index));
        if (found >= 0) { event.preventDefault(); setFocusIndex(found); }
      }
    }
  };

  const triggerProps: TriggerProps = {
    id: triggerId,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: event => { trigger?.props.onClick?.(event); if (open) close(false); else openAt("first"); },
    onKeyDown: event => {
      trigger?.props.onKeyDown?.(event);
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") { event.preventDefault(); openAt("first"); }
      else if (event.key === "ArrowUp") { event.preventDefault(); openAt("last"); }
    },
  };

  return <span ref={anchorRef} className={cx("ui-menu-anchor", className)}>
    {trigger ? cloneElement(trigger, triggerProps) : <IconButton label={label} icon={Ellipsis} size={size} disabled={disabled} {...triggerProps} />}
    {open && <div ref={menuRef} id={menuId} role="menu" aria-labelledby={triggerId} aria-label={trigger ? label : undefined} className={cx("ui-menu", sizeClass(size))} style={style} onKeyDown={handleMenuKey}>
      {items.map((entry, index) => {
        if (entry.type === "separator") return <div key={`s-${index}`} role="separator" className="ui-menu-separator" />;
        if (entry.type === "label") return <div key={`l-${index}`} role="presentation" className="ui-menu-label">{entry.label}</div>;
        return <div
          key={entry.id ?? `${entry.label}-${index}`}
          ref={element => { itemRefs.current[index] = element; }}
          role="menuitem"
          tabIndex={-1}
          aria-disabled={entry.disabled || undefined}
          title={entry.disabled ? entry.disabledReason : undefined}
          className={cx("ui-menu-item", entry.tone === "danger" && "tone-danger", entry.disabled && "is-disabled")}
          onClick={() => run(entry)}
          onMouseMove={() => { if (!entry.disabled && focusIndex !== index) setFocusIndex(index); }}
        >
          {renderIcon(entry.icon, 16)}
          <span className="ui-menu-text">
            <span>{entry.label}</span>
            {(entry.description || (entry.disabled && entry.disabledReason)) && <span className="ui-menu-description">{entry.disabled && entry.disabledReason ? entry.disabledReason : entry.description}</span>}
          </span>
          {entry.shortcut && <kbd className="ui-kbd" aria-hidden="true">{entry.shortcut}</kbd>}
        </div>;
      })}
    </div>}
  </span>;
}

/** Alias of `DropdownMenu`. */
export const Menu = DropdownMenu;
