// MEL-45: the 70-20-10 suggestion (live table + explanation) used by the setup step and Configurações.
// R1: one meaning of "teto" (decision 1), the before → after cap next to the apply button (decision 2), no clipped inputs.
import { useId, type ReactNode } from "react";
import { Money } from "../../components/ui";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { DEFAULT_PLAN, formatRatePct, intIn, PLAN_ROW_LABELS, pctSum, planFigures, salaryYears, withdrawalRates, type PlanApplyPreview, type PlanDraft, type PlanErrors, type PlanGoalEffect } from "./planModel";

export interface PlanTableProps {
  /** Monthly net salary (cents); null/0 → no values. */
  salaryCents: number | null;
  draft: PlanDraft;
  /** Inputs instead of fixed numbers in the "Regra" column ("Ajustar"). */
  editing: boolean;
  errors?: PlanErrors;
  onChange?: (key: keyof PlanDraft, value: string) => void;
  /** Accessible name of the table. */
  caption?: string;
}

interface RowSpec { key: keyof PlanDraft; note: string; unit: "pct" | "salaries"; inputLabel: string; min: number; max: number; }

const ROWS: RowSpec[] = [
  { key: "fixed", note: "o máximo, não uma meta", unit: "pct", inputLabel: "Percentual do salário para gastos fixos", min: 0, max: 100 },
  { key: "fun", note: "dinheiro livre do mês", unit: "pct", inputLabel: "Percentual do salário para lazer", min: 0, max: 100 },
  { key: "invest", note: "por mês; investir mais é bem-vindo", unit: "pct", inputLabel: "Percentual do salário para investir", min: 0, max: 100 },
  { key: "months", note: "salários guardados", unit: "salaries", inputLabel: "Salários de reserva de emergência", min: 1, max: 120 },
  { key: "multiplier", note: "patrimônio para viver de renda", unit: "salaries", inputLabel: "Salários do número da liberdade", min: 1, max: 600 },
];

/** "70% do salário" / "6 salários" (R1-CFG-8). */
function ruleText(row: RowSpec, text: string): string {
  if (row.unit === "pct") return `${text}% do salário`;
  return `${text} ${text.trim() === "1" ? "salário" : "salários"}`;
}

/** Table Item | Regra | Valor, recalculated as the salary or the rule changes. */
export function PlanTable({ salaryCents, draft, editing, errors = {}, onChange, caption = "Plano calculado com o seu salário" }: PlanTableProps) {
  const errorId = useId();
  const sumId = useId();
  const salary = salaryCents && salaryCents > 0 ? salaryCents : null;
  const numbers = {
    fixedPct: intIn(draft.fixed, 0, 100) ?? 0, funPct: intIn(draft.fun, 0, 100) ?? 0, investPct: intIn(draft.invest, 0, 100) ?? 0,
    emergencyMonths: intIn(draft.months, 1, 120) ?? 0, freedomMultiplier: intIn(draft.multiplier, 1, 600) ?? 0,
  };
  const figures = salary ? planFigures(salary, numbers) : null;
  const valueOf: Record<keyof PlanDraft, number | null> = {
    fixed: figures?.fixedCents ?? null, fun: figures?.funCents ?? null, invest: figures?.investCents ?? null, months: figures?.reserveCents ?? null, multiplier: figures?.freedomCents ?? null,
  };
  const sum = pctSum(draft);
  const messages = [errors.sum, errors.fixed, errors.fun, errors.invest, errors.months, errors.multiplier].filter((message, index, list): message is string => Boolean(message) && list.indexOf(message) === index);

  return <div className="plan-table-wrap">
    <table className={`plan-table${editing ? " is-editing" : ""}`}>
      <caption className="sr-only">{caption}</caption>
      <thead><tr><th scope="col">Item</th><th scope="col">Regra</th><th scope="col" className="num">Valor</th></tr></thead>
      <tbody>
        {ROWS.map(row => {
          // R1-SET-8: while the percentages do not add up to 100, all three are invalid (not only the message).
          const sumInvalid = row.unit === "pct" && (Boolean(errors.sum) || (editing && sum !== 100));
          const invalid = Boolean(errors[row.key]) || sumInvalid;
          const describedBy = [messages.length ? errorId : "", sumInvalid ? sumId : ""].filter(Boolean).join(" ") || undefined;
          const cents = valueOf[row.key];
          return <tr key={row.key} className={`plan-row plan-row-${row.key}`}>
            <th scope="row"><b>{PLAN_ROW_LABELS[row.key]}</b><small>{row.note}</small></th>
            <td className="plan-rule">
              {editing && onChange
                ? <span className="plan-rule-edit">
                  <input type="number" inputMode="numeric" min={row.min} max={row.max} step="1" required aria-label={row.inputLabel}
                    aria-invalid={invalid || undefined} aria-describedby={describedBy}
                    value={draft[row.key]} onChange={event => onChange(row.key, event.target.value)} />
                  <span aria-hidden="true">{row.unit === "pct" ? "% do salário" : "salários"}</span>
                </span>
                : <span>{ruleText(row, draft[row.key])}</span>}
            </td>
            <td className="num plan-value">{cents === null ? "—" : <Money cents={cents} />}</td>
          </tr>;
        })}
      </tbody>
      {editing && <tfoot><tr className={sum === 100 ? "" : "is-invalid"}>
        <th scope="row">Soma dos percentuais</th>
        <td colSpan={2} className="num"><span id={sumId} className={sum === 100 ? "plan-sum-ok" : "plan-sum-bad"}>{sum}%{sum === 100 ? " · ok" : " · precisa ser 100%"}</span></td>
      </tr></tfoot>}
    </table>
    {figures && <p className="plan-limit-line">Teto de gastos do mês = limite de fixos + limite de lazer = <Money cents={figures.limitCents} /></p>}
    {messages.length > 0 && <div id={errorId} className="field-error plan-errors" role="alert">{messages.map(message => <p key={message}>{message}</p>)}</div>}
  </div>;
}

const effectText: Record<PlanGoalEffect, string> = {
  update: "valor-alvo atualizado",
  create: "criada em Metas (ou religada à meta de mesmo nome)",
  removed: "removida por você: não é recriada",
  manual: "cálculo automático desligado: não muda",
};

/**
 * R1 decision 2: what "Aplicar" changes, shown right under the table (before the button): the teto before → after and the
 * two linked goals. `buckets` adds the categories line when the setup checkbox is on.
 */
export function PlanApplySummary({ preview, buckets = false }: { preview: PlanApplyPreview; buckets?: boolean }) {
  const { limitBeforeCents: before, limitAfterCents: after } = preview;
  return <div className="plan-apply-summary" aria-live="polite">
    <p className="plan-apply-title">Ao aplicar</p>
    <ul>
      <li className="plan-apply-limit"><span>Teto de gastos do mês</span>
        <b>{before === after ? <><Money cents={after} /> <small>(sem mudança)</small></> : <>{before > 0 ? <><s className="plan-apply-before"><Money cents={before} /></s><span aria-hidden="true"> → </span><span className="sr-only"> passa para </span></> : <small>sem teto → </small>}<Money cents={after} /></>}</b>
      </li>
      <li><span>Reserva de emergência · <Money cents={preview.reserve.targetCents} /></span><small>{effectText[preview.reserve.effect]}</small></li>
      <li><span>Número da liberdade · <Money cents={preview.freedom.targetCents} /></span><small>{effectText[preview.freedom.effect]}</small></li>
      {buckets && <li><span>Categorias Gastos fixos, Lazer e Investimentos</span><small>só as que ainda não existem</small></li>}
    </ul>
  </div>;
}

/** Lead + table (children) + the apply summary; "why" and "important" are one click away (R1-SET-3). */
export function PlanExplanation({ salaryCents, draft, children, summary }: { salaryCents: number | null; draft: PlanDraft; children?: ReactNode; summary?: ReactNode }) {
  const fmt = useMoneyFormat();
  const fixedPct = intIn(draft.fixed, 0, 100) ?? DEFAULT_PLAN.fixedPct;
  const investPct = intIn(draft.invest, 0, 100) ?? DEFAULT_PLAN.investPct;
  const multiplier = intIn(draft.multiplier, 1, 600) ?? DEFAULT_PLAN.freedomMultiplier;
  const rates = withdrawalRates({ fixedPct, freedomMultiplier: multiplier });
  return <div className="plan-explanation">
    {salaryCents && salaryCents > 0
      ? <p className="plan-lead">Com o seu salário líquido de <b>{fmt(salaryCents)}</b>, sugerimos dividir o mês assim.</p>
      : <p className="plan-lead">Informe o salário líquido para ver os valores do plano.</p>}
    {children}
    {summary}
    <details className="plan-premise">
      <summary>Por que usar este plano e {multiplier} salários no número da liberdade?</summary>
      <p><b>Por que usar:</b> três baldes fáceis de lembrar protegem o futuro sem abrir mão do presente e dão um sinal claro quando algo sai do controle.</p>
      <p><b>Importante:</b> os {fixedPct}% dos gastos fixos são um <b>limite máximo, não uma meta</b>. Tudo o que ficar abaixo pode ir para investimentos, para a reserva ou para suas metas, e acelera sua liberdade financeira. Os {investPct}% investidos são o <b>mínimo</b>: investir mais é sempre bem-vindo.</p>
      <p><b>Número da liberdade:</b> {multiplier} salários são {salaryYears(multiplier)}. Para viver só de rendimentos, você retiraria cerca de {formatRatePct(rates.salaryPct)} ao ano mantendo o salário inteiro, ou {formatRatePct(rates.fixedPct)} cobrindo só os gastos fixos. É mais ousado que a regra dos 4% do movimento FIRE (25 vezes os gastos anuais), mas compatível com os juros reais historicamente altos no Brasil. Para uma versão conservadora, use 25 × 12 × a parte dos fixos (≈ {Math.round((25 * 12 * fixedPct) / 100)} salários).</p>
    </details>
  </div>;
}
