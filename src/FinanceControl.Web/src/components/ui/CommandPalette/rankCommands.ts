import { fuzzyScore } from "../shared/text";
import type { Command } from "./CommandPalette";

/** Substring matches (prefix, whole word, inside a word) score ≥ ~500 in `fuzzyScore`; subsequence matches stay far below. */
const STRONG_MATCH = 500;
const WEAK_MATCH = 100;

/** Match of `query` in what the command IS (label and keywords), ignoring its group and description. */
function labelScore(command: Command, query: string): number {
  return (command.rank ?? 1) * Math.max(fuzzyScore(query, command.label), ...(command.keywords ?? []).map(keyword => fuzzyScore(query, keyword) * 0.8));
}

/** R3-CMD-2: group of the commands that match only through their description/subtitle while others match by name. */
export const RELATED_GROUP = "Relacionados";

/** Best match of `query` in the label, keywords, group and description (label weighs most). */
export function commandScore(command: Command, query: string): number {
  return (command.rank ?? 1) * Math.max(
    fuzzyScore(query, command.label),
    ...(command.keywords ?? []).map(keyword => fuzzyScore(query, keyword) * 0.8),
    command.group ? fuzzyScore(query, command.group) * 0.3 : 0,
    command.description ? fuzzyScore(query, command.description) * 0.4 : 0,
  );
}

/**
 * Ranked results for a query (CR-17): groups are ordered by their best match and items by score inside each group, so
 * an exact record ("Netflix" for "net") beats pages that only match as a scattered subsequence; when any strong
 * (substring) match exists, weak subsequence matches are dropped; `groupLimits` caps groups (e.g. 3 pages). Without a
 * query the commands keep their order.
 */
export function rankCommands(commands: Command[], query: string, groupLimits: Record<string, number> = {}): Command[] {
  if (!query.trim()) return commands;
  const scored = commands
    .map(command => ({ command, score: commandScore(command, query), group: command.group ?? "" }))
    .filter(entry => entry.score > 0);
  const strong = scored.some(entry => entry.score >= STRONG_MATCH);
  const kept = strong ? scored.filter(entry => entry.score >= WEAK_MATCH) : scored;
  // R3-CMD-2: when something matches by name ("Nova categoria" for "categoria"), a command that only mentions the query in
  // its subtitle (Relatórios · "… por categoria") moves to a trailing "Relacionados" group instead of splitting the list.
  const named = kept.some(entry => labelScore(entry.command, query) >= STRONG_MATCH);
  const tiered = named ? kept.map(entry => (labelScore(entry.command, query) >= WEAK_MATCH ? entry : { ...entry, group: RELATED_GROUP, related: true })) : kept;
  const best = new Map<string, number>();
  tiered.forEach(entry => { if (!("related" in entry)) best.set(entry.group, Math.max(best.get(entry.group) ?? 0, entry.score)); });
  const firstSeen = [...new Set(commands.map(command => command.group ?? ""))];
  tiered.sort((a, b) => Number("related" in a) - Number("related" in b)
    || (best.get(b.group) ?? 0) - (best.get(a.group) ?? 0)
    || firstSeen.indexOf(a.group) - firstSeen.indexOf(b.group)
    || b.score - a.score);
  const counts = new Map<string, number>();
  return tiered.filter(entry => {
    const count = (counts.get(entry.group) ?? 0) + 1;
    counts.set(entry.group, count);
    return count <= (groupLimits[entry.group] ?? Infinity);
  }).map(entry => ("related" in entry ? { ...entry.command, group: RELATED_GROUP } : entry.command));
}
