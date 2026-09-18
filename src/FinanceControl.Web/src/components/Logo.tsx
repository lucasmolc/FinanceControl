import { useId } from "react";

/**
 * LMM Finance mark v2: a ledger axis (the "L") and a rising trend that ends in a coin, in night ink on an
 * emerald→gold tile. At 20px or less it switches to the heavier-stroke geometry of public/favicon.svg (no coin) so it
 * stays legible. Paths carry pathLength=1 and the classes `logo-axis` / `logo-trend` / `logo-coin` so the brand intro
 * can draw them (styles/motion.css). Decorative by default (aria-hidden); pass `title` to expose it as an image.
 */
export function LogoMark({ size = 30, title, className }: { size?: number; title?: string; className?: string }) {
  const gradientId = `lmm-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const compact = size <= 20;
  return <svg className={className ? `logo-mark ${className}` : "logo-mark"} width={size} height={size} viewBox="0 0 32 32" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
    <defs>
      <linearGradient id={gradientId} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#1fcf8e" />
        <stop offset="0.55" stopColor="#7fd07a" />
        <stop offset="1" stopColor="#ecc55e" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx={compact ? 8 : 9} fill={`url(#${gradientId})`} />
    {compact
      ? <>
        <path className="logo-axis" pathLength={1} d="M8.5 7.5v16h15.5" fill="none" stroke="#05130d" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        <path className="logo-trend" pathLength={1} d="M13 19l4.5-4.5 3 3 5-5.5" fill="none" stroke="#05130d" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </>
      : <>
        <path className="logo-axis" pathLength={1} d="M9.5 8v15.5H24" fill="none" stroke="#05130d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path className="logo-trend" pathLength={1} d="M13.5 18.5l4-4 2.75 2.75L22.8 14.7" fill="none" stroke="#05130d" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="logo-coin" cx="25.6" cy="10.6" r="2.1" fill="#05130d" />
      </>}
  </svg>;
}

/** Brand lockup used in the sidebar (and the phone topbar): mark + "LMM Finance" / "Controle pessoal". */
export function Logo({ size = 30 }: { size?: number }) {
  return <span className="brand-lockup"><LogoMark size={size} /><span className="brand-name">LMM Finance<small>Controle pessoal</small></span></span>;
}
