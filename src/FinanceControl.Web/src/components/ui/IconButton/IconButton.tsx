import { forwardRef, type ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { renderIcon, type IconProp } from "../shared/icon";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible pt-BR name (also the default tooltip), e.g. "Editar Nubank". */
  label: string;
  icon: IconProp;
  size?: Size;
  tone?: "neutral" | "danger" | "accent";
  variant?: "ghost" | "outline" | "solid";
  loading?: boolean;
  /** Tooltip text (native `title`); defaults to `label`. Pass "" to suppress. */
  tooltip?: string;
  /** Toggle buttons: sets aria-pressed. */
  pressed?: boolean;
}

const ICON_SIZE: Record<Size, number> = { sm: 14, md: 16, lg: 20 };

/** Icon-only button with a required pt-BR `aria-label` (MEL-42). Keeps the legacy `.icon-btn` look. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, icon, size = "md", tone = "neutral", variant = "ghost", loading = false, tooltip, pressed, className, disabled, type = "button", onClick, ...rest }, ref) {
  return <button
    ref={ref}
    type={type}
    className={cx("icon-btn ui-icon-btn", tone !== "neutral" && tone, variant !== "ghost" && `variant-${variant}`, sizeClass(size), className)}
    aria-label={label}
    title={tooltip ?? label}
    aria-pressed={pressed}
    aria-busy={loading || undefined}
    disabled={disabled || loading}
    onClick={loading ? undefined : onClick}
    {...rest}
  >
    {loading ? <LoaderCircle className="ui-spin" size={ICON_SIZE[size]} aria-hidden="true" /> : renderIcon(icon, ICON_SIZE[size])}
  </button>;
});
