import { forwardRef, type ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { renderIcon, type IconProp } from "../shared/icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  /** Shows a spinner, sets `aria-busy` and blocks clicks while keeping the label. */
  loading?: boolean;
  /** Leading icon: a lucide component or any node. */
  icon?: IconProp;
  /** Trailing icon. */
  iconRight?: IconProp;
  fullWidth?: boolean;
}

const ICON_SIZE: Record<Size, number> = { sm: 14, md: 16, lg: 18 };

/**
 * Button (MEL-42). Keeps the legacy `.btn` classes (`primary`, `ghost`, `danger`, `small`) so it matches every
 * existing screen; `type` defaults to "button".
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", loading = false, icon, iconRight, fullWidth = false, className, children, disabled, type = "button", onClick, ...rest }, ref) {
  const iconSize = ICON_SIZE[size];
  return <button
    ref={ref}
    type={type}
    className={cx("btn ui-btn", variant !== "secondary" && variant, size === "sm" && "small", sizeClass(size), fullWidth && "full-width", loading && "is-loading", className)}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    onClick={loading ? undefined : onClick}
    {...rest}
  >
    {loading ? <LoaderCircle className="ui-spin" size={iconSize} aria-hidden="true" /> : renderIcon(icon, iconSize)}
    {children != null && children !== false && <span className="ui-btn-label">{children}</span>}
    {!loading && renderIcon(iconRight, iconSize)}
  </button>;
});
