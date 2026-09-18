export type Labels = Record<string, string>;

export const transactionKindLabels: Labels = { income: "Receita", expense: "Despesa", investment: "Investimento" };
export const categoryKindLabels: Labels = transactionKindLabels;
export const paymentMethodLabels: Labels = { card: "Cartão de crédito", debit: "Cartão de débito", pix: "Pix", cash: "Dinheiro", transfer: "Transferência", boleto: "Boleto", auto_debit: "Débito automático", other: "Outro" };
export const accountTypeLabels: Labels = { checking: "Conta corrente", payment: "Conta de pagamento", savings: "Poupança", brokerage: "Corretora", cash: "Carteira/dinheiro" };
export const goalTypeLabels: Labels = { emergency: "Reserva de emergência", travel: "Viagem", purchase: "Compra planejada", education: "Educação", retirement: "Aposentadoria", custom: "Objetivo livre" };
export const investmentTypeLabels: Labels = { fixed_income: "Renda fixa", treasury: "Tesouro Direto", stocks: "Ações", funds: "Fundos", real_estate_funds: "Fundos imobiliários", crypto: "Criptoativos", pension: "Previdência", other: "Outro" };
export const subscriptionFrequencyLabels: Labels = { monthly: "Mensal", yearly: "Anual", weekly: "Semanal" };
export const investmentEntryKindLabels: Labels = { deposit: "Aporte", withdrawal: "Resgate", yield: "Rendimento", adjustment: "Ajuste de saldo" };
export const goalEntryKindLabels: Labels = { contribution: "Aporte", withdrawal: "Resgate" };
export const cardNetworkLabels: Labels = { visa: "Visa", mastercard: "Mastercard", elo: "Elo", amex: "American Express", hipercard: "Hipercard", other: "Outra" };
export const bankEntryKindLabels: Labels = { deposit: "Entrada", withdrawal: "Saída", transfer_in: "Transferência recebida", transfer_out: "Transferência enviada", adjustment: "Ajuste de saldo" };

/** Label for a stored enum value; unknown values still display (raw value), blanks use `fallback`. */
export function labelFor(labels: Labels, value: string | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return Object.prototype.hasOwnProperty.call(labels, value) ? labels[value]! : value;
}

/** `[value, label]` pairs in declaration order, for selects. */
export const optionsOf = (labels: Labels, only?: string[]): [string, string][] =>
  Object.entries(labels).filter(([value]) => !only || only.includes(value));

/** Monthly cost of a recurring amount: monthly = amount · yearly = amount/12 · weekly = amount×52/12 (rounded). */
export function monthlyEquivalentCents(amountCents: number, frequency: string): number {
  switch (frequency) {
    case "yearly": return Math.round(amountCents / 12);
    case "weekly": return Math.round(amountCents * 52 / 12);
    default: return amountCents;
  }
}

/** "1 lançamento" / "3 lançamentos": the count followed by the singular or plural noun. */
export const countLabel = (count: number, singular: string, pluralForm: string): string => `${count} ${count === 1 ? singular : pluralForm}`;

/** "N dia" / "N dias". */
export const daysLabel = (days: number): string => countLabel(days, "dia", "dias");

/** "N mês" / "N meses". */
export const monthsLabel = (months: number): string => countLabel(months, "mês", "meses");
