import { forwardRef, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { renderIcon, type IconProp } from "../shared/icon";
import { nextEnabled } from "../shared/typeahead";

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  icon?: IconProp;
  /** Required when `label` is not text (icon-only segments). */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  size?: Size;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Segmented control = radio group of buttons (APG radio group: roving tabindex; arrows move and select). */
export const Segmented = forwardRef<HTMLDivElement, SegmentedProps>(function Segmented({ options, value, onChange, size = "md", fullWidth = false, disabled = false, className, ...aria }, ref) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const isDisabled = (index: number) => disabled || Boolean(options[index]?.disabled);

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = nextEnabled(options.length, index, 1, isDisabled);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = nextEnabled(options.length, index, -1, isDisabled);
    else if (event.key === "Home") next = nextEnabled(options.length, -1, 1, isDisabled, false);
    else if (event.key === "End") next = nextEnabled(options.length, options.length, -1, isDisabled, false);
    else return;
    event.preventDefault();
    const option = options[next];
    if (!option || isDisabled(next)) return;
    onChange(option.value);
    buttons.current[next]?.focus();
  };

  return <div ref={ref} role="radiogroup" className={cx("segmented ui-segmented", sizeClass(size), fullWidth && "full-width", className)} aria-label={aria["aria-label"]} aria-labelledby={aria["aria-labelledby"]}>
    {options.map((option, index) => {
      const checked = option.value === value;
      return <button
        key={option.value}
        ref={element => { buttons.current[index] = element; }}
        type="button"
        role="radio"
        aria-checked={checked}
        aria-label={option.ariaLabel}
        tabIndex={index === selectedIndex ? 0 : -1}
        disabled={isDisabled(index)}
        className={cx(checked && "is-checked")}
        onClick={() => onChange(option.value)}
        onKeyDown={event => handleKey(event, index)}
      >
        {renderIcon(option.icon, size === "lg" ? 18 : 15)}
        {option.label}
      </button>;
    })}
  </div>;
});
