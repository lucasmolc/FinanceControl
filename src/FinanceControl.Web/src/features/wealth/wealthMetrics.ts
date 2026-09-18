export type SignTone = "positive" | "negative" | undefined;

/** Tone by sign: gain = positive, loss = negative, zero = neutral (undefined). */
export const toneBySign = (cents: number): SignTone => cents > 0 ? "positive" : cents < 0 ? "negative" : undefined;

const percentFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "+12,5%" / "−3,0%" (U+2212) / "0,0%"; "—" when not computable. */
export function formatSignedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const text = percentFormatter.format(Math.abs(rounded));
  return rounded > 0 ? `+${text}%` : rounded < 0 ? `−${text}%` : `${text}%`;
}

export interface InvestmentResult { resultCents: number; returnPercent: number | null; tone: SignTone; }

/** Result (current − invested) and return over the invested amount (null when nothing was invested). */
export function investmentResult(investedCents: number, currentCents: number): InvestmentResult {
  const resultCents = currentCents - investedCents;
  return { resultCents, returnPercent: investedCents > 0 ? resultCents / investedCents * 100 : null, tone: toneBySign(resultCents) };
}

/**
 * Balances after a withdrawal by average cost (MEL-03): current − amount; invested reduced in the same proportion
 * (round(invested × amount / current), capped at invested). Null when the amount exceeds the current balance.
 */
export function withdrawalPreview(investedCents: number, currentCents: number, amountCents: number): { investedCents: number; currentCents: number } | null {
  if (amountCents <= 0 || amountCents > currentCents) return null;
  const reduction = currentCents > 0 ? Math.min(investedCents, Math.round(investedCents * amountCents / currentCents)) : Math.min(investedCents, amountCents);
  return { investedCents: investedCents - reduction, currentCents: currentCents - amountCents };
}
