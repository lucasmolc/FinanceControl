import { forwardRef, type CSSProperties } from "react";
import { detectIcon, iconById, resolveIcon, type IconKind } from "../../../lib/icons";
import { cx } from "../shared/cx";
import { normalizeHex } from "../shared/color";

export interface CategoryIconProps {
  /** Glyph id from `lib/icons` (unknown/blank → detected from `name`, then "outros"). */
  icon?: string | null;
  /** "#rrggbb" (defaults to the glyph's group color). */
  color?: string | null;
  /** Record/category name used to detect a glyph when `icon` is empty. */
  name?: string | null;
  /** Restricts detection by kind. */
  kind?: IconKind;
  size?: "sm" | "md" | "lg" | number;
  /** Accessible label; when omitted the icon is decorative (aria-hidden) — use it only next to visible text. */
  label?: string;
  /** "badge" = tinted rounded square (default), "plain" = glyph only. */
  variant?: "badge" | "plain";
  className?: string;
}

const BOX: Record<"sm" | "md" | "lg", number> = { sm: 24, md: 32, lg: 40 };

/**
 * Category glyph (MEL-39): lucide icon from the catalog on a badge tinted with the category color.
 * The glyph color is mixed with the theme text color so it stays legible at 16 px in light and dark themes.
 */
export const CategoryIcon = forwardRef<HTMLSpanElement, CategoryIconProps>(function CategoryIcon({ icon, color, name, kind, size = "md", label, variant = "badge", className }, ref) {
  const definition = iconById(icon) ?? resolveIcon(detectIcon(name, kind));
  const Glyph = definition.icon;
  const box = typeof size === "number" ? size : BOX[size];
  const glyph = variant === "plain" ? box : Math.max(12, Math.round(box * 0.56));
  const tint = normalizeHex(color) ?? definition.color;
  return <span
    ref={ref}
    className={cx("ui-category-icon", `variant-${variant}`, className)}
    style={{ "--icon-color": tint, width: box, height: box } as CSSProperties}
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    title={label}
    data-icon={definition.id}
  >
    <Glyph size={glyph} strokeWidth={2} aria-hidden="true" focusable="false" />
  </span>;
});
