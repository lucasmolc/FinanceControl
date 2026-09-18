import { useEffect, useRef } from "react";

/** Calls `onTrigger` on Ctrl+K / Cmd+K (anywhere, also inside inputs); prevents the browser's default. */
export function useCommandPaletteHotkey(onTrigger: () => void, enabled = true): void {
  const latest = useRef(onTrigger);
  latest.current = onTrigger;
  useEffect(() => {
    if (!enabled) return;
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        latest.current();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [enabled]);
}
