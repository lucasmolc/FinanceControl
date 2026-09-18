import { monthsLabel } from "../../lib/labels";
import { formatMoneyInput, parseMoney } from "../../lib/money";
import type { Settings } from "../../types";
import { MONEY_INVALID, MONEY_NOT_NEGATIVE, tooLong } from "../records/formUtils";

export interface PlanningDraft { name: string; income: string; limit: string; months: string; }
export type PlanningErrors = Partial<Record<keyof PlanningDraft, string>>;

const MONTHS_INVALID = "Informe um número inteiro de 1 a 120 meses.";

export const draftFrom = (settings: Settings): PlanningDraft => ({
  name: settings.display_name,
  income: formatMoneyInput(settings.monthly_net_income_cents),
  limit: formatMoneyInput(settings.monthly_spending_limit_cents),
  months: String(settings.emergency_months_target),
});

/** Optional non-negative money: blank is allowed (saved as zero); invalid text is never silently zero. */
function optionalMoneyError(text: string): string | undefined {
  if (!text.trim()) return undefined;
  const cents = parseMoney(text);
  if (cents === null) return MONEY_INVALID;
  return cents < 0 ? MONEY_NOT_NEGATIVE : undefined;
}

/** Integer 1–120, or null when invalid. */
export function monthsValue(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 && value <= 120 ? value : null;
}

/** Cents for an optional money field: blank → 0, invalid → null. */
export const optionalMoney = (text: string): number | null => text.trim() ? parseMoney(text) : 0;

export function validatePlanning(draft: PlanningDraft): PlanningErrors {
  const errors: PlanningErrors = {
    name: draft.name.trim().length > 120 ? tooLong(120) : undefined,
    income: optionalMoneyError(draft.income),
    limit: optionalMoneyError(draft.limit),
    months: monthsValue(draft.months) === null ? MONTHS_INVALID : undefined,
  };
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message)) as PlanningErrors;
}

export function planningPayload(draft: PlanningDraft) {
  return {
    display_name: draft.name.trim(),
    monthly_net_income_cents: optionalMoney(draft.income) ?? 0,
    monthly_spending_limit_cents: optionalMoney(draft.limit) ?? 0,
    emergency_months_target: monthsValue(draft.months) ?? 0,
  };
}

/** True when the draft differs from the saved settings (money compared by value, so "3000" equals "3.000,00"). */
export function isPlanningDirty(draft: PlanningDraft, settings: Settings): boolean {
  if (draft.name.trim() !== settings.display_name.trim()) return true;
  if (optionalMoney(draft.income) !== settings.monthly_net_income_cents) return true;
  if (optionalMoney(draft.limit) !== settings.monthly_spending_limit_cents) return true;
  return monthsValue(draft.months) !== settings.emergency_months_target;
}

/** Non-blocking advice when the spending ceiling is above the planned income (UX-061). */
export function limitAdvice(draft: PlanningDraft): string | undefined {
  const income = optionalMoney(draft.income);
  const limit = optionalMoney(draft.limit);
  return income !== null && limit !== null && income > 0 && limit > income ? "Atenção: o teto de gastos é maior que a renda informada." : undefined;
}

/** API field (snake_case) → planning form key. */
const planningApiFields: Record<string, keyof PlanningDraft> = {
  display_name: "name",
  monthly_net_income_cents: "income",
  monthly_spending_limit_cents: "limit",
  emergency_months_target: "months",
};

export function mapApiFields(fields: Record<string, string>): PlanningErrors {
  const errors: PlanningErrors = {};
  for (const [field, message] of Object.entries(fields)) {
    const key = planningApiFields[field];
    if (key && !errors[key]) errors[key] = message;
  }
  return errors;
}

export interface BackupDocument { version: number; data: Record<string, unknown>; /** ISO date-time of the export (server UTC with offset). */ exported_at?: unknown; }

/** R4-CFG-2: "exportada em 18/09/2026 às 06:09" (local time), or null when the file has no valid export date. */
export function backupExportedText(document: BackupDocument): string | null {
  if (typeof document.exported_at !== "string" || !document.exported_at.trim()) return null;
  const date = new Date(document.exported_at);
  if (Number.isNaN(date.getTime())) return null;
  const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
  return `exportada em ${day} às ${time}`;
}

/** R4-CFG-1: event the settings index dispatches (detail = section id) so a section collapsed on phones opens. */
export const SETTINGS_OPEN_SECTION = "settings:open-section";

const BACKUP_UNREADABLE = "Não foi possível ler o arquivo. Escolha uma cópia de segurança em JSON exportada pelo LMM Finance Control.";
const BACKUP_INVALID = "Este arquivo não parece uma cópia de segurança do LMM Finance Control.";

/** Parses a backup file; throws an Error with a pt-BR message when it is not a backup document. */
export function parseBackup(text: string): BackupDocument {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error(BACKUP_UNREADABLE); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(BACKUP_INVALID);
  const document = parsed as { version?: unknown; data?: unknown };
  if (typeof document.version !== "number" || !document.data || typeof document.data !== "object" || Array.isArray(document.data)) throw new Error(BACKUP_INVALID);
  return parsed as BackupDocument;
}

/** Number of rows in the backup tables (settings and migrations excluded). */
export function backupRowCount(document: BackupDocument): number {
  return Object.entries(document.data)
    .filter(([table]) => table !== "settings" && table !== "schema_migrations")
    .reduce((total, [, rows]) => total + (Array.isArray(rows) ? rows.length : 0), 0);
}

export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error(BACKUP_UNREADABLE));
    reader.readAsText(file);
  });
}

// ---------- MEL-43: emergency reserve = monthly net income × months ----------

export interface ReserveFormula { targetCents: number; text: string; }

/** "6 meses × R$ 8.000,00 de salário líquido"; null without income or months (nothing is created then). */
export function reserveFormula(incomeCents: number | null, months: number | null, fmt: (cents: number) => string): ReserveFormula | null {
  if (incomeCents === null || months === null || incomeCents <= 0 || months < 1) return null;
  return { targetCents: incomeCents * months, text: `${monthsLabel(months)} × ${fmt(incomeCents)} de salário líquido` };
}

export const RESERVE_NEEDS_INCOME = "Defina o salário líquido para calcular a reserva.";

/** Scroll-spy line: a section is "current" once its top passes 30% of the viewport height. */
const SPY_LINE = 0.3;
/** Section whose top last crossed the spy line (the last one when the page is scrolled to the bottom). */
export function activeSection(tops: { id: string; top: number }[], viewportHeight: number, atBottom: boolean): string | null {
  if (!tops.length) return null;
  if (atBottom) return tops[tops.length - 1]!.id;
  let current = tops[0]!.id;
  for (const item of tops) if (item.top <= viewportHeight * SPY_LINE) current = item.id;
  return current;
}
