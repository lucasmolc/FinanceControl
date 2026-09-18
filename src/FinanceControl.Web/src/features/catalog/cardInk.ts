import { contrastRatio, normalizeHex, parseHex } from "../../components/ui/shared/color";
import { brandById } from "../../lib/brands";

// MEL-35: ink (text) color of the visual credit card, computed in code so every text passes WCAG AA (≥ 4.5:1)
// on any chosen card color — including mid-lightness colors where neither white nor black passes on the whole gradient.

export const INK_LIGHT = "#ffffff";
export const INK_DARK = "#0b0f14";
/** Default card color (tokens-free fallback shared with styles/finance.css). */
const DEFAULT_CARD_COLOR = "#1f6f5c";
export const AA = 4.5;

export interface CardInk {
  /** `data-contrast` value: "light" = white ink, "dark" = near-black ink. */
  contrast: "light" | "dark";
  /** Surface color to paint (`--card-color`): the chosen color, nudged darker/lighter only when needed for AA. */
  surface: string;
  /** True when `surface` differs from the chosen color. */
  adjusted: boolean;
  /** Worst contrast of the ink (and its 80% "soft" variant) over the card gradient. */
  ratio: number;
}

/** sRGB mix like CSS `color-mix(in srgb, a (1 − t), b t)`. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a) ?? [0, 0, 0];
  const cb = parseHex(b) ?? [0, 0, 0];
  return `#${ca.map((value, index) => Math.round(value + (cb[index]! - value) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Colors the text sits on: the base, the darker gradient end (78% color + black) and the top-right highlight (+12% white). */
export const cardSamples = (surface: string): string[] => [surface, mixHex(surface, "#000000", 0.22), mixHex(surface, "#ffffff", 0.12)];

/** Worst contrast of `ink` (full and 80% soft ink, as `--card-ink-soft`) over the card samples. */
export function inkRatio(surface: string, ink: string): number {
  return Math.min(...cardSamples(surface).flatMap(sample => [contrastRatio(ink, sample), contrastRatio(mixHex(sample, ink, 0.8), sample)]));
}

/**
 * Picks white or dark ink for a card color. When neither passes AA over the whole card, the surface is darkened (white ink)
 * or lightened (dark ink) in 4% steps — whichever needs the smaller change — so the text is always legible.
 */
export function cardInk(color: string | null | undefined): CardInk {
  const base = normalizeHex(color) ?? DEFAULT_CARD_COLOR;
  const light = inkRatio(base, INK_LIGHT);
  const dark = inkRatio(base, INK_DARK);
  if (light >= AA || dark >= AA) {
    return light >= dark ? { contrast: "light", surface: base, adjusted: false, ratio: light } : { contrast: "dark", surface: base, adjusted: false, ratio: dark };
  }
  const search = (ink: string, toward: string) => {
    for (let step = 1; step <= 25; step += 1) {
      const surface = mixHex(base, toward, step * 0.04);
      const ratio = inkRatio(surface, ink);
      if (ratio >= AA) return { step, surface, ratio };
    }
    return { step: 26, surface: toward === "#000000" ? "#000000" : "#ffffff", ratio: inkRatio(toward, ink) };
  };
  const darker = search(INK_LIGHT, "#000000");
  const lighter = search(INK_DARK, "#ffffff");
  return darker.step <= lighter.step
    ? { contrast: "light", surface: darker.surface, adjusted: true, ratio: darker.ratio }
    : { contrast: "dark", surface: lighter.surface, adjusted: true, ratio: lighter.ratio };
}

/** CR-21: the card takes its issuer's color when the user did not pick one (Nubank purple, Itaú orange…). */
export const cardColor = (color: string | null | undefined, brand: string | null | undefined): string | null => color || brandById(brand)?.bg || null;
