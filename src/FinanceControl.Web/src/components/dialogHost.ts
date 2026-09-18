/** Attribute of the single element in `document.body` that holds every open dialog (MEL-18). */
const DIALOG_HOST_ATTRIBUTE = "data-dialog-host";

/** The dialog portal host: created on first use, re-attached to `document.body` when it was removed. */
export function dialogHost(): HTMLElement {
  let host = document.querySelector<HTMLElement>(`[${DIALOG_HOST_ATTRIBUTE}]`);
  if (!host) {
    host = document.createElement("div");
    host.setAttribute(DIALOG_HOST_ATTRIBUTE, "");
  }
  if (!host.isConnected || host.parentElement !== document.body) document.body.appendChild(host);
  return host;
}

/**
 * Elements to make inert while `modal` is open: every child of `#root` (or, without it, every other child of `body`)
 * plus the dialogs opened before this one, so nested dialogs keep only the top one interactive.
 */
export function dialogBackground(modal: HTMLElement | null): HTMLElement[] {
  const host = dialogHost();
  const root = document.getElementById("root");
  const page = Array.from((root ?? document.body).children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== host && element.tagName !== "SCRIPT");
  const dialogs = Array.from(host.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== modal);
  return [...page, ...dialogs];
}
