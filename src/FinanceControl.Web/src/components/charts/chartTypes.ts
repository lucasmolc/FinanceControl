/** Shared chart types (kept out of component files for react-refresh). */

/** Formats a value (cents by default) for tooltips, labels and the hidden table. */
export type ValueFormatter = (value: number) => string;

export interface TooltipRow { label: string; value: string; color?: string; shape?: "line" | "dashed" }
export interface TooltipData { title: string; rows: TooltipRow[]; note?: string }

export interface TableData { columns: string[]; rows: string[][] }

export interface LegendItem { label: string; color: string; shape?: "rect" | "line" | "dashed" | "band"; value?: string }

/** Tooltip anchor in plot pixels; "side" places it beside a crosshair instead of above the mark. */
export interface ChartPoint { x: number; y: number; placement?: "above" | "side" }
