import { isValidElement, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Icon prop accepted by the library: a lucide component or any node. */
export type IconProp = LucideIcon | ReactNode;

function isComponent(icon: unknown): icon is LucideIcon {
  return typeof icon === "function" || (typeof icon === "object" && icon !== null && !isValidElement(icon) && "$$typeof" in icon);
}

/** Renders an `IconProp` as a decorative (aria-hidden) icon of `size` px. */
export function renderIcon(icon: IconProp | undefined, size: number): ReactNode {
  if (icon == null || icon === false) return null;
  if (isComponent(icon)) {
    const Icon = icon;
    return <Icon size={size} aria-hidden="true" />;
  }
  return icon;
}
