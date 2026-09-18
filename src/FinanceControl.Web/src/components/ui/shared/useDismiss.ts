import { useEffect, useRef, type RefObject } from "react";

/**
 * Calls `onDismiss` on pointerdown outside every element in `refs` and (when `escape`) on Escape.
 * Escape is handled in the capture phase and stopped, so an enclosing Dialog does not close too.
 */
export function useDismiss(open: boolean, refs: Array<RefObject<HTMLElement | null>>, onDismiss: (reason: "outside" | "escape") => void, escape = true): void {
  const latest = useRef({ refs, onDismiss });
  latest.current = { refs, onDismiss };

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (latest.current.refs.some(ref => ref.current?.contains(target))) return;
      latest.current.onDismiss("outside");
    };
    const handleKey = (event: KeyboardEvent) => {
      if (!escape || event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      latest.current.onDismiss("escape");
    };
    document.addEventListener("pointerdown", handlePointer, true);
    document.addEventListener("mousedown", handlePointer, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointer, true);
      document.removeEventListener("mousedown", handlePointer, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [open, escape]);
}
