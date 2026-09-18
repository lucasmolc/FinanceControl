import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { useControllable } from "../shared/useControllable";

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value" | "children"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Visible label rendered next to the switch (omit when a `Field`/`<label htmlFor>` already labels it). */
  label?: ReactNode;
  description?: ReactNode;
  size?: Size;
  /** Form field name: renders a hidden input ("true"/"false"). */
  name?: string;
}

/** On/off switch (APG switch: `<button role="switch" aria-checked>`; Space/Enter toggle). */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch({ checked, defaultChecked = false, onChange, label, description, size = "md", name, id, className, disabled, onClick, ...rest }, ref) {
  const [on, setOn] = useControllable(checked, defaultChecked, onChange);
  const generated = useId();
  const controlId = id ?? generated;
  const descriptionId = `${controlId}-description`;
  const describedBy = [rest["aria-describedby"], description ? descriptionId : undefined].filter(Boolean).join(" ") || undefined;
  const control = <button
    ref={ref}
    id={controlId}
    type="button"
    role="switch"
    aria-checked={on}
    className={cx("ui-switch", sizeClass(size), !label && className)}
    disabled={disabled}
    {...rest}
    aria-describedby={describedBy}
    onClick={event => { onClick?.(event); if (!event.defaultPrevented) setOn(!on); }}
  >
    <span className="ui-switch-thumb" aria-hidden="true" />
  </button>;
  const hidden = name ? <input type="hidden" name={name} value={on ? "true" : "false"} /> : null;
  if (!label) return <>{control}{hidden}</>;
  return <div className={cx("ui-switch-field", disabled && "is-disabled", className)}>
    {control}
    <span className="ui-switch-text">
      <label htmlFor={controlId}>{label}</label>
      {description && <span id={descriptionId} className="ui-field-description">{description}</span>}
    </span>
    {hidden}
  </div>;
});
