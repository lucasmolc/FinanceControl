import { forwardRef, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { renderIcon, type IconProp } from "../shared/icon";
import { nextEnabled } from "../shared/typeahead";
import { useControllable } from "../shared/useControllable";

export interface TabItem {
  id: string;
  label: ReactNode;
  icon?: IconProp;
  /** Count or short badge after the label. */
  badge?: ReactNode;
  disabled?: boolean;
  /** Panel content; omit to render panels yourself (use `tabPanelProps`). */
  content?: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** "automatic" selects on arrow focus (default); "manual" needs Enter/Space. */
  activation?: "automatic" | "manual";
  variant?: "line" | "pills";
  size?: Size;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  fullWidth?: boolean;
  className?: string;
}

/** APG tabs: roving tabindex, ←/→/Home/End, automatic or manual activation; inactive panels are `hidden`. */
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs({ tabs, value, defaultValue, onChange, activation = "automatic", variant = "line", size = "md", fullWidth = false, className, ...aria }, ref) {
  const firstEnabled = tabs.find(tab => !tab.disabled)?.id ?? "";
  const [selected, setSelected] = useControllable(value, defaultValue ?? firstEnabled, onChange);
  const baseId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, tabs.findIndex(tab => tab.id === selected));
  const isDisabled = (index: number) => Boolean(tabs[index]?.disabled);
  const hasPanels = tabs.some(tab => tab.content !== undefined);

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === "ArrowRight") next = nextEnabled(tabs.length, index, 1, isDisabled);
    else if (event.key === "ArrowLeft") next = nextEnabled(tabs.length, index, -1, isDisabled);
    else if (event.key === "Home") next = nextEnabled(tabs.length, -1, 1, isDisabled, false);
    else if (event.key === "End") next = nextEnabled(tabs.length, tabs.length, -1, isDisabled, false);
    else if ((event.key === "Enter" || event.key === " ") && activation === "manual") { event.preventDefault(); const tab = tabs[index]; if (tab) setSelected(tab.id); return; }
    else return;
    event.preventDefault();
    buttons.current[next]?.focus();
    const target = tabs[next];
    if (activation === "automatic" && target) setSelected(target.id);
  };

  return <div ref={ref} className={cx("ui-tabs", `variant-${variant}`, sizeClass(size), className)}>
    <div role="tablist" className={cx("ui-tablist", fullWidth && "full-width")} aria-label={aria["aria-label"]} aria-labelledby={aria["aria-labelledby"]}>
      {tabs.map((tab, index) => {
        const isSelected = index === selectedIndex;
        return <button key={tab.id} ref={element => { buttons.current[index] = element; }} id={`${baseId}-tab-${tab.id}`} type="button" role="tab"
          aria-selected={isSelected} aria-controls={hasPanels ? `${baseId}-panel-${tab.id}` : undefined} tabIndex={isSelected ? 0 : -1} disabled={tab.disabled}
          className={cx("ui-tab", isSelected && "is-selected")} onClick={() => setSelected(tab.id)} onKeyDown={event => handleKey(event, index)}>
          {renderIcon(tab.icon, 16)}
          <span>{tab.label}</span>
          {tab.badge !== undefined && <span className="ui-tab-badge">{tab.badge}</span>}
        </button>;
      })}
    </div>
    {hasPanels && tabs.map((tab, index) => <div key={tab.id} id={`${baseId}-panel-${tab.id}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab.id}`} tabIndex={0} hidden={index !== selectedIndex} className="ui-tabpanel">
      {index === selectedIndex && tab.content}
    </div>)}
  </div>;
});
