import { forwardRef, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { useControllable } from "../shared/useControllable";

export interface AccordionItem {
  id: string;
  title: ReactNode;
  content: ReactNode;
  /** Extra text on the right of the header (e.g. a total). */
  meta?: ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Ids of the open panels (controlled). */
  value?: string[];
  defaultValue?: string[];
  onChange?: (open: string[]) => void;
  /** Allow several open panels (default true). */
  multiple?: boolean;
  headingLevel?: 2 | 3 | 4;
  size?: Size;
  className?: string;
}

/** APG accordion: heading > button[aria-expanded] controlling a region; ↑/↓/Home/End move between headers. */
export const Accordion = forwardRef<HTMLDivElement, AccordionProps>(function Accordion({ items, value, defaultValue = [], onChange, multiple = true, headingLevel = 3, size = "md", className }, ref) {
  const [open, setOpen] = useControllable(value, defaultValue, onChange);
  const baseId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

  const toggle = (id: string) => {
    const isOpen = open.includes(id);
    setOpen(isOpen ? open.filter(entry => entry !== id) : multiple ? [...open, id] : [id]);
  };

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabled = items.map((item, position) => (item.disabled ? -1 : position)).filter(position => position >= 0);
    const at = enabled.indexOf(index);
    let target: number | undefined;
    if (event.key === "ArrowDown") target = enabled[(at + 1) % enabled.length];
    else if (event.key === "ArrowUp") target = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") target = enabled[0];
    else if (event.key === "End") target = enabled[enabled.length - 1];
    else return;
    event.preventDefault();
    if (target !== undefined) buttons.current[target]?.focus();
  };

  return <div ref={ref} className={cx("ui-accordion", sizeClass(size), className)}>
    {items.map((item, index) => {
      const expanded = open.includes(item.id);
      const headerId = `${baseId}-h-${index}`;
      const panelId = `${baseId}-p-${index}`;
      return <div key={item.id} className={cx("ui-accordion-item", expanded && "is-open")}>
        <Heading className="ui-accordion-heading">
          <button ref={element => { buttons.current[index] = element; }} id={headerId} type="button" className="ui-accordion-trigger" aria-expanded={expanded} aria-controls={panelId} disabled={item.disabled}
            onClick={() => toggle(item.id)} onKeyDown={event => handleKey(event, index)}>
            <span className="ui-accordion-title">{item.title}</span>
            {item.meta && <span className="ui-accordion-meta">{item.meta}</span>}
            <ChevronDown className="ui-accordion-chevron" size={18} aria-hidden="true" />
          </button>
        </Heading>
        <div id={panelId} role="region" aria-labelledby={headerId} className="ui-accordion-panel" hidden={!expanded}>{item.content}</div>
      </div>;
    })}
  </div>;
});
