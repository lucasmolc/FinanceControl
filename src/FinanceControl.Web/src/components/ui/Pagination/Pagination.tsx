import { forwardRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx, sizeClass, type Size } from "../shared/cx";
import { pageItems } from "./pageItems";

export interface PaginationProps {
  /** Current page, 1-based. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** Pages shown on each side of the current one. */
  siblingCount?: number;
  /** "Mostrando 1–50 de 230" summary (needs total and pageSize). */
  total?: number;
  pageSize?: number;
  size?: Size;
  "aria-label"?: string;
  className?: string;
}

const count = new Intl.NumberFormat("pt-BR");

/** Pagination navigation (`<nav aria-label="Paginação">`, `aria-current="page"`). Hidden when there is one page. */
export const Pagination = forwardRef<HTMLElement, PaginationProps>(function Pagination({ page, pageCount, onChange, siblingCount = 1, total, pageSize, size = "md", className, ...aria }, ref) {
  if (pageCount <= 1 && total === undefined) return null;
  const go = (target: number) => { if (target >= 1 && target <= pageCount && target !== page) onChange(target); };
  const summary = total !== undefined && pageSize ? `Mostrando ${count.format(total ? (page - 1) * pageSize + 1 : 0)}–${count.format(Math.min(total, page * pageSize))} de ${count.format(total)}` : null;
  return <nav ref={ref} className={cx("ui-pagination", sizeClass(size), className)} aria-label={aria["aria-label"] ?? "Paginação"}>
    {summary && <p className="ui-pagination-summary muted" aria-live="polite">{summary}</p>}
    {pageCount > 1 && <ul className="ui-pagination-list">
      <li><button type="button" className="icon-btn" aria-label="Página anterior" disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft size={16} aria-hidden="true" /></button></li>
      {pageItems(page, pageCount, siblingCount).map((item, index) => item === "gap"
        ? <li key={`gap-${index}`} className="ui-pagination-gap" aria-hidden="true">…</li>
        : <li key={item}><button type="button" className={cx("ui-page", item === page && "is-current")} aria-label={`Página ${item}`} aria-current={item === page ? "page" : undefined} onClick={() => go(item)}>{item}</button></li>)}
      <li><button type="button" className="icon-btn" aria-label="Próxima página" disabled={page >= pageCount} onClick={() => go(page + 1)}><ChevronRight size={16} aria-hidden="true" /></button></li>
    </ul>}
  </nav>;
});
