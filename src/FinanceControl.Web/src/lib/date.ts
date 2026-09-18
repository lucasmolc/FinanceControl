// All helpers use LOCAL time. Never use toISOString() for business dates:
// after 21h in UTC−3 it already returns the next day.

const pad = (value: number) => String(value).padStart(2, "0");

const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function parseMonth(month: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  return monthNumber >= 1 && monthNumber <= 12 ? { year, month: monthNumber } : null;
}

/** Local "YYYY-MM-DD" for the given moment (default: now). */
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayISO = (): string => toISODate(new Date());

export const currentMonth = (): string => todayISO().slice(0, 7);

export function isISODate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ""));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(year, month, 0).getDate();
}

export const isMonth = (text: string): boolean => parseMonth(text) !== null;

/** "dd/mm/aaaa"; returns the input unchanged when it is not an ISO date. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(iso ?? "");
}

/** "setembro de 2026" */
export function formatMonthLabel(month: string): string {
  const parsed = parseMonth(month);
  if (!parsed) return month;
  return monthFormatter.format(new Date(parsed.year, parsed.month - 1, 1));
}

export function shiftMonth(month: string, delta: number): string {
  const parsed = parseMonth(month);
  if (!parsed) return month;
  const index = parsed.year * 12 + (parsed.month - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12 + 12) % 12 + 1)}`;
}

export function daysInMonth(month: string): number {
  const parsed = parseMonth(month);
  return parsed ? new Date(parsed.year, parsed.month, 0).getDate() : 31;
}

/** ISO date for `day` inside `month`, clamped to the last day of shorter months. */
export function dateInMonth(month: string, day: number): string {
  const safeDay = Math.min(Math.max(1, Math.trunc(day) || 1), daysInMonth(month));
  return `${month}-${pad(safeDay)}`;
}

/** Default date for records created while viewing `month`: today in the current month, otherwise the first day. */
export function defaultDateForMonth(month: string): string {
  return month === currentMonth() || !isMonth(month) ? todayISO() : `${month}-01`;
}

function isoParts(iso: string): [number, number, number] {
  const [year = 1970, month = 1, day = 1] = iso.slice(0, 10).split("-").map(Number);
  return [year, month, day];
}

/** ISO date `days` after `iso` (calendar arithmetic, DST-safe). */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = isoParts(iso);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** ISO date `months` after `iso`, keeping the day and clamping it to shorter months (31/01 + 1 → 28/02 or 29/02). */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = isoParts(iso);
  return dateInMonth(shiftMonth(`${year}-${pad(month)}`, months), day);
}

function dateParts(iso: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Whole calendar days from `from` to `to` (ISO dates or timestamps); negative when `to` is earlier, 0 when either is invalid. DST-safe. */
export function daysBetween(from: string, to: string): number {
  const a = dateParts(from);
  const b = dateParts(to);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

/** Calendar-month distance between the months of two ISO dates (to − from). */
export function monthsBetween(from: string, to: string): number {
  const a = dateParts(from);
  const b = dateParts(to);
  if (!a || !b) return 0;
  return (b[0] - a[0]) * 12 + (b[1] - a[1]);
}
