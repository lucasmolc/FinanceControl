/** Focuses an element that is not natively focusable (adds tabindex=-1 when needed). */
function focusStatic(element: HTMLElement): boolean {
  if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
  element.focus();
  return document.activeElement === element;
}

/** Focus fallback (MEL-08): the `h2` of the current page header, or `main`; never `body`. */
export function focusPageHeading(): void {
  const heading = document.querySelector<HTMLElement>("main .page-header h2");
  if (heading && !heading.closest("[inert]") && focusStatic(heading)) return;
  const main = document.querySelector<HTMLElement>("main");
  if (main && !main.closest("[inert]")) focusStatic(main);
}

/** True when `element` can take focus back: still in the document, not hidden and not inside an inert region. */
function canRestore(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected || element.closest("[hidden], [inert]")) return false;
  if (element.matches(":disabled")) return false;
  return true;
}

/** Restores focus to `previous` (the element that opened a dialog) or falls back to the page heading. */
export function restoreFocus(previous: HTMLElement | null): void {
  if (canRestore(previous)) {
    previous.focus();
    if (document.activeElement === previous) return;
  }
  focusPageHeading();
}

/** After an action removed the focused element (e.g. a deleted row), move focus to the page heading. */
export function recoverLostFocus(): void {
  const active = document.activeElement;
  if (!active || active === document.body || !active.isConnected) focusPageHeading();
}
