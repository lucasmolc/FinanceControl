import type { ReportNetWorth } from "../../api/insights";
import { formatMonthLabel } from "../../lib/date";
import type { ProjectionMonth, ReachResult } from "../../lib/projection";
import { shortMonthLabel } from "../reports/reportsModel";

export interface ProjectionChartData {
  labels: string[];
  tooltipLabels: string[];
  nominal: (number | null)[];
  real: (number | null)[];
  lower: (number | null)[];
  upper: (number | null)[];
  /** Index of "today" (start of the dashed projection). */
  projectFrom: number;
}

/** Past snapshots (solid) + today's total + projected months (dashed), aligned on one x axis. */
export function projectionChartData(history: ReportNetWorth[], asOfMonth: string, startingTotalCents: number, rows: ProjectionMonth[], band: { lower: number[]; upper: number[] }): ProjectionChartData {
  const past = history.filter(item => item.month < asOfMonth).sort((left, right) => left.month.localeCompare(right.month));
  const today = past.length;
  const labels = [...past.map(item => shortMonthLabel(item.month)), "Hoje", ...rows.map(row => shortMonthLabel(row.month))];
  const tooltipLabels = [...past.map(item => formatMonthLabel(item.month)), `Hoje (${formatMonthLabel(asOfMonth)})`, ...rows.map(row => `${formatMonthLabel(row.month)} (projeção)`)];
  const pastNulls = past.map(() => null);
  return {
    labels,
    tooltipLabels,
    nominal: [...past.map(item => item.total_cents), startingTotalCents, ...rows.map(row => row.totalCents)],
    real: [...pastNulls, startingTotalCents, ...rows.map(row => row.realTotalCents)],
    lower: [...pastNulls, startingTotalCents, ...band.lower],
    upper: [...pastNulls, startingTotalCents, ...band.upper],
    projectFrom: today,
  };
}

/** "em março de 2027 (6 meses)" / "já atingida" / "fora do horizonte". */
export function reachText(result: ReachResult, horizon: number): string {
  if (result.status === "already") return "Já atingida";
  if (result.status === "beyond" || !result.month) return `Não atingida em ${horizon} meses`;
  return `Em ${formatMonthLabel(result.month)} (${result.index} ${result.index === 1 ? "mês" : "meses"})`;
}
