/** Joins truthy class names. */
export function cx(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(" ");
}

export type Size = "sm" | "md" | "lg";

/** `size-sm` / `size-lg`; md is the default and gets no class. */
export function sizeClass(size: Size | undefined): string | undefined {
  return size && size !== "md" ? `size-${size}` : undefined;
}
