import { api } from "../../api/client";
import { countLabel } from "../../lib/labels";
import type { FinanceState } from "../../types";

/** Records linked to a category or card (MEL-09); exact counts come from the links endpoints (MEL-41). */
export interface LinkCounts { transactions: number; bills: number; subscriptions: number; }

export type ReassignModule = "categories" | "cards";

export const totalLinks = (counts: LinkCounts): number => counts.transactions + counts.bills + counts.subscriptions;

export function linkCounts(state: FinanceState, module: ReassignModule, id: number): LinkCounts {
  if (module === "cards") return {
    transactions: state.transactions.filter(item => item.card_id === id).length,
    bills: 0,
    subscriptions: state.subscriptions.filter(item => item.card_id === id).length,
  };
  return {
    transactions: state.transactions.filter(item => item.category_id === id).length,
    bills: state.bills.filter(item => item.category_id === id).length,
    subscriptions: state.subscriptions.filter(item => item.category_id === id).length,
  };
}

/** Exact counts from `GET /api/{categories|cards}/{id}/links` (MEL-41); falls back to the loaded state when unavailable. */
export async function exactLinkCounts(state: FinanceState, module: ReassignModule, id: number): Promise<LinkCounts> {
  try {
    if (module === "cards") {
      const links = await api.cardLinks(id);
      return { transactions: links.transactions ?? 0, bills: 0, subscriptions: links.subscriptions ?? 0 };
    }
    const links = await api.categoryLinks(id);
    return { transactions: links.transactions ?? 0, bills: links.bills ?? 0, subscriptions: links.subscriptions ?? 0 };
  } catch {
    return linkCounts(state, module, id);
  }
}

/** "Usada em 3 lançamentos, 1 conta e 2 assinaturas." (categories) · "Usado em 4 lançamentos e 2 assinaturas." (cards; zero parts omitted). */
export function linksMessage(module: ReassignModule, counts: LinkCounts): string {
  const parts = module === "cards"
    ? [counts.transactions ? countLabel(counts.transactions, "lançamento", "lançamentos") : "", counts.subscriptions || !counts.transactions ? countLabel(counts.subscriptions, "assinatura", "assinaturas") : ""].filter(Boolean)
    : [countLabel(counts.transactions, "lançamento", "lançamentos"), countLabel(counts.bills, "conta", "contas"), countLabel(counts.subscriptions, "assinatura", "assinaturas")];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}` : parts[0];
  return `${module === "cards" ? "Usado" : "Usada"} em ${list}.`;
}

/** Destinations for the links: active categories of the same kind / other active cards (never the source). */
export function reassignTargets(state: FinanceState, module: ReassignModule, id: number): [string, string][] {
  if (module === "cards") return state.cards.filter(card => card.id !== id && card.active !== false).map(card => [String(card.id), card.name]);
  const source = state.categories.find(category => category.id === id);
  return state.categories
    .filter(category => category.id !== id && category.active !== false && (!source || category.kind === source.kind))
    .map(category => [String(category.id), category.name]);
}

export const noneLabel = (module: ReassignModule): string => module === "cards" ? "Sem cartão" : "Sem categoria";

/** Choice made in the removal dialog: keep the links as they are, clear them (`null`) or move them to another record. */
export type ReassignChoice = { move: false } | { move: true; targetId: number | null; targetName: string };
