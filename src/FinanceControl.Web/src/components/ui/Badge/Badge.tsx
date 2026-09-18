import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { renderIcon, type IconProp } from "../shared/icon";

export type BadgeTone = "neutral" | "positive" | "negative" | "warning" | "accent" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  variant?: "soft" | "solid" | "outline";
  size?: Size;
  icon?: IconProp;
  /** Small colored dot before the text (status). */
  dot?: boolean;
}

/** Status badge. Keeps the legacy `.badge <tone>` classes; tone is always paired with text (never color alone). */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge({ tone = "neutral", variant = "soft", size = "md", icon, dot = false, className, children, ...rest }, ref) {
  return <span ref={ref} className={cx("badge ui-badge", tone, variant !== "soft" && `variant-${variant}`, sizeClass(size), className)} {...rest}>
    {dot && <span className="ui-badge-dot" aria-hidden="true" />}
    {renderIcon(icon, size === "sm" ? 11 : 13)}
    {children}
  </span>;
});

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  /** Shows a remove button ("Remover <texto>"). */
  onRemove?: () => void;
  removeLabel?: string;
  /** "#rrggbb" swatch shown before the text. */
  color?: string;
  icon?: IconProp;
  size?: Size;
  selected?: boolean;
}

/** Tag/chip: label with optional color swatch, icon and remove button. */
export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag({ children, onRemove, removeLabel, color, icon, size = "md", selected = false, className, ...rest }, ref) {
  const text = typeof children === "string" ? children : "";
  return <span ref={ref} className={cx("ui-tag", sizeClass(size), selected && "is-selected", className)} {...rest}>
    {color && <span className="ui-tag-swatch" style={{ background: color }} aria-hidden="true" />}
    {renderIcon(icon, 13)}
    <span className="ui-tag-label">{children}</span>
    {onRemove && <button type="button" className="ui-tag-remove" aria-label={removeLabel ?? `Remover ${text}`.trim()} onClick={onRemove}><X size={12} aria-hidden="true" /></button>}
  </span>;
});
