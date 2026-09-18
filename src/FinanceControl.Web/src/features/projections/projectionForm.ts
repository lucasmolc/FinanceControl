import type { ProjectionBase } from "../../api/insights";
import { formatMoneyInput, parseMoney } from "../../lib/money";
import { defaultBases, expenseFor, incomeFor, scenarioFromBase, type ExpenseBasis, type IncomeBasis, type ProjectionScenario } from "../../lib/projection";

/** Editable scenario (raw text while typing). */
export interface ScenarioForm {
  income: string;
  expense: string;
  contribution: string;
  returnPct: number;
  cdi: string;
  ipca: string;
  incomeBasis: IncomeBasis | "custom";
  expenseBasis: ExpenseBasis | "custom";
}

export type ScenarioErrors = Partial<Record<"income" | "expense" | "contribution" | "cdi" | "ipca", string>>;

export const incomeBasisLabels: Record<IncomeBasis, string> = { planned: "Planejada", avg3: "3 meses", avg6: "6 meses" };
/** R1-PRJ-1: short labels so the four options fit one line; the titles carry the full description. */
export const expenseBasisLabels: Record<ExpenseBasis, string> = { planned: "Teto", commitments: "Contas", avg3: "3 meses", avg6: "6 meses" };
/** Longer descriptions (tooltips) for the basis buttons. */
export const basisTitles: Record<string, string> = { planned: "Valor planejado nas Configurações (renda) ou o teto de gastos do mês (gastos)", commitments: "Contas fixas: contas a pagar + assinaturas", avg3: "Média dos últimos 3 meses completos", avg6: "Média dos últimos 6 meses completos" };

const MONEY_ERROR = "Informe um valor válido, por exemplo 1.234,56.";

/** "10,5" / "10.5" → 10.5; null when blank/invalid. */
export function parsePercent(text: string): number | null {
  const value = String(text ?? "").trim().replace("%", "").replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const formatPercentInput = (value: number): string => String(Math.round(value * 100) / 100).replace(".", ",");

export function formFromBase(base: ProjectionBase): ScenarioForm {
  const scenario = scenarioFromBase(base);
  const bases = defaultBases(base);
  return {
    income: formatMoneyInput(scenario.monthlyIncomeCents),
    expense: formatMoneyInput(scenario.monthlyExpenseCents),
    contribution: formatMoneyInput(scenario.monthlyContributionCents),
    returnPct: scenario.returnPctOfCdi,
    cdi: formatPercentInput(scenario.cdiAnnualPct),
    ipca: formatPercentInput(scenario.inflationAnnualPct),
    incomeBasis: bases.income,
    expenseBasis: bases.expense,
  };
}

export const incomeText = (base: ProjectionBase, basis: IncomeBasis) => formatMoneyInput(incomeFor(base, basis));
export const expenseText = (base: ProjectionBase, basis: ExpenseBasis) => formatMoneyInput(expenseFor(base, basis));

/** Scenario for the math (invalid fields fall back to the server base) + field errors. */
export function scenarioFromForm(base: ProjectionBase, form: ScenarioForm, months: number): { scenario: ProjectionScenario; errors: ScenarioErrors } {
  const fallback = scenarioFromBase(base, months);
  const errors: ScenarioErrors = {};
  const money = (key: "income" | "expense" | "contribution", text: string, backup: number) => {
    const value = parseMoney(text);
    if (value === null || value < 0) { errors[key] = MONEY_ERROR; return backup; }
    return value;
  };
  const percent = (key: "cdi" | "ipca", text: string, backup: number, min: number, max: number) => {
    const value = parsePercent(text);
    if (value === null || value < min || value > max) { errors[key] = `Informe um percentual entre ${min} e ${max}.`; return backup; }
    return value;
  };
  return {
    scenario: {
      ...fallback,
      monthlyIncomeCents: money("income", form.income, fallback.monthlyIncomeCents),
      monthlyExpenseCents: money("expense", form.expense, fallback.monthlyExpenseCents),
      monthlyContributionCents: money("contribution", form.contribution, fallback.monthlyContributionCents),
      returnPctOfCdi: Math.max(0, form.returnPct),
      cdiAnnualPct: percent("cdi", form.cdi, fallback.cdiAnnualPct, 0, 100),
      inflationAnnualPct: percent("ipca", form.ipca, fallback.inflationAnnualPct, -10, 100),
    },
    errors,
  };
}
