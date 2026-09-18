import { forwardRef, useState, type CSSProperties } from "react";
import { cx } from "../shared/cx";
import { hslToHex } from "../shared/color";
import { hashHue, initials } from "../shared/text";

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | number;
  shape?: "circle" | "rounded";
  /** Background "#rrggbb" (default: deterministic hue from the name, white initials, AA). */
  color?: string;
  /** Hide from assistive tech when the name is visible next to it. */
  decorative?: boolean;
  className?: string;
}

const PX: Record<"sm" | "md" | "lg", number> = { sm: 24, md: 36, lg: 48 };

/** Person/entity avatar: image or initials on a deterministic color. */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar({ name, src, size = "md", shape = "circle", color, decorative = false, className }, ref) {
  const [failed, setFailed] = useState<string | null>(null);
  const px = typeof size === "number" ? size : PX[size];
  const background = color ?? hslToHex(hashHue(name), 45, 32);
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": name };
  return <span ref={ref} className={cx("ui-avatar", `shape-${shape}`, className)} style={{ width: px, height: px, fontSize: Math.round(px * 0.4), "--avatar-bg": background } as CSSProperties} {...a11y}>
    {src && failed !== src ? <img src={src} alt="" onError={() => setFailed(src)} /> : <span aria-hidden="true">{initials(name)}</span>}
  </span>;
});
