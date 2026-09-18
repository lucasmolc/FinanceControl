import { Blocks, Building2, CandlestickChart, ChartColumn, CreditCard, Landmark, LayoutDashboard, Receipt, Settings, Tags, Target, TrendingUp, Tv, WalletCards, type LucideIcon } from "lucide-react";
import type { PageId, RouteParams } from "../types";

export interface NavItem {
  id: PageId;
  label: string;
  shortLabel: string;
  /** Hash route, e.g. "#/metas". */
  route: string;
  subtitle: string;
  /** Pages whose content depends on the selected month (MonthSwitcher in the topbar). */
  monthAware: boolean;
  icon: LucideIcon;
  /** Not listed in the sidebar/dock (reachable by route and the command palette only). */
  hidden?: boolean;
}

export const navigation: NavItem[] = [
  { id: "dashboard", label: "Visão geral", shortLabel: "Visão geral", route: "#/painel", subtitle: "Seu mês financeiro em uma única visão.", monthAware: true, icon: LayoutDashboard },
  { id: "transactions", label: "Lançamentos", shortLabel: "Extrato", route: "#/lancamentos", subtitle: "Receitas, despesas e aportes do mês.", monthAware: true, icon: Receipt },
  { id: "bills", label: "Contas a pagar", shortLabel: "A pagar", route: "#/contas-a-pagar", subtitle: "Compromissos fixos do mês e o que já foi pago.", monthAware: true, icon: WalletCards },
  { id: "subscriptions", label: "Assinaturas", shortLabel: "Assinaturas", route: "#/assinaturas", subtitle: "Serviços recorrentes e o custo mensal equivalente.", monthAware: false, icon: Tv },
  { id: "accounts", label: "Contas bancárias", shortLabel: "Contas bancárias", route: "#/contas-bancarias", subtitle: "Saldos das contas e carteiras, com extrato.", monthAware: false, icon: Building2 },
  { id: "investments", label: "Investimentos", shortLabel: "Investimentos", route: "#/investimentos", subtitle: "Aplicações, aportes e rendimentos.", monthAware: false, icon: Landmark },
  { id: "cards", label: "Cartões", shortLabel: "Cartões", route: "#/cartoes", subtitle: "Limites e assinaturas vinculadas a cada cartão.", monthAware: false, icon: CreditCard },
  { id: "goals", label: "Metas", shortLabel: "Metas", route: "#/metas", subtitle: "Objetivos e quanto falta para cada um.", monthAware: false, icon: Target },
  { id: "categories", label: "Categorias", shortLabel: "Categorias", route: "#/categorias", subtitle: "Orçamento por categoria e consumo no mês.", monthAware: true, icon: Tags },
  { id: "reports", label: "Relatórios", shortLabel: "Relatórios", route: "#/relatorios", subtitle: "Entradas, saídas, categorias e patrimônio no período.", monthAware: false, icon: ChartColumn },
  { id: "projections", label: "Projeções", shortLabel: "Projeções", route: "#/projecoes", subtitle: "Para onde seu dinheiro vai nos próximos meses.", monthAware: false, icon: TrendingUp },
  { id: "market", label: "Mercado", shortLabel: "Mercado", route: "#/mercado", subtitle: "Cotações de moedas, cripto e indicadores.", monthAware: false, icon: CandlestickChart },
  { id: "settings", label: "Configurações", shortLabel: "Configurações", route: "#/configuracoes", subtitle: "Perfil, planejamento e cópia de segurança.", monthAware: false, icon: Settings },
  // MEL-42: component gallery, development builds only.
  ...(import.meta.env.DEV ? [{ id: "components" as const, label: "Componentes", shortLabel: "Componentes", route: "#/componentes", subtitle: "Biblioteca de componentes em todos os estados (somente em desenvolvimento).", monthAware: false, icon: Blocks, hidden: true }] : []),
];

/** Pages shown in menus (sidebar groups, "Mais"). */
export const visibleNavigation: NavItem[] = navigation.filter(item => !item.hidden);

export interface NavGroup { label: string; items: PageId[]; footer?: boolean; }

/** Desktop sidebar groups. */
export const navGroups: NavGroup[] = [
  { label: "Mês", items: ["dashboard", "transactions", "bills", "subscriptions"] },
  { label: "Patrimônio", items: ["accounts", "investments", "cards"] },
  { label: "Planejamento", items: ["goals", "categories"] },
  { label: "Análises", items: ["reports", "projections", "market"] },
  { label: "Sistema", items: ["settings"], footer: true },
];

/** Mobile dock (the remaining pages live under "Mais"). R2-SH-2: the centre slot is the "+" (Metas moved to "Mais"). */
export const mobilePrimary: PageId[] = ["dashboard", "transactions", "bills"];

const DEFAULT_PAGE: PageId = "dashboard";

export function navItem(page: PageId): NavItem {
  return navigation.find(item => item.id === page) ?? navigation[0]!;
}

/** Page for a location hash ("#/metas", "#metas", "#/lancamentos?categoria=3", "" → default). Unknown routes fall back to the dashboard. */
export function pageFromHash(hash: string): PageId {
  const path = hash.replace(/^#\/?/, "").split(/[?/]/)[0]?.toLowerCase() ?? "";
  return navigation.find(item => item.route === `#/${path}`)?.id ?? DEFAULT_PAGE;
}

/** Hash query parameters ("#/lancamentos?categoria=3&tipo=expense" → { categoria: "3", tipo: "expense" }); blank values dropped. */
export function paramsFromHash(hash: string): RouteParams {
  const index = hash.indexOf("?");
  if (index < 0) return {};
  const params: RouteParams = {};
  new URLSearchParams(hash.slice(index + 1)).forEach((value, key) => { if (key && value.trim()) params[key] = value.trim(); });
  return params;
}

/** Hash route for a page, with optional query parameters (sorted, blanks dropped). */
export function routeFor(page: PageId, params?: RouteParams): string {
  const route = navItem(page).route;
  const entries = Object.entries(params ?? {}).filter(([key, value]) => key && value !== undefined && value !== null && String(value).trim() !== "");
  if (!entries.length) return route;
  const query = new URLSearchParams(entries.sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, String(value).trim()]));
  return `${route}?${query.toString()}`;
}
