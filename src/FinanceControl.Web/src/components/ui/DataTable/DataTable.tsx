import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from "lucide-react";
import { Button } from "../Button/Button";
import { Checkbox } from "../Checkbox/Checkbox";
import { Pagination } from "../Pagination/Pagination";
import { Popover } from "../Popover/Popover";
import { cx } from "../shared/cx";
import { useControllable } from "../shared/useControllable";
import { compareValues, type SortState } from "./sorting";

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  /** Plain-text name: stacked-card label on phones (`td[data-label]`) and the "Colunas" menu. Defaults to `header` when it is a string. */
  label?: string;
  cell: (row: T) => ReactNode;
  /** Enables sorting by this column. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** "right" = numeric column (`.num`, tabular). */
  align?: "left" | "right";
  /** Row actions column (`td.actions`, no mobile label, never hidden). */
  actions?: boolean;
  /** Can be hidden in "Colunas" (default true; the first column never). */
  hideable?: boolean;
  defaultHidden?: boolean;
  width?: string;
  className?: string;
}

/**
 * Compact phone row (CR-08): icon + title on the first line, a secondary "a · b · c" line, the amount at the right
 * (tabular numerals) and the row actions (usually a "…" `RowMenu`). Replaces the stacked "label: value" cards when set.
 */
export interface DataTableCompact<T> {
  leading?: (row: T) => ReactNode;
  title: (row: T) => ReactNode;
  /** Secondary line pieces, joined with " · " (empty pieces are skipped). */
  meta?: (row: T) => ReactNode[];
  amount?: (row: T) => ReactNode;
  /** Small line under the amount (e.g. a status badge or a running balance). */
  aside?: (row: T) => ReactNode;
  /** Full-width line below the row (e.g. a progress bar). */
  detail?: (row: T) => ReactNode;
  actions?: (row: T) => ReactNode;
}

/** Row groups (e.g. days with a subtotal, statement months): consecutive rows with the same key share a header. */
export interface DataTableGroups<T> {
  key: (row: T) => string;
  header: (key: string, rows: T[]) => ReactNode;
  /** Groups only while the table is sorted by one of these columns (default: always). */
  columns?: string[];
  /** Columns hidden while grouping (their value is already in the group header, e.g. the date of a day group, R1-LANC-4). */
  hideColumns?: string[];
  /** Runs shorter than this get no header row (e.g. R4-LANC-1: a day with one transaction in the compact density). */
  minRows?: number;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string | number;
  /** Table caption (visually hidden unless `showCaption`). */
  caption: string;
  showCaption?: boolean;
  /** Row name used in "Selecionar …" labels. */
  rowLabel?: (row: T) => string;
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  selectable?: boolean;
  selected?: Array<string | number>;
  onSelectionChange?: (keys: Array<string | number>) => void;
  /** Buttons of the bulk bar shown while rows are selected. */
  bulkActions?: (rows: T[], clear: () => void) => ReactNode;
  /** Client-side pagination (0 = off). */
  pageSize?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  /** Windowing for long lists (desktop, unpaginated, ungrouped, > 60 rows): renders only the visible rows. */
  virtualize?: boolean | { rowHeight?: number; height?: number };
  /** Shows the "Colunas" menu. */
  columnsConfigurable?: boolean;
  visibleColumns?: string[];
  onVisibleColumnsChange?: (ids: string[]) => void;
  /** Content at the left of the toolbar (filters, search). */
  toolbar?: ReactNode;
  empty?: ReactNode;
  loading?: boolean;
  density?: "comfortable" | "compact";
  rowClassName?: (row: T) => string | undefined;
  className?: string;
  /** Compact phone rows (CR-08); without it phones keep the stacked cards. */
  compact?: DataTableCompact<T>;
  /** Media query that switches to the compact rows (default: phones, ≤ 620px). */
  compactQuery?: string;
  /**
   * R4-X-1: also switch to the compact rows whenever the table would scroll sideways inside its container (e.g. 1024 px
   * with the sidebar), so the row actions never leave the screen. Goes back to the table once the container is wide
   * enough again.
   */
  compactOnOverflow?: boolean;
  groups?: DataTableGroups<T>;
}

const OVERSCAN = 8;

/**
 * Width the table needed when it last overflowed its wrapper (null = it fits). The table is measured after each render
 * and on every resize of the root; while compact, the table comes back once the root is at least that wide.
 */
function useOverflowFallback(enabled: boolean) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [neededWidth, setNeededWidth] = useState<number | null>(null);
  const check = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const wrap = root.querySelector<HTMLElement>(":scope > .table-wrap");
    if (wrap) {
      if (wrap.clientWidth > 0 && wrap.scrollWidth > wrap.clientWidth + 1) setNeededWidth(wrap.scrollWidth);
    } else {
      setNeededWidth(current => (current !== null && root.clientWidth >= current ? null : current));
    }
  }, []);
  useLayoutEffect(() => { if (enabled) check(); });
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(check) : null;
    observer?.observe(root);
    window.addEventListener("resize", check);
    return () => { observer?.disconnect(); window.removeEventListener("resize", check); };
  }, [enabled, check]);
  return { rootRef, overflowing: enabled && neededWidth !== null };
}
const NARROW = "(max-width: 620px)";

function useNarrow(query = NARROW): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setNarrow(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [query]);
  return narrow;
}

const labelOf = <T,>(column: DataTableColumn<T>) => column.label ?? (typeof column.header === "string" ? column.header : column.id);

interface Segment<T> { key: string; header: ReactNode; rows: T[]; }

/** Splits `rows` into runs of consecutive rows with the same group key (a single headerless run without groups). */
function segmentRows<T>(rows: T[], groups: DataTableGroups<T> | undefined): Segment<T>[] {
  if (!groups) return [{ key: "all", header: null, rows }];
  const runs: Array<{ key: string; rows: T[] }> = [];
  for (const row of rows) {
    const key = groups.key(row);
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else runs.push({ key, rows: [row] });
  }
  // The same key may appear in two runs (unsorted data); suffix keeps React keys unique.
  const minRows = groups.minRows ?? 1;
  return runs.map((run, index) => ({ key: `${run.key}#${index}`, header: run.rows.length >= minRows ? groups.header(run.key, run.rows) : null, rows: run.rows }));
}

/**
 * Data table (MEL-42) on the existing `.table-wrap > table.data-table` contract (stacked cards ≤ 620px via `td[data-label]`):
 * sortable headers (`aria-sort`), configurable columns, row selection with a bulk-action bar, client pagination,
 * simple windowing for long lists, optional row groups (`tbody` per group with a header row) and, with `compact`,
 * a dense one-line list on phones (CR-08).
 */
export function DataTable<T>({ rows, columns, rowKey, caption, showCaption = false, rowLabel, sort, defaultSort = null, onSortChange, selectable = false, selected, onSelectionChange, bulkActions, pageSize = 0, page, onPageChange, virtualize = false, columnsConfigurable = false, visibleColumns, onVisibleColumnsChange, toolbar, empty, loading = false, density = "comfortable", rowClassName, className, compact, compactQuery = NARROW, compactOnOverflow = false, groups }: DataTableProps<T>) {
  const [sortState, setSort] = useControllable<SortState | null>(sort, defaultSort, onSortChange);
  const [selection, setSelection] = useControllable<Array<string | number>>(selected, [], onSelectionChange);
  const [currentPage, setPage] = useControllable<number>(page, 1, onPageChange);
  const [shown, setShown] = useControllable<string[]>(visibleColumns, columns.filter(column => !column.defaultHidden).map(column => column.id), onVisibleColumnsChange);
  const [scrollTop, setScrollTop] = useState(0);
  /** Phones: checkboxes only after "Selecionar" (or while something is selected), so rows keep their width. */
  const [picking, setPicking] = useState(false);
  const narrow = useNarrow();
  const compactNarrow = useNarrow(compactQuery);
  const phoneCompact = Boolean(compact) && compactNarrow;
  const { rootRef, overflowing } = useOverflowFallback(Boolean(compact) && compactOnOverflow && !phoneCompact);
  const compactMode = phoneCompact || overflowing;


  const sorted = useMemo(() => {
    if (!sortState) return rows;
    const column = columns.find(entry => entry.id === sortState.column);
    if (!column?.sortValue) return rows;
    const factor = sortState.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => compareValues(column.sortValue!(a), column.sortValue!(b), factor));
  }, [rows, columns, sortState]);

  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(Math.max(1, currentPage), pageCount);
  const paged = pageSize > 0 ? sorted.slice((safePage - 1) * pageSize, safePage * pageSize) : sorted;

  const grouping = groups && (!groups.columns || (sortState !== null && sortState !== undefined && groups.columns.includes(sortState.column))) ? groups : undefined;
  const hiddenByGroup = grouping?.hideColumns ?? [];
  const activeColumns = columns.filter((column, index) => !hiddenByGroup.includes(column.id) && (index === 0 || column.actions || column.hideable === false || shown.includes(column.id)));
  const windowing = Boolean(virtualize) && pageSize === 0 && !narrow && !grouping && !compactMode && paged.length > 60;
  const rowHeight = typeof virtualize === "object" && virtualize.rowHeight ? virtualize.rowHeight : density === "compact" ? 40 : 52;
  const viewport = typeof virtualize === "object" && virtualize.height ? virtualize.height : 560;
  const start = windowing ? Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN) : 0;
  const end = windowing ? Math.min(paged.length, Math.ceil((scrollTop + viewport) / rowHeight) + OVERSCAN) : paged.length;
  const visible = paged.slice(start, end);
  const segments = segmentRows(visible, grouping);

  const keys = sorted.map(rowKey);
  const selectedSet = new Set(selection);
  const selectedRows = sorted.filter(row => selectedSet.has(rowKey(row)));
  const allSelected = keys.length > 0 && keys.every(key => selectedSet.has(key));
  const someSelected = !allSelected && keys.some(key => selectedSet.has(key));
  const clearSelection = () => setSelection([]);
  const toggleRow = (key: string | number) => setSelection(selectedSet.has(key) ? selection.filter(entry => entry !== key) : [...selection, key]);

  const toggleSort = (column: DataTableColumn<T>) => {
    if (sortState?.column === column.id) setSort({ column: column.id, direction: sortState.direction === "asc" ? "desc" : "asc" });
    else setSort({ column: column.id, direction: "asc" });
  };

  const colSpan = activeColumns.length + (selectable ? 1 : 0);
  const hideableColumns = columns.filter((column, index) => index > 0 && !column.actions && column.hideable !== false);
  const selectAll = <Checkbox aria-label={allSelected ? "Desmarcar todos" : "Selecionar todos"} checked={allSelected} indeterminate={someSelected} disabled={!keys.length}
    onChange={checked => setSelection(checked ? keys : [])} />;
  const rowCheckbox = (row: T, key: string | number) => <Checkbox aria-label={`Selecionar ${rowLabel?.(row) ?? String(key)}`} checked={selectedSet.has(key)} onChange={() => toggleRow(key)} />;

  const renderRow = (row: T, index: number) => {
    const key = rowKey(row);
    return <tr key={key} className={cx(selectedSet.has(key) && "is-selected", rowClassName?.(row))} aria-rowindex={windowing ? start + index + 2 : undefined} style={windowing ? { height: rowHeight } : undefined}>
      {selectable && <td data-label="" className="ui-select-cell">{rowCheckbox(row, key)}</td>}
      {activeColumns.map(column => <td key={column.id} data-label={column.actions ? undefined : labelOf(column)} className={cx(column.align === "right" && "num", column.actions && "actions", column.className)}>
        {column.cell(row)}
      </td>)}
    </tr>;
  };

  const showChecks = selectable && (picking || selection.length > 0);

  const renderCompactRow = (row: T) => {
    const key = rowKey(row);
    const spec = compact!;
    const meta = (spec.meta?.(row) ?? []).filter(piece => piece !== null && piece !== undefined && piece !== false && piece !== "");
    const amount = spec.amount?.(row);
    const aside = spec.aside?.(row);
    const detail = spec.detail?.(row);
    const actions = spec.actions?.(row);
    return <li key={key} className={cx("ui-compact-row", selectedSet.has(key) && "is-selected", rowClassName?.(row))}>
      {showChecks && <span className="ui-compact-select">{rowCheckbox(row, key)}</span>}
      {spec.leading && <span className="ui-compact-leading">{spec.leading(row)}</span>}
      <span className="ui-compact-main">
        <span className="ui-compact-title">{spec.title(row)}</span>
        {meta.length > 0 && <span className="ui-compact-meta">{meta.map((piece, index) => <Fragment key={index}>{index > 0 && <span aria-hidden="true" className="ui-compact-dot"> · </span>}<span>{piece}</span></Fragment>)}</span>}
      </span>
      {(amount !== undefined || aside !== undefined) && <span className="ui-compact-end">
        {amount !== undefined && <span className="ui-compact-amount">{amount}</span>}
        {aside !== undefined && aside !== null && <span className="ui-compact-aside">{aside}</span>}
      </span>}
      {actions !== undefined && actions !== null && <span className="ui-compact-actions">{actions}</span>}
      {detail !== undefined && detail !== null && <span className="ui-compact-detail">{detail}</span>}
    </li>;
  };

  const stateMessage = loading && !rows.length ? <p className="ui-table-state" role="status">Carregando…</p>
    : !loading && !paged.length ? <p className="ui-table-state">{empty ?? "Nenhum registro."}</p> : null;

  const compactBody = () => <div className="ui-compact-wrap" aria-busy={loading || undefined}>
    {selectable && keys.length > 0 && <div className="ui-compact-selectall">
      {showChecks
        ? <>{selectAll}<span aria-hidden="true">Selecionar todos</span>
          <Button size="sm" variant="ghost" className="ui-compact-pick" onClick={() => { setPicking(false); clearSelection(); }}>Concluir</Button></>
        : <Button size="sm" variant="ghost" className="ui-compact-pick" onClick={() => setPicking(true)}>Selecionar</Button>}
    </div>}
    {stateMessage}
    {paged.length > 0 && (grouping
      ? <ul className="ui-compact-list is-grouped" aria-label={caption}>
        {segments.map(segment => <li key={segment.key} className="ui-compact-group">
          {segment.header !== null && <div className="ui-group-header">{segment.header}</div>}
          <ul className="ui-compact-list">{segment.rows.map(renderCompactRow)}</ul>
        </li>)}
      </ul>
      : <ul className="ui-compact-list" aria-label={caption}>{visible.map(renderCompactRow)}</ul>)}
  </div>;

  const tableBody = () => <div className={cx("table-wrap", windowing && "is-virtual")} style={windowing ? { maxHeight: viewport, overflowY: "auto" } : undefined}
    onScroll={windowing ? event => setScrollTop(event.currentTarget.scrollTop) : undefined} aria-busy={loading || undefined}>
    <table className={cx("data-table", grouping && "is-grouped")} aria-rowcount={windowing ? paged.length + 1 : undefined}>
      <caption className={showCaption ? "ui-table-caption" : "sr-only"}>{caption}</caption>
      <thead>
        <tr aria-rowindex={windowing ? 1 : undefined}>
          {selectable && <th scope="col" className="ui-select-cell">{selectAll}</th>}
          {activeColumns.map(column => {
            const direction = sortState?.column === column.id ? sortState.direction : null;
            return <th key={column.id} scope="col" style={column.width ? { width: column.width } : undefined}
              className={cx(column.align === "right" && "num", column.actions && "actions", column.className)}
              aria-sort={direction ? (direction === "asc" ? "ascending" : "descending") : undefined}>
              {column.sortValue ? <button type="button" className={cx("ui-sort", direction && "is-sorted")} onClick={() => toggleSort(column)}>
                {column.header}
                {direction === "asc" ? <ArrowUp size={13} aria-hidden="true" /> : direction === "desc" ? <ArrowDown size={13} aria-hidden="true" /> : <ArrowUpDown size={13} aria-hidden="true" />}
              </button> : column.actions && !column.header ? <span className="sr-only">Ações</span> : column.header}
            </th>;
          })}
        </tr>
      </thead>
      {grouping && paged.length > 0
        ? segments.map(segment => <tbody key={segment.key} className="ui-group">
          {segment.header !== null && <tr className="ui-group-row"><th scope="rowgroup" colSpan={colSpan}><div className="ui-group-header">{segment.header}</div></th></tr>}
          {segment.rows.map((row, index) => renderRow(row, index))}
        </tbody>)
        : <tbody>
          {loading && !rows.length && <tr><td colSpan={colSpan} className="ui-table-state" role="status">Carregando…</td></tr>}
          {!loading && !paged.length && <tr><td colSpan={colSpan} className="ui-table-state">{empty ?? "Nenhum registro."}</td></tr>}
          {windowing && start > 0 && <tr aria-hidden="true" className="ui-spacer"><td colSpan={colSpan} style={{ height: start * rowHeight, padding: 0, border: 0 }} /></tr>}
          {visible.map((row, offset) => renderRow(row, offset))}
          {windowing && end < paged.length && <tr aria-hidden="true" className="ui-spacer"><td colSpan={colSpan} style={{ height: (paged.length - end) * rowHeight, padding: 0, border: 0 }} /></tr>}
        </tbody>}
    </table>
  </div>;

  return <div ref={rootRef} className={cx("ui-data-table", `density-${density}`, compactMode && "is-compact", overflowing && "is-overflow-compact", className)}>
    {(toolbar || (columnsConfigurable && !compactMode)) && <div className="toolbar ui-table-toolbar">
      {toolbar}
      {columnsConfigurable && !compactMode && hideableColumns.length > 0 && <Popover label="Colunas visíveis" placement="bottom-end" trigger={<Button size="sm" variant="ghost" icon={Columns3}>Colunas</Button>}>
        <fieldset className="ui-columns-menu">
          <legend className="ui-popover-title">Colunas visíveis</legend>
          {hideableColumns.map(column => <Checkbox key={column.id} label={labelOf(column)} checked={shown.includes(column.id)}
            onChange={checked => setShown(checked ? [...shown, column.id] : shown.filter(id => id !== column.id))} />)}
        </fieldset>
      </Popover>}
    </div>}

    {selectable && selection.length > 0 && <div className="ui-bulk-bar" role="region" aria-label="Ações em lote">
      <span className="ui-bulk-count" aria-live="polite">{selection.length === 1 ? "1 selecionado" : `${selection.length} selecionados`}</span>
      <div className="ui-bulk-actions">{bulkActions?.(selectedRows, clearSelection)}</div>
      <Button size="sm" variant="ghost" onClick={clearSelection}>Limpar seleção</Button>
    </div>}

    {compactMode ? compactBody() : tableBody()}

    {pageSize > 0 && sorted.length > pageSize && <Pagination page={safePage} pageCount={pageCount} total={sorted.length} pageSize={pageSize} onChange={setPage} />}
  </div>;
}
