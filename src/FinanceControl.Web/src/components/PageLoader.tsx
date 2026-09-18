import { useEffect, useState } from "react";
import { PAGE_LOADER_DELAY_MS } from "../lib/brandMotion";
import { LogoMark } from "./Logo";

/**
 * Suspense fallback of a lazy page (MEL-48). Shows nothing for the first PAGE_LOADER_DELAY_MS — a page chunk that
 * arrives quickly never flashes a loader — and then a small brand mini-loader (the trend of the mark drawing in a loop,
 * static with reduced motion) with "Carregando <página>…". The sidebar and the dock stay usable meanwhile.
 * R1-BR-5: the live region is mounted empty from the start and only its text changes, so screen readers announce it.
 * QA hook (dev builds only): `?slow-chunks` in the URL delays every page chunk so this state can be reviewed.
 * Markup: `.page-loader[role=status][aria-live=polite](.is-visible) > .logo-mark + span`.
 */
export function PageLoader({ label, delay = PAGE_LOADER_DELAY_MS }: { label: string; delay?: number }) {
  const [visible, setVisible] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) return;
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  return <div className={visible ? "page-loader is-visible" : "page-loader"} role="status" aria-live="polite">
    {visible && <><LogoMark size={40} /><span>Carregando {label.toLowerCase()}…</span></>}
  </div>;
}
