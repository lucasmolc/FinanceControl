import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { motionAllowed } from "../../lib/preferences";
import { getPreferences } from "../../lib/preferencesStore";
import { phoneTargetTop, tourPosition, type TourPosition } from "./tourPosition";
import { availableSteps, findTarget, isPinned, isTouchDevice, stepContent, type TourStep } from "./tourSteps";

/** Height reserved for the mobile dock (matches --dock-clearance without the safe area). */
const DOCK_CLEARANCE = 104;
/** The Painel is ready for the tour once its month summary is on screen (checked every 100 ms, up to 2 s). */
const DASHBOARD_READY = ".tour-summary, .tour-activation";
const READY_TRIES = 20;
const READY_INTERVAL_MS = 100;
const isPhoneLayout = () => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 980px)").matches;

/** Bottom edge of the sticky topbar (phones), so a scrolled target is not hidden under it. */
function stickyTopInset(): number {
  const bar = document.querySelector(".topbar");
  if (!bar) return 0;
  const { position } = window.getComputedStyle(bar);
  return position === "sticky" || position === "fixed" ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
}

/**
 * Non-modal guided tour of the dashboard: only steps whose target is on screen are shown.
 * CR-07: the popover sits above the highlighted target (own layer) and is anchored to it — below, or above when it
 * does not fit (flip), beside tall targets (sidebar), with an arrow; docked at the bottom as the last resort.
 * Focuses the popover on open, Escape skips, and focus returns to where it was when the tour ends.
 * R1-TOUR-2: → (or Enter on the popover) goes forward, ← goes back; the last → concludes.
 */
export function GuidedTour({ run, onDone }: { run: boolean; onDone: () => void }) {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState<TourPosition | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<Element | null>(null);
  const onDoneRef = useRef(onDone);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  // Resolve the steps when the tour starts; restore focus when it ends. The Painel's widgets may still be mounting (lazy
  // page, "Rever tour" from Configurações): wait briefly for the month summary before picking the steps.
  useEffect(() => {
    if (!run) { setSteps(null); setIndex(0); return; }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let timer = 0;
    let tries = 0;
    const resolve = () => {
      if (!document.querySelector(DASHBOARD_READY) && tries < READY_TRIES) { tries += 1; timer = window.setTimeout(resolve, READY_INTERVAL_MS); return; }
      const found = availableSteps(document, isPhoneLayout());
      if (!found.length) { onDoneRef.current(); return; }
      setSteps(found);
      setIndex(0);
    };
    resolve();
    return () => { window.clearTimeout(timer); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [run]);

  const step = steps?.[index];

  // R2-TOUR-1: while the tour runs, the page gets room to scroll past its end (styles: html.tour-running), so a target
  // near the bottom (the plan widget) can still move up far enough for the popover to fit below it on phones.
  useEffect(() => {
    if (!run) return;
    document.documentElement.classList.add("tour-running");
    return () => document.documentElement.classList.remove("tour-running");
  }, [run]);

  const place = useCallback(() => {
    const target = targetRef.current;
    const popover = popoverRef.current;
    if (!target || !popover) return;
    const rect = target.getBoundingClientRect();
    const size = { width: popover.offsetWidth || 400, height: popover.offsetHeight || 220 };
    setPosition(tourPosition({ top: rect.top, left: rect.left, width: rect.width, height: rect.height }, size, { width: window.innerWidth, height: window.innerHeight }, isPhoneLayout() ? DOCK_CLEARANCE : 0));
  }, []);

  useLayoutEffect(() => {
    if (!step) return;
    const element = findTarget(step);
    targetRef.current = element;
    element?.classList.add("tour-highlight");
    const behavior: ScrollBehavior = motionAllowed(getPreferences()) ? "smooth" : "auto";
    if (element && isPinned(element)) {
      // R4-TOUR-1: the dock "+", the search and the sidebar are always on screen; the page stays where it is.
    } else if (element && isPhoneLayout() && typeof window.scrollBy === "function") {
      // R2-TOUR-1: phones scroll the target to where it and the popover both fit above the dock (no overlap).
      const rect = element.getBoundingClientRect();
      const desired = phoneTargetTop(rect.height, popoverRef.current?.offsetHeight || 240, { width: window.innerWidth, height: window.innerHeight }, DOCK_CLEARANCE, stickyTopInset());
      window.scrollBy({ top: rect.top - desired, behavior });
    } else {
      const tall = element ? element.getBoundingClientRect().height > window.innerHeight * 0.55 : false;
      element?.scrollIntoView?.({ behavior, block: tall ? "start" : "center" });
    }
    place();
    popoverRef.current?.focus({ preventScroll: true });
    return () => { element?.classList.remove("tour-highlight"); targetRef.current = null; };
  }, [step, place]);

  // Follow the target while the page scrolls (smooth scroll, manual scroll) or resizes.
  useEffect(() => {
    if (!step) return;
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); };
  }, [step, place]);

  const count = steps?.length ?? 0;
  useEffect(() => {
    if (!step) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Escape") { event.preventDefault(); onDoneRef.current(); return; }
      const target = event.target instanceof HTMLElement ? event.target : null;
      // Typing somewhere else on the page (the tour is not modal) keeps its arrows.
      if (target && target.closest("input, textarea, select, [contenteditable='true']")) return;
      const forward = event.key === "ArrowRight" || (event.key === "Enter" && target === popoverRef.current);
      if (forward) {
        event.preventDefault();
        if (index >= count - 1) onDoneRef.current();
        else setIndex(index + 1);
      } else if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        setIndex(index - 1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [step, index, count]);

  if (!run || !steps || !step) return null;
  const last = index === steps.length - 1;
  const touch = isTouchDevice();
  const style: CSSProperties | undefined = position ? { top: position.top, left: position.left, ...(position.arrow !== null ? { [position.placement === "right" || position.placement === "left" ? "--tour-arrow-y" : "--tour-arrow-x"]: `${position.arrow}px` } : {}) } as CSSProperties : undefined;

  return <>
    <div className="tour-layer" aria-hidden="true" />
    <div ref={popoverRef} className="tour-popover" data-placement={position?.placement ?? "docked"} style={style} role="dialog" aria-labelledby={titleId} aria-describedby={bodyId} tabIndex={-1}>
      {position && position.arrow !== null && <span className="tour-arrow" aria-hidden="true" />}
      <h2 id={titleId}>{step.title}</h2>
      <small className="muted">Etapa {index + 1} de {steps.length}{!touch && <span className="tour-keys" aria-hidden="true"> · ← e → navegam, Enter {last ? "conclui" : "avança"}</span>}</small>
      <p id={bodyId}>{stepContent(step, touch)}</p>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => onDoneRef.current()}>Pular tour</button>
        <div className="row">
          {index > 0 && <button type="button" className="btn" onClick={() => setIndex(value => value - 1)}>Voltar</button>}
          {last
            ? <button type="button" className="btn primary" onClick={() => onDoneRef.current()}>Concluir</button>
            : <button type="button" className="btn primary" onClick={() => setIndex(value => value + 1)}>Próximo</button>}
        </div>
      </div>
    </div>
  </>;
}
