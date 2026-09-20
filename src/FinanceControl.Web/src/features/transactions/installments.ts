import { formatMonthLabel } from "../../lib/date";
import type { FormState } from "../../types";
import { intOrNull, money, trimmed } from "../records/formUtils";

/**
 * Repetição de um lançamento. "Parcelado" grava as N parcelas de uma vez, uma por mês, para trás e para frente a
 * partir da parcela informada. "Todo mês, sem prazo" não tem número de parcelas: é uma **assinatura**, que já repete
 * indefinidamente, tem o valor editável valendo só das próximas cobranças em diante e termina quando é desativada.
 */
export type RepeatMode = "none" | "installments" | "forever";

export const REPEAT_OPTIONS: [string, string][] = [
  ["none", "Não repetir"],
  ["installments", "Parcelado"],
  ["forever", "Todo mês, sem prazo"],
];

export const REPEAT_DESCRIPTIONS: Record<string, string> = {
  none: "Um lançamento só, na data informada.",
  installments: "Número fixo de parcelas, uma em cada mês.",
  forever: "Gasto mensal que segue até você desativar, como academia ou streaming.",
};

/** O valor digitado é o de uma parcela ou o da compra inteira. */
export const AMOUNT_BASIS_OPTIONS: [string, string][] = [
  ["installment", "Valor de cada parcela"],
  ["total", "Valor total da compra"],
];

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 72;

export const repeatMode = (form: FormState): RepeatMode => (trimmed(form, "repeat") || "none") as RepeatMode;
export const amountIsTotal = (form: FormState): boolean => trimmed(form, "amount_basis") === "total";
export const installmentCount = (form: FormState): number | null => intOrNull(form, "installment_count");
export const installmentNumber = (form: FormState): number | null => intOrNull(form, "installment_number");

/**
 * Valor de uma parcela ao dividir o total: base = total ÷ parcelas e o resto vai um centavo por parcela, a partir da
 * primeira. É a mesma regra do servidor (`InstallmentRules.AmountOf`), para o resumo bater com o que será gravado.
 */
export const installmentAmount = (totalCents: number, count: number, number: number): number =>
  Math.floor(totalCents / count) + (number <= totalCents % count ? 1 : 0);

export const installmentTotal = (perInstallmentCents: number, count: number): number => perInstallmentCents * count;

/** Data da parcela `number` a partir da data da parcela `anchorNumber`: mesmo dia, mês deslocado e limitado ao mês. */
export function installmentDate(isoDate: string, anchorNumber: number, number: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const target = new Date(Date.UTC(year, month - 1 + (number - anchorNumber), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

export interface InstallmentPlan {
  count: number;
  number: number;
  totalCents: number;
  perInstallmentCents: number;
  firstDate: string;
  lastDate: string;
}

/** Plano completo do que será gravado; null enquanto os campos não formam um parcelamento válido. */
export function installmentPlan(form: FormState, decimals = 2): InstallmentPlan | null {
  if (repeatMode(form) !== "installments") return null;
  const count = installmentCount(form);
  const number = installmentNumber(form) ?? 1;
  const amount = money(form, "amount", decimals);
  const date = trimmed(form, "date");
  if (count === null || amount === null || amount <= 0 || !date) return null;
  if (count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS || number < 1 || number > count) return null;

  const totalCents = amountIsTotal(form) ? amount : installmentTotal(amount, count);
  if (totalCents < count) return null;
  return {
    count,
    number,
    totalCents,
    perInstallmentCents: installmentAmount(totalCents, count, number),
    firstDate: installmentDate(date, number, 1),
    lastDate: installmentDate(date, number, count),
  };
}

/** Resumo em uma linha: "10x de R$ 100,00 · total R$ 1.000,00 · de abr/2026 a jan/2027". */
export function installmentSummary(plan: InstallmentPlan, format: (cents: number) => string): string {
  const from = formatMonthLabel(plan.firstDate.slice(0, 7));
  const to = formatMonthLabel(plan.lastDate.slice(0, 7));
  return `${plan.count}x de ${format(plan.perInstallmentCents)} · total ${format(plan.totalCents)} · de ${from} a ${to}`;
}

/** Meses da série que estão fechados (o servidor recusa a compra inteira quando há algum). */
export function closedInstallmentMonths(plan: InstallmentPlan, isoDate: string, closedMonths: readonly string[] | undefined): string[] {
  if (!closedMonths?.length) return [];
  const months = new Set<string>();
  for (let number = 1; number <= plan.count; number += 1) months.add(installmentDate(isoDate, plan.number, number).slice(0, 7));
  return [...months].filter(month => closedMonths.includes(month)).sort();
}
