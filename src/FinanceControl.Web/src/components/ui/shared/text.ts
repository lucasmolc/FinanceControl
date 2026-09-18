/** Lowercase, accent-free, single-spaced text for searching ("Café da manhã" → "cafe da manha"). */
export function normalize(text: string | null | undefined): string {
  return String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Fuzzy score of `query` against `target` (both raw). 0 = no match; higher is better.
 * Substring matches win (earlier/word-start better); otherwise every query char must appear in order.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = normalize(query);
  if (!q) return 1;
  const t = normalize(target);
  const index = t.indexOf(q);
  if (index >= 0) {
    const wordStart = index === 0 || t[index - 1] === " ";
    return 1000 - index + (wordStart ? 200 : 0) - (t.length - q.length) * 0.1;
  }
  let score = 0;
  let position = 0;
  let previous = -2;
  for (const char of q) {
    if (char === " ") continue;
    const found = t.indexOf(char, position);
    if (found < 0) return 0;
    score += found === previous + 1 ? 6 : 1;
    if (found === 0 || t[found - 1] === " ") score += 4;
    previous = found;
    position = found + 1;
  }
  return score;
}

/** Initials from a name: "Banco Pan" → "BP", "nubank" → "NU". */
export function initials(text: string | null | undefined, max = 2): string {
  const words = normalize(text).replace(/[^a-z0-9 ]/g, " ").split(" ").filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0]!.slice(0, max).toUpperCase();
  return words.slice(0, max).map(word => word[0]).join("").toUpperCase();
}

/** Deterministic 0–359 hue for a text. */
export function hashHue(text: string | null | undefined): number {
  let hash = 0;
  for (const char of normalize(text)) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}
