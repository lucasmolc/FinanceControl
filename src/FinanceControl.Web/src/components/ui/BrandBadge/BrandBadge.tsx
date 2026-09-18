import { forwardRef, useState } from "react";
import { Building2, Landmark, Repeat } from "lucide-react";
import { brandById, detectBrand, type BrandKind } from "../../../lib/brands";
import { cx } from "../shared/cx";

export interface BrandBadgeProps {
  /** Brand id from `lib/brands` (unknown ids fall back to detection/initials). */
  brand?: string | null;
  /** Institution/service name: used to detect the brand and for the fallback initials. */
  name?: string | null;
  /** Restricts detection by kind ("bank" for accounts/cards, "service" for subscriptions). */
  kind?: BrandKind;
  /** Uploaded logo (data URL): replaces the monogram. */
  logo?: string | null;
  size?: "sm" | "md" | "lg" | number;
  shape?: "rounded" | "circle";
  /** Accessible name (defaults to the brand name). Ignored when decorative. */
  title?: string;
  /** Hide from assistive tech (use when the name is shown next to the badge). */
  decorative?: boolean;
  className?: string;
}

const PX: Record<"sm" | "md" | "lg", number> = { sm: 24, md: 36, lg: 48 };

function fontSize(monogram: string): number {
  const length = [...monogram].length;
  if (length <= 1) return 17;
  if (length === 2) return 14;
  if (length === 3) return 11.5;
  return 9.5;
}

/**
 * Brand badge (MEL-33/39): a STYLIZED MONOGRAM in approximate brand colors (never the official artwork), an uploaded
 * logo when given, or — for unknown brands — a neutral tile with a generic glyph (a bank for accounts/cards, a
 * recurring arrow for services). CR-29: initials such as "AL" or "DI" read as someone's logo, so unknown institutions
 * no longer get a monogram. Markup follows `.bank-logo > (svg | img)`; unknown brands add `.is-generic`.
 */
export const BrandBadge = forwardRef<HTMLSpanElement, BrandBadgeProps>(function BrandBadge({ brand, name, kind, logo, size = "md", shape = "rounded", title, decorative = false, className }, ref) {
  const [broken, setBroken] = useState<string | null>(null);
  const definition = brandById(brand) ?? detectBrand(name, kind) ?? detectBrand(brand, kind) ?? undefined;
  const Generic = kind === "bank" ? Landmark : kind === "service" ? Repeat : Building2;
  const px = typeof size === "number" ? size : PX[size];
  const sizeName = typeof size === "number" ? (size <= 28 ? "sm" : size >= 44 ? "lg" : "md") : size;
  const accessibleName = title ?? definition?.name ?? name ?? brand ?? "Marca";
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": accessibleName };
  const radius = shape === "circle" ? 16 : 8;
  const showLogo = Boolean(logo) && broken !== logo;

  return <span ref={ref} className={cx("bank-logo ui-brand-badge", sizeName !== "md" && `size-${sizeName}`, `shape-${shape}`, !definition && !showLogo && "is-generic", className)} style={{ width: px, height: px }} title={decorative ? undefined : accessibleName} data-brand={definition?.id ?? "outro"} {...a11y}>
    {showLogo
      ? <img src={logo!} alt="" width={px} height={px} onError={() => setBroken(logo ?? null)} />
      : definition
        ? <svg viewBox="0 0 32 32" width={px} height={px} aria-hidden="true" focusable="false">
          <rect width="32" height="32" rx={radius} fill={definition.bg} />
          <path d="M0 22 C 10 17, 20 27, 32 20 L32 32 L0 32 Z" fill={definition.fg} opacity="0.08" />
          <text x="16" y="16.5" textAnchor="middle" dominantBaseline="central" fill={definition.fg} fontSize={fontSize(definition.monogram)} fontWeight={800} letterSpacing="-0.4" className="ui-brand-monogram">{definition.monogram}</text>
        </svg>
        : <Generic className="ui-brand-generic" size={Math.round(px * 0.55)} strokeWidth={1.8} aria-hidden="true" focusable="false" />}
  </span>;
});
