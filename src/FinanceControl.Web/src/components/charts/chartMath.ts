/** Pure geometry/format helpers shared by the SVG charts (no DOM access). */

const CHART_SLOTS = 8;
export const HIDDEN_VALUE = "R$ •••••";

/** CSS color of the categorical slot `index` (fixed order, never cycled: indexes ≥ 8 fold into the muted "Outros" color). */
export function chartColor(index: number): string {
  return index >= 0 && index < CHART_SLOTS ? `var(--chart-${index + 1}, var(--accent))` : "var(--muted)";
}

/** Rounds a raw step to 1, 2, 2.5 or 5 × 10^n. */
export function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const base = 10 ** exponent;
  const fraction = rawStep / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

export interface Ticks { min: number; max: number; step: number; values: number[] }

/**
 * Clean axis ticks covering [min, max] (always including zero), about `count` intervals. `minStep` keeps money axes
 * from subdividing below a readable unit (R$ 1 = 100 cents). A flat domain (every value zero) has a single tick at zero
 * (CR-09: no "R$ 0" repeated along the axis); the scale still spans one step so the zero line sits on the baseline.
 */
export function niceTicks(min: number, max: number, count = 4, minStep = 0, includeZero = true): Ticks {
  // `includeZero = false` (R2-PRJ-3): the domain follows the data only (used by charts that opt out of a zero baseline).
  let low = includeZero ? Math.min(0, Number.isFinite(min) ? min : 0) : (Number.isFinite(min) ? min : 0);
  let high = includeZero ? Math.max(0, Number.isFinite(max) ? max : 0) : (Number.isFinite(max) ? max : 0);
  if (low === high) return { min: low, max: low + Math.max(1, minStep), step: Math.max(1, minStep), values: [low] };
  const step = Math.max(minStep, niceStep((high - low) / Math.max(1, count)));
  low = Math.floor(low / step) * step;
  high = Math.ceil(high / step) * step;
  const values: number[] = [];
  for (let value = low; value <= high + step / 2; value += step) values.push(Math.round(value / step) * step);
  return { min: low, max: high, step, values };
}

/** Maps `domain` linearly onto `range` (range may be inverted, e.g. SVG y). */
export function linearScale(domain: [number, number], range: [number, number]): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return value => r0 + ((value - d0) / span) * (r1 - r0);
}

export interface Band { start: number; size: number; center: number }

/** Evenly divides `length` into `count` bands with `padding` (0–1) of each slot left as air. */
export function bandLayout(count: number, length: number, padding = 0.3): Band[] {
  if (count <= 0) return [];
  const slot = length / count;
  const size = slot * (1 - padding);
  return Array.from({ length: count }, (_, index) => {
    const start = index * slot + (slot - size) / 2;
    return { start, size, center: start + size / 2 };
  });
}

/** Index of the evenly spaced point nearest to `position` (0…length). */
export function nearestIndex(position: number, count: number, length: number): number {
  if (count <= 1 || length <= 0) return 0;
  const index = Math.round((position / length) * (count - 1));
  return Math.max(0, Math.min(count - 1, index));
}

/** Index of the band containing `position`. */
export function bandIndex(position: number, count: number, length: number): number {
  if (count <= 0 || length <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.floor((position / length) * count)));
}

type Point = [number, number];

/** SVG path through the points; `null` y values break the line into separate segments. */
export function linePath(points: [number, number | null][]): string {
  let path = "";
  let pen = false;
  for (const [x, y] of points) {
    if (y === null || !Number.isFinite(y)) { pen = false; continue; }
    path += `${pen ? "L" : "M"}${round(x)},${round(y)}`;
    pen = true;
  }
  return path;
}

/** Closed area path between an upper line and a lower line (or a baseline), over contiguous non-null points. */
export function areaPath(upper: [number, number | null][], lower: number | [number, number | null][]): string {
  const segments: { top: Point[]; bottom: Point[] }[] = [];
  let current: { top: Point[]; bottom: Point[] } | null = null;
  upper.forEach(([x, y], index) => {
    const bottomY = typeof lower === "number" ? lower : lower[index]?.[1] ?? null;
    if (y === null || bottomY === null || !Number.isFinite(y) || !Number.isFinite(bottomY)) { current = null; return; }
    if (!current) { current = { top: [], bottom: [] }; segments.push(current); }
    current.top.push([x, y]);
    current.bottom.push([x, bottomY]);
  });
  return segments.filter(segment => segment.top.length > 1).map(segment => {
    const top = segment.top.map(([x, y], index) => `${index ? "L" : "M"}${round(x)},${round(y)}`).join("");
    const bottom = [...segment.bottom].reverse().map(([x, y]) => `L${round(x)},${round(y)}`).join("");
    return `${top}${bottom}Z`;
  }).join("");
}

/**
 * Horizontal/vertical bar rectangle path with a 4px rounded data end and a square baseline end.
 * (x, y, width, height) is the full rectangle; `end` names the rounded side.
 */
export function barPath(x: number, y: number, width: number, height: number, end: "top" | "bottom" | "left" | "right", radius = 4): string {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (!w || !h) return "";
  const r = Math.min(radius, end === "top" || end === "bottom" ? w / 2 : h / 2, end === "top" || end === "bottom" ? h : w);
  const [x0, y0, x1, y1] = [round(x), round(y), round(x + w), round(y + h)];
  switch (end) {
    case "top": return `M${x0},${y1}L${x0},${round(y + r)}Q${x0},${y0} ${round(x + r)},${y0}L${round(x + w - r)},${y0}Q${x1},${y0} ${x1},${round(y + r)}L${x1},${y1}Z`;
    case "bottom": return `M${x0},${y0}L${x1},${y0}L${x1},${round(y + h - r)}Q${x1},${y1} ${round(x + w - r)},${y1}L${round(x + r)},${y1}Q${x0},${y1} ${x0},${round(y + h - r)}Z`;
    case "right": return `M${x0},${y0}L${round(x + w - r)},${y0}Q${x1},${y0} ${x1},${round(y + r)}L${x1},${round(y + h - r)}Q${x1},${y1} ${round(x + w - r)},${y1}L${x0},${y1}Z`;
    case "left": return `M${x1},${y0}L${x1},${y1}L${round(x + r)},${y1}Q${x0},${y1} ${x0},${round(y + h - r)}L${x0},${round(y + r)}Q${x0},${y0} ${round(x + r)},${y0}Z`;
  }
}

/** Polar → cartesian (angle in radians, 0 = 12 o'clock, clockwise). */
function polar(cx: number, cy: number, radius: number, angle: number): Point {
  return [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
}

const FULL_TURN = Math.PI * 2;

/**
 * Donut ring segment path from `start` to `end` (radians, clockwise from 12 o'clock). A full turn (a single slice at
 * 100%) cannot be one SVG arc — its end point equals its start point and nothing is drawn (CR-03) — so it becomes a
 * closed ring of two half arcs per edge; the inner edge runs the other way, cutting the hole (nonzero fill rule).
 */
export function arcPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number): string {
  if (end - start >= FULL_TURN - 1e-3) {
    const ring = (radius: number, clockwise: boolean) => {
      const [x0, y0] = polar(cx, cy, radius, start);
      const [x1, y1] = polar(cx, cy, radius, start + Math.PI);
      const flag = clockwise ? 1 : 0;
      return `M${round(x0)},${round(y0)}A${radius},${radius} 0 1 ${flag} ${round(x1)},${round(y1)}A${radius},${radius} 0 1 ${flag} ${round(x0)},${round(y0)}Z`;
    };
    return inner > 0 ? `${ring(outer, true)}${ring(inner, false)}` : ring(outer, true);
  }
  const sweep = end - start;
  if (sweep <= 0) return "";
  const stop = start + sweep;
  const large = sweep > Math.PI ? 1 : 0;
  const [ox0, oy0] = polar(cx, cy, outer, start);
  const [ox1, oy1] = polar(cx, cy, outer, stop);
  const [ix1, iy1] = polar(cx, cy, inner, stop);
  const [ix0, iy0] = polar(cx, cy, inner, start);
  return `M${round(ox0)},${round(oy0)}A${outer},${outer} 0 ${large} 1 ${round(ox1)},${round(oy1)}L${round(ix1)},${round(iy1)}A${inner},${inner} 0 ${large} 0 ${round(ix0)},${round(iy0)}Z`;
}

export interface Slice<T> { item: T; value: number; share: number; start: number; end: number }

/** Angles for each positive value (a small `gap` in radians is removed between slices). */
export function donutSlices<T extends { value: number }>(items: T[], gap = 0.02): Slice<T>[] {
  const positive = items.filter(item => item.value > 0);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (!total) return [];
  const usableGap = positive.length > 1 ? gap : 0;
  let angle = 0;
  return positive.map(item => {
    const share = item.value / total;
    const span = share * Math.PI * 2;
    const slice = { item, value: item.value, share, start: angle + usableGap / 2, end: angle + span - usableGap / 2 };
    angle += span;
    return slice;
  });
}

export interface TopItem { id: string | number; label: string; value: number; color?: string; other?: boolean }

/**
 * Keeps the `limit` largest positive items (in their original color slots by rank of value) and folds the rest into one "Outros" item.
 * Items keep their own `color` when given; otherwise slot i gets `chartColor(i)`. "Outros" is muted.
 */
export function topWithOther<T extends TopItem>(items: T[], limit = 6, otherLabel = "Outros"): TopItem[] {
  const sorted = items.filter(item => item.value > 0).sort((left, right) => right.value - left.value);
  const cap = Math.max(1, Math.min(limit, CHART_SLOTS));
  const needsOther = sorted.length > cap;
  const kept = needsOther ? sorted.slice(0, cap - 1) : sorted;
  const result: TopItem[] = kept.map((item, index) => ({ ...item, color: item.color ?? chartColor(index) }));
  if (needsOther) {
    const rest = sorted.slice(cap - 1).reduce((sum, item) => sum + item.value, 0);
    result.push({ id: "outros", label: otherLabel, value: rest, color: "var(--muted)", other: true });
  }
  return result;
}

/** Running totals (null stays null and does not break the sum). */
export function cumulative(values: (number | null)[]): (number | null)[] {
  let total = 0;
  return values.map(value => {
    if (value === null) return null;
    total += value;
    return total;
  });
}

/** Share in percent with one decimal ("12,5%"). */
export function formatShare(share: number): string {
  return `${(Math.round(share * 1000) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

const compactFormatter = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Compact BRL for axis ticks: "R$ 1,2 mil", "R$ 3 mi". Input in cents. Negative values put the sign before the symbol,
 * like every money value in the app ("-R$ 5 mil", matching `brl`: "-R$ 4.500,00") — CR-29.
 */
export function compactBrl(cents: number): string {
  const value = cents / 100;
  const sign = value < 0 && Math.round(Math.abs(value)) !== 0 ? "-" : "";
  const size = Math.abs(value);
  if (size < 1000) return `${sign}R$ ${Math.round(size).toLocaleString("pt-BR")}`;
  return `${sign}R$ ${compactFormatter.format(size)}`;
}

/**
 * How many value ticks fit along an axis of `length` px when each label needs `labelSize` px (CR-11: "R$ 1 mil /
 * 2 mil / 3 mil" collided on narrow bar charts). Always 1–`max` intervals.
 */
export function tickBudget(length: number, labelSize: number, max = 4): number {
  if (!Number.isFinite(length) || length <= 0) return 1;
  return Math.max(1, Math.min(max, Math.floor(length / Math.max(1, labelSize)) - 1));
}

/** Drops ticks whose label repeats the previous one (rounding in compact formats). */
export function distinctTicks(values: number[], format: (value: number) => string): number[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const label = format(value);
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

/** Evenly thinned label indexes (constant step) so at most `max` x labels are drawn; the last index is kept when it does not crowd the previous one. */
export function labelIndexes(count: number, max: number): number[] {
  if (count <= 0) return [];
  if (count <= max || max < 2) return Array.from({ length: count }, (_, index) => index);
  const step = Math.ceil((count - 1) / (max - 1));
  const indexes: number[] = [];
  for (let index = 0; index < count; index += step) indexes.push(index);
  const last = indexes[indexes.length - 1] ?? 0;
  if (last !== count - 1) {
    if (count - 1 - last < step * 0.75) indexes[indexes.length - 1] = count - 1;
    else indexes.push(count - 1);
  }
  return indexes;
}

/** Min and max over every finite value of every list. */
export function extent(...lists: (number | null | undefined)[][]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const list of lists) for (const value of list) {
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min === Infinity ? [0, 0] : [min, max];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Formatter that masks every value while privacy mode is on. */
export function maskFormat(format: (value: number) => string, hidden: boolean): (value: number) => string {
  return hidden ? () => HIDDEN_VALUE : format;
}

/** First and last finite value of a series (for aria summaries). */
export function firstLast(values: (number | null)[]): [number, number] | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const first = finite[0];
  const last = finite[finite.length - 1];
  return first === undefined || last === undefined ? null : [first, last];
}
