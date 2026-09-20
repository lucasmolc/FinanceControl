import { countLabel } from "../../lib/labels";
import type { FinanceState } from "../../types";

/** Texto exigido pela API para zerar a conta; a interface mostra exatamente este. */
export const RESET_CONFIRMATION = "APAGAR TUDO";

/** O que será apagado, com a contagem atual — para a confirmação dizer o tamanho do estrago. */
export function resetInventory(state: FinanceState): string[] {
  const entries: Array<[number, string, string]> = [
    [state.transactions.length, "lançamento", "lançamentos"],
    [state.bills.length, "conta a pagar", "contas a pagar"],
    [state.cards.length, "cartão", "cartões"],
    [state.bank_accounts.length, "conta bancária", "contas bancárias"],
    [state.goals.length, "meta", "metas"],
    [state.investments.length, "investimento", "investimentos"],
    [state.subscriptions.length, "assinatura", "assinaturas"],
    [state.categories.length, "categoria", "categorias"],
  ];
  return entries.filter(([count]) => count > 0).map(([count, one, many]) => countLabel(count, one, many));
}
