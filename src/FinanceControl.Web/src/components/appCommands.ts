import { CalendarCheck, CreditCard, Download, Eye, Landmark, Moon, Pencil, Plus, Receipt, RefreshCw, Rows3, Scale, Sparkles, Sun, Tags, Target, Tv, WalletCards, Building2 } from "lucide-react";
import type { Command } from "./ui/CommandPalette";
import { normalizeSearchText } from "../lib/icons";
import { api } from "../api/client";
import type { DensityId, FinanceState, ModalKind, OpenEdit, OpenModal, PageId, ThemeId } from "../types";
import { navigation } from "./navigation";

export interface AppCommandContext {
  state: FinanceState;
  navigate: (page: PageId) => void;
  openModal: OpenModal;
  openEdit: OpenEdit;
  refresh: () => void;
  hideValues: boolean;
  toggleHideValues: () => void;
  /** Current palette query: records are searched only from 2 characters on. */
  query: string;
  /** R1-CMD-4: current page ("Você está aqui"). */
  page?: PageId;
  /** R1-CMD-1: appearance, month closing, tour and Configurações shortcuts (each optional). */
  theme?: ThemeId;
  density?: DensityId;
  setTheme?: (theme: ThemeId) => void;
  setDensity?: (density: DensityId) => void;
  /** Present only when the selected month can be closed from here. */
  closeMonth?: () => void;
  monthLabel?: string;
  replayTour?: () => void;
  openSettingsSection?: (section: string) => void;
  /** R3-CMD-3: pages opened before the current one, most recent first (the empty query lists up to 3 as "Recentes"). */
  recentPages?: PageId[];
}

const RECENT_LIMIT = 3;

/** Downloads the JSON backup (same file as Configurações → Cópia de segurança). */
function downloadBackup() {
  const link = document.createElement("a");
  link.href = api.backupUrl;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const CREATE: [ModalKind, string, Command["icon"]][] = [
  ["transaction", "Novo lançamento", Receipt],
  ["bill", "Nova conta a pagar", WalletCards],
  ["subscription", "Nova assinatura", Tv],
  ["goal", "Nova meta", Target],
  ["investment", "Novo investimento", Landmark],
  ["bank-account", "Nova conta bancária", Building2],
  ["card", "Novo cartão", CreditCard],
  ["category", "Nova categoria", Tags],
];

const RECORD_LIMIT = 30;

/**
 * Commands for the Ctrl/Cmd+K palette (MEL-42): create records, app actions, go to page and record search.
 * R1-CMD-2: without a query "Criar" comes first (Novo lançamento on top, shortcut N), then the actions, then the pages;
 * "Novo lançamento" also wins ties while typing (rank boost). R1-CMD-4: the current page is marked "Você está aqui".
 */
export function buildAppCommands(ctx: AppCommandContext): Command[] {
  const light = ctx.theme === "claro";
  const actions: Command[] = [
    { id: "action:hide-values", label: ctx.hideValues ? "Mostrar valores" : "Ocultar valores", group: "Ações", icon: Eye, keywords: ["privacidade", "esconder"], run: ctx.toggleHideValues },
    ...(ctx.setTheme ? [{ id: "action:theme", label: light ? "Usar tema escuro (Noite)" : "Usar tema claro", group: "Ações", icon: light ? Moon : Sun, keywords: ["tema", "claro", "escuro", "aparência", "modo"], run: () => ctx.setTheme?.(light ? "noite" : "claro") } satisfies Command] : []),
    ...(ctx.setDensity ? [{ id: "action:density", label: ctx.density === "compacto" ? "Densidade confortável" : "Densidade compacta", group: "Ações", icon: Rows3, keywords: ["densidade", "compacto", "confortável", "linhas", "tabela"], run: () => ctx.setDensity?.(ctx.density === "compacto" ? "confortavel" : "compacto") } satisfies Command] : []),
    ...(ctx.closeMonth ? [{ id: "action:close-month", label: `Fechar o mês${ctx.monthLabel ? ` (${ctx.monthLabel})` : ""}`, group: "Ações", icon: CalendarCheck, keywords: ["fechar", "fechamento", "encerrar"], run: ctx.closeMonth } satisfies Command] : []),
    { id: "action:backup", label: "Exportar cópia de segurança", group: "Ações", icon: Download, description: "Baixa os dados em JSON", keywords: ["backup", "exportar", "salvar", "cópia"], run: downloadBackup },
    ...(ctx.openSettingsSection ? [{ id: "action:plan", label: "Plano 70-20-10", group: "Ações", icon: Scale, description: "Configurações", keywords: ["plano", "baldes", "orçamento", "70", "teto"], run: () => ctx.openSettingsSection?.("plano") } satisfies Command] : []),
    ...(ctx.replayTour ? [{ id: "action:tour", label: "Rever o tour", group: "Ações", icon: Sparkles, keywords: ["tour", "ajuda", "guia", "tutorial"], run: ctx.replayTour } satisfies Command] : []),
    { id: "action:refresh", label: "Atualizar dados", group: "Ações", icon: RefreshCw, keywords: ["recarregar"], run: ctx.refresh },
  ];
  const commands: Command[] = [
    ...CREATE.map(([kind, label, icon]): Command => kind === "transaction"
      ? { id: `new:${kind}`, label, group: "Criar", icon: icon ?? Plus, shortcut: ["N"], rank: 1.25, keywords: ["lançar", "despesa", "receita", "gasto", "aporte"], run: () => ctx.openModal(kind) }
      : { id: `new:${kind}`, label, group: "Criar", icon: icon ?? Plus, run: () => ctx.openModal(kind) }),
    ...actions,
    ...navigation.map((item): Command => ({
      id: `go:${item.id}`, label: item.label, group: "Ir para", icon: item.icon,
      description: item.id === ctx.page ? "Você está aqui" : item.subtitle, keywords: [item.shortLabel, item.route], run: () => ctx.navigate(item.id),
    })),
  ];
  const needle = normalizeSearchText(ctx.query);
  if (!needle) {
    const recent = (ctx.recentPages ?? []).filter(id => id !== ctx.page).slice(0, RECENT_LIMIT)
      .map(id => navigation.find(item => item.id === id))
      .filter((item): item is (typeof navigation)[number] => Boolean(item))
      .map((item): Command => ({ id: `recent:${item.id}`, label: item.label, group: "Recentes", icon: item.icon, description: item.subtitle, run: () => ctx.navigate(item.id) }));
    // R4-CMD-1: a page listed in Recentes is not repeated under "Ir para" in the same list.
    const listed = new Set(recent.map(command => command.id.replace(/^recent:/, "go:")));
    return [...recent, ...commands.filter(command => !listed.has(command.id))];
  }
  if (needle.length < 2) return commands;

  const records: Command[] = [];
  const add = (kind: ModalKind, id: number, label: string, description: string, record: object) => {
    if (records.length >= RECORD_LIMIT || !normalizeSearchText(label).includes(needle)) return;
    records.push({ id: `edit:${kind}:${id}`, label, group: "Registros", icon: Pencil, description, run: () => ctx.openEdit(kind, record) });
  };
  const { state } = ctx;
  state.goals.forEach(item => add("goal", item.id, item.name, "Meta", item));
  state.bank_accounts.forEach(item => add("bank-account", item.id, `${item.institution} · ${item.name}`, "Conta bancária", item));
  state.investments.forEach(item => add("investment", item.id, item.name, "Investimento", item));
  state.cards.forEach(item => add("card", item.id, item.name, "Cartão", item));
  state.bills.forEach(item => add("bill", item.id, item.name, "Conta a pagar", item));
  state.subscriptions.forEach(item => add("subscription", item.id, item.name, "Assinatura", item));
  state.categories.forEach(item => add("category", item.id, item.name, "Categoria", item));
  state.transactions.forEach(item => add("transaction", item.id, item.description, `Lançamento de ${item.date.split("-").reverse().join("/")}`, item));
  return [...commands, ...records];
}
