import { dateInMonth, formatDate } from "../../lib/date";

/** "dd/mm" of an ISO date/datetime. */
export const formatDayMonth = (iso: string): string => formatDate(iso).slice(0, 5);

/** Due date of a day-of-month inside `month`, clamped for shorter months. */
export function dueDateInMonth(month: string, day: number): { date: string; clamped: boolean } {
  const date = dateInMonth(month, day);
  return { date, clamped: Number(date.slice(8, 10)) < Math.trunc(day) };
}
