import { forwardRef, useEffect, useId, useRef, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { mergeRefs } from "../shared/refs";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "onChange"> {
  /** Called with the new checked state. */
  onChange?: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
  /** Mixed state (e.g. "select all" with some rows selected). */
  indeterminate?: boolean;
  label?: ReactNode;
  description?: ReactNode;
  size?: Size;
}

/** Styled native checkbox (keeps native keyboard/form behaviour); supports indeterminate. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ onChange, indeterminate = false, label, description, size = "md", className, id, disabled, ...rest }, ref) {
  const inner = useRef<HTMLInputElement>(null);
  const generated = useId();
  const controlId = id ?? generated;
  const descriptionId = `${controlId}-description`;
  useEffect(() => { if (inner.current) inner.current.indeterminate = indeterminate; }, [indeterminate]);
  const describedBy = [rest["aria-describedby"], description ? descriptionId : undefined].filter(Boolean).join(" ") || undefined;
  const box = <span className={cx("ui-checkbox", sizeClass(size), !label && className)}>
    <input
      ref={mergeRefs(ref, inner)}
      id={controlId}
      type="checkbox"
      disabled={disabled}
      {...rest}
      aria-describedby={describedBy}
      onChange={event => onChange?.(event.target.checked, event)}
    />
    <span className="ui-checkbox-box" aria-hidden="true">{indeterminate ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}</span>
  </span>;
  if (!label) return box;
  return <div className={cx("ui-checkbox-field", disabled && "is-disabled", className)}>
    {box}
    <span className="ui-checkbox-text">
      <label htmlFor={controlId}>{label}</label>
      {description && <span id={descriptionId} className="ui-field-description">{description}</span>}
    </span>
  </div>;
});
