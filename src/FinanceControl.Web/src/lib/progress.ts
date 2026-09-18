// Single rule for goal/limit progress percentages shown anywhere in the app (R3: Painel, Metas and Configurações disagreed).
// Below 10% one decimal ("1,7%") so small progress is not rounded to 0 or 2; from 10% on whole numbers; a positive value
// under 0,1% reads "<0,1%"; capped at 100% only when the target is reached.

const oneDecimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function progressRatio(current: number, target: number): number {
  if (!(target > 0) || !Number.isFinite(current)) return 0;
  return Math.max(0, current / target);
}

export function formatProgress(current: number, target: number): string {
  const pct = progressRatio(current, target) * 100;
  if (pct >= 100) return "100%";
  if (pct <= 0) return "0%";
  if (pct < 0.1) return "<0,1%";
  if (pct < 10) return `${oneDecimal.format(Math.floor(pct * 10) / 10)}%`;
  return `${whole.format(Math.floor(pct))}%`;
}
