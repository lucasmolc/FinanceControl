import { forwardRef, useId, type ReactNode } from "react";
import { cx, sizeClass, type Size } from "../shared/cx";

export interface RadioCardOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardsProps {
  options: RadioCardOption[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible group name (or aria-labelledby). */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  name?: string;
  columns?: 1 | 2 | 3 | 4;
  size?: Size;
  disabled?: boolean;
  className?: string;
}

/** Radio group rendered as selectable cards (native radios: arrows move and select, Tab enters/leaves the group). */
export const RadioCards = forwardRef<HTMLDivElement, RadioCardsProps>(function RadioCards({ options, value, onChange, name, columns = 2, size = "md", disabled = false, className, ...aria }, ref) {
  const generated = useId();
  const groupName = name ?? generated;
  return <div ref={ref} role="radiogroup" className={cx("ui-radio-cards", `cols-${columns}`, sizeClass(size), className)} aria-label={aria["aria-label"]} aria-labelledby={aria["aria-labelledby"]} aria-describedby={aria["aria-describedby"]}>
    {options.map(option => {
      const optionId = `${groupName}-${option.value}`;
      const isDisabled = disabled || option.disabled;
      return <label key={option.value} htmlFor={optionId} className={cx("ui-radio-card", value === option.value && "is-checked", isDisabled && "is-disabled")}>
        <input id={optionId} type="radio" name={groupName} value={option.value} checked={value === option.value} disabled={isDisabled}
          aria-labelledby={`${optionId}-l`} aria-describedby={option.description ? `${optionId}-d` : undefined} onChange={() => onChange(option.value)} />
        {option.icon && <span className="ui-radio-card-icon" aria-hidden="true">{option.icon}</span>}
        <span className="ui-radio-card-text">
          <span id={`${optionId}-l`} className="ui-radio-card-label">{option.label}</span>
          {option.description && <span id={`${optionId}-d`} className="ui-field-description">{option.description}</span>}
        </span>
        <span className="ui-radio-card-dot" aria-hidden="true" />
      </label>;
    })}
  </div>;
});
