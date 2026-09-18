import { useLayoutEffect, useRef, type RefObject } from "react";

/** Grid row unit of the masonry layout (px); matches `.widget-grid.is-masonry { grid-auto-rows }` in dataviz.css. */
export const MASONRY_ROW_PX = 4;

/** Rows a widget of `height` px spans on a grid with `unit` px rows and `gap` px row gap (the gap is paid between rows). */
export const masonrySpan = (height: number, gap: number, unit = MASONRY_ROW_PX): number =>
  Math.max(1, Math.ceil((height + gap) / (unit + gap)));

/**
 * R2-PAINEL-1: the dashboard widgets have very different heights (a 5-row budget list next to a donut), so a plain grid
 * leaves holes under the short ones. Each widget spans as many small grid rows as its own height needs; with the
 * grid's `dense` flow the next widget fills the space under a short one. Heights are re-measured whenever a widget
 * resizes (data arrives, skeleton → chart, density change). Without ResizeObserver (tests, old engines) nothing changes
 * and the CSS grid keeps its normal rows.
 */
export function useMasonry<T extends HTMLElement>(deps: readonly unknown[]): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const items = () => Array.from(grid.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    const measure = () => {
      const gap = Number.parseFloat(getComputedStyle(grid).rowGap) || 0;
      for (const item of items()) {
        const span = masonrySpan(item.getBoundingClientRect().height, gap);
        const value = `span ${span}`;
        if (item.style.gridRowEnd !== value) item.style.gridRowEnd = value;
      }
    };
    grid.classList.add("is-masonry");
    // Re-measured when a widget resizes (ResizeObserver: viewport, density, fonts) and — since resize observations wait
    // for a rendering step, which background tabs skip — whenever the widgets' content changes (MutationObserver,
    // coalesced into one microtask). A span never changes a widget's own height, so neither can loop.
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => { pending = false; measure(); });
    };
    const observer = new ResizeObserver(measure);
    items().forEach(item => observer.observe(item));
    const mutations = typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
    mutations?.observe(grid, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden", "open"] });
    measure();
    return () => {
      observer.disconnect();
      mutations?.disconnect();
      grid.classList.remove("is-masonry");
      items().forEach(item => { item.style.gridRowEnd = ""; });
    };
    // The caller passes what changes the set of widgets (order, editing); sizes are followed by the observer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
