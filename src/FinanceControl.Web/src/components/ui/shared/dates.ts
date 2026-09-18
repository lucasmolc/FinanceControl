import { isISODate, toISODate } from "../../../lib/date";

export const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const WEEKDAY_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];

const pad = (value: number) => String(value).padStart(2, "0");

/** Local Date from "YYYY-MM-DD" (null when invalid). */
export function fromISO(iso: string | null | undefined): Date | null {
  if (!iso || !isISODate(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

export { toISODate };

/** "YYYY-MM-DD" → "dd/mm/aaaa" ("" for blank/invalid). */
export function isoToBR(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** "dd/mm/aaaa" (also "d/m/aa", "ddmmaaaa") → "YYYY-MM-DD" or null. Two-digit years mean 20xx. */
export function brToISO(text: string): string | null {
  const trimmed = text.trim();
  let day: number; let month: number; let year: number;
  const digits = trimmed.replace(/\D/g, "");
  const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(trimmed);
  if (parts) { day = Number(parts[1]); month = Number(parts[2]); year = Number(parts[3]); }
  else if (/^\d{8}$/.test(trimmed)) { day = Number(digits.slice(0, 2)); month = Number(digits.slice(2, 4)); year = Number(digits.slice(4)); }
  else return null;
  if (year < 100) year += 2000;
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  return isISODate(iso) ? iso : null;
}

/** Typing mask: digits only get "/" inserted ("1809" → "18/09"); text the user already split with "/" ("1/9/26") is kept. */
export function maskBR(text: string): string {
  const cleaned = text.replace(/[^\d/]/g, "");
  if (cleaned.includes("/")) {
    const [day = "", month, year] = cleaned.split("/");
    const parts = cleaned.split("/").length;
    if (parts <= 3 && day.length <= 2 && (month ?? "").length <= 2 && (year ?? "").length <= 4) return cleaned;
  }
  const digits = cleaned.replace(/\D/g, "").slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += "/" + digits.slice(2, 4);
  if (digits.length > 4) out += "/" + digits.slice(4, 8);
  return out;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Same day in another month, clamped to the month's last day. */
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), last));
}

/** 6×7 grid of dates (weeks start on Sunday) covering the month of `date`. */
export function monthGrid(date: Date): Date[][] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)));
}

export function longDateLabel(date: Date): string {
  return `${WEEKDAY_NAMES[date.getDay()]}, ${date.getDate()} de ${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`;
}

export function monthTitle(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`;
}

/** Clamps an ISO date into [min, max] (ISO strings compare lexicographically). */
export function outOfRange(iso: string, min?: string, max?: string): boolean {
  return Boolean((min && iso < min) || (max && iso > max));
}

/** "YYYY-MM" helpers */
export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${pad(monthIndex + 1)}`;
}

export function parseMonthKey(value: string | null | undefined): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const month = Number(match[2]) - 1;
  return month >= 0 && month <= 11 ? { year: Number(match[1]), month } : null;
}
