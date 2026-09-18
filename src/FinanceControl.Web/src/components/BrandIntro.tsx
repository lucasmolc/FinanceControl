import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  BRAND_FADE_MS, BRAND_INTRO_MAX_MS, BRAND_LEAVE_MS, BRAND_MEET_MIN_MS, BRAND_SETTLE_DEADLINE_MS, BRAND_SETTLE_MS, settleFlip, type BrandReveal,
} from "../lib/brandMotion";
import { motionAllowed } from "../lib/preferences";
import { getPreferences } from "../lib/preferencesStore";
import { LogoMark } from "./Logo";

/**
 * Brand opening (MEL-48; timings in lib/brandMotion.ts). Fixed overlay over the app on load and after the setup —
 * never on page changes. The shell renders underneath and is revealed as soon as the data is ready:
 * 1. meet — the mark comes in from the left and "LMM Finance" from the right until they meet in the centre; the trend
 *    stroke draws and the coin pops (≥ BRAND_MEET_MIN_MS, then as soon as `ready`);
 * 2. settle — the lockup flies onto the visible shell `.brand-lockup` (FLIP → inline --settle-x/--settle-y/--settle-scale);
 *    skipped (plain fade) when there is no target or the data came after BRAND_SETTLE_DEADLINE_MS;
 * 3. leave — the overlay fades and `onDone` runs.
 * Past BRAND_INTRO_MAX_MS without data it becomes a quiet static loading state ("Carregando…").
 * Skip: Esc, click or tap ends it with the short fade when ready (otherwise the convergence finishes centred and the hint crossfades
 * to "Carregando…" until ready). The hint says "Toque para pular" on coarse pointers. Motion off (prefers-reduced-motion or animations=false): no minimum, only an
 * opacity fade when ready.
 * Contract (styles/motion.css): `.brand-intro[data-phase="meet"|"settle"|"leave"](.is-motion|.is-static)(.is-skipped)
 * (.is-waiting)(.is-fade) > .brand-intro-lockup > .brand-intro-mark + .brand-intro-word(small)` + `.brand-intro-hint`;
 * while it is on screen `<html data-intro-phase="meet|settle|leave">` hides the shell lockup it flies to.
 */

type Phase = "meet" | "settle" | "leave";

export interface BrandIntroProps {
  /** True when the app is ready to be revealed (data settled, page mounted). */
  ready: boolean;
  onDone: () => void;
  /** Name of what is loading, announced as "Carregando <label>…" (defaults to the app name). */
  label?: string;
  /** Override motion detection (tests); default: animations preference and prefers-reduced-motion. */
  motion?: boolean;
  /** Override pointer detection (tests); default: `(pointer: coarse)`. */
  coarsePointer?: boolean;
}

const coarse = (): boolean => {
  try { return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches; }
  catch { return false; }
};

/** Visible `.brand-lockup` of the shell (outside the overlay), if any. */
function findTarget(overlay: HTMLElement | null): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(".brand-lockup"));
  return candidates.find(element => !overlay?.contains(element) && element.getBoundingClientRect().width > 0) ?? null;
}

export function BrandIntro({ ready, onDone, label, motion, coarsePointer }: BrandIntroProps) {
  const [animate] = useState(() => motion ?? motionAllowed(getPreferences()));
  const [touch] = useState(() => coarsePointer ?? coarse());
  const [phase, setPhase] = useState<Phase>("meet");
  const [reveal, setReveal] = useState<BrandReveal>("settle");
  const [minReached, setMinReached] = useState(!animate);
  const [late, setLate] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [flip, setFlip] = useState<CSSProperties | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const lockupRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  // Clock of the choreography (motion only): earliest reveal, flight deadline, ceiling.
  useEffect(() => {
    if (!animate) return;
    const timers = [
      window.setTimeout(() => setMinReached(true), BRAND_MEET_MIN_MS),
      window.setTimeout(() => setLate(true), BRAND_SETTLE_DEADLINE_MS),
      window.setTimeout(() => setOverdue(true), BRAND_INTRO_MAX_MS),
    ];
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [animate]);

  // Ready (and past the minimum): fly onto the shell brand when it fits, otherwise fade.
  useLayoutEffect(() => {
    if (skipped || phase !== "meet" || !minReached || !ready) return;
    const target = animate && !late ? findTarget(overlayRef.current) : null;
    const lockup = lockupRef.current;
    const mark = lockup?.querySelector(".brand-intro-mark .logo-mark")?.getBoundingClientRect();
    const targetMark = target?.querySelector(".logo-mark")?.getBoundingClientRect() ?? target?.getBoundingClientRect();
    const values = lockup && mark && targetMark ? settleFlip(lockup.getBoundingClientRect(), mark, targetMark) : null;
    if (values) {
      setFlip(values);
      setReveal("settle");
      setPhase("settle");
    } else {
      setReveal("fade");
      setPhase("leave");
    }
  }, [animate, late, skipped, phase, minReached, ready]);

  useEffect(() => {
    if (phase === "settle") {
      const timer = window.setTimeout(() => setPhase("leave"), BRAND_SETTLE_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase === "leave") {
      const timer = window.setTimeout(finish, reveal === "settle" ? BRAND_LEAVE_MS : BRAND_FADE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [phase, reveal, finish]);

  // Skipped while loading: reveal as soon as the app is ready.
  useEffect(() => { if (skipped && ready) finish(); }, [skipped, ready, finish]);

  // R2-BR-2: a skip once the app is ready still leaves with the short fade (BRAND_FADE_MS), never a one-frame cut.
  const skip = useCallback(() => {
    if (doneRef.current) return;
    if (ready) {
      setFlip(null);
      setReveal("fade");
      setPhase("leave");
      return;
    }
    setFlip(null);
    setSkipped(true);
  }, [ready]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      skip();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [skip]);

  // The shell lockup the intro flies to stays hidden until the overlay leaves (no doubled wordmark, CR-29).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.introPhase = phase;
    return () => { delete root.dataset.introPhase; };
  }, [phase]);

  const waiting = skipped || (overdue && !ready);
  // A skip while loading lets the convergence finish centred (no snap, R1-BR-4); only the hint changes.
  const moving = animate && !overdue;
  const classes = ["brand-intro", moving ? "is-motion" : "is-static", skipped ? "is-skipped" : "", waiting ? "is-waiting" : "", reveal === "fade" ? "is-fade" : ""]
    .filter(Boolean).join(" ");
  const dataPhase = skipped ? "meet" : phase === "settle" && !moving ? "meet" : phase;
  const name = label ?? "LMM Finance Control";

  return <div ref={overlayRef} className={classes} data-phase={dataPhase} role="status" aria-live="polite" data-brand-intro="" onClick={skip}>
    <span className="sr-only">Carregando {name}…</span>
    <div ref={lockupRef} className="brand-intro-lockup" aria-hidden="true" style={moving && flip ? flip : undefined}>
      <span className="brand-intro-mark"><LogoMark size={64} /></span>
      <span className="brand-intro-word">LMM Finance<small>Controle pessoal</small></span>
    </div>
    {/* Both hints share one area and crossfade (.is-waiting), so the text never jumps (R1-BR-4). */}
    <span className="brand-intro-hint" aria-hidden="true">
      <span className="hint-skip">{touch ? "Toque para pular" : "Esc para pular"}</span>
      <span className="hint-waiting">Carregando…</span>
    </span>
  </div>;
}
