export interface SortState {
  column: string;
  direction: "asc" | "desc";
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Compares two sort values (numbers numerically, text with the pt-BR collator); empty values always last. */
export function compareValues(a: string | number | null | undefined, b: string | number | null | undefined, factor: 1 | -1): number {
  const emptyA = a === null || a === undefined || a === "";
  const emptyB = b === null || b === undefined || b === "";
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
  return collator.compare(String(a), String(b)) * factor;
}
