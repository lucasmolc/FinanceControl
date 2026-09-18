import { forwardRef, useId, type ReactNode } from "react";
import { currencyOf } from "../../../lib/currencies";
import { cx } from "../shared/cx";

export interface CurrencyIconProps {
  /** Currency code (BRL, USD, EUR, GBP, JPY, CHF, CAD, AUD, ARS, BTC, ETH, SOL, USDT; others get a neutral badge). */
  code: string;
  /** Pixel size (default 20; legible from 16). */
  size?: number;
  /** Accessible name (defaults to the pt-BR currency name). */
  title?: string;
  /** Hide from assistive tech when the code/name is shown next to the icon. */
  decorative?: boolean;
  className?: string;
}

/** Fallback colors (the theme may override with --currency-<code> / --currency-<code>-fg). Glyph/background pairs are AA. */
const COLORS: Record<string, [string, string]> = {
  brl: ["#1b7a43", "#ffffff"],
  usd: ["#1e6b4a", "#ffffff"],
  eur: ["#1f47a8", "#ffd84d"],
  gbp: ["#012169", "#ffffff"],
  jpy: ["#b0002a", "#ffffff"],
  chf: ["#c8261b", "#ffffff"],
  cad: ["#b3122d", "#ffffff"],
  aud: ["#00247d", "#ffffff"],
  ars: ["#6cace4", "#ffffff"],
  btc: ["#f7931a", "#1a1206"],
  eth: ["#4a5fc1", "#ffffff"],
  sol: ["#14112b", "#ffffff"],
  usdt: ["#167a5c", "#ffffff"],
};

const bg = (code: string) => `var(--currency-${code}, ${COLORS[code]?.[0] ?? "var(--panel-3)"})`;
const fg = (code: string) => `var(--on-currency-${code}, ${COLORS[code]?.[1] ?? "var(--text)"})`;

function symbol(code: string, text: string, fontSize = 17): ReactNode {
  return <text x="16" y="16.8" textAnchor="middle" dominantBaseline="central" style={{ fill: fg(code) }} fontSize={fontSize} fontWeight={800} className="ui-currency-glyph">{text}</text>;
}

/** Hand-made glyphs (no external assets). Fiat: stylized flag or symbol; crypto: symbol. */
function glyph(code: string, gradientId: string): ReactNode {
  switch (code) {
    case "brl":
      return <>
        <path d="M16 6.5 27 16 16 25.5 5 16Z" fill="#f7d417" />
        <circle cx="16" cy="16" r="5.6" fill="#1f3f95" />
        <path d="M10.6 15.1c3.4-.9 7.4-.4 10.7 1.4" stroke="#ffffff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </>;
    case "usd": return symbol(code, "$", 19);
    case "eur": return <>
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return <circle key={index} cx={16 + Math.cos(angle) * 11.6} cy={16 + Math.sin(angle) * 11.6} r="0.9" style={{ fill: fg(code) }} opacity="0.85" />;
      })}
      {symbol(code, "€", 15)}
    </>;
    case "gbp": return symbol(code, "£", 18);
    case "jpy": return symbol(code, "¥", 18);
    case "chf":
      return <>
        <rect x="13.3" y="8" width="5.4" height="16" rx="0.6" style={{ fill: fg(code) }} />
        <rect x="8" y="13.3" width="16" height="5.4" rx="0.6" style={{ fill: fg(code) }} />
      </>;
    case "cad": return symbol(code, "C$", 12.5);
    case "aud": return symbol(code, "A$", 12.5);
    case "ars":
      return <>
        <rect x="0" y="11" width="32" height="10" fill="#ffffff" />
        <circle cx="16" cy="16" r="3.2" fill="#f6b40e" stroke="#85340a" strokeWidth="0.6" />
      </>;
    case "btc":
      return <g transform="rotate(14 16 16)">
        <rect x="13.2" y="6.4" width="1.8" height="3.4" rx="0.5" style={{ fill: fg(code) }} />
        <rect x="16.6" y="6.4" width="1.8" height="3.4" rx="0.5" style={{ fill: fg(code) }} />
        <rect x="13.2" y="22.2" width="1.8" height="3.4" rx="0.5" style={{ fill: fg(code) }} />
        <rect x="16.6" y="22.2" width="1.8" height="3.4" rx="0.5" style={{ fill: fg(code) }} />
        {symbol(code, "B", 17)}
      </g>;
    case "eth":
      return <>
        <path d="M16 5.5 23 16.4 16 20.4 9 16.4Z" style={{ fill: fg(code) }} />
        <path d="M16 21.9 23 17.9 16 26.5 9 17.9Z" style={{ fill: fg(code) }} opacity="0.85" />
        <path d="M16 5.5 16 20.4 9 16.4Z" fill="#000000" opacity="0.12" />
      </>;
    case "sol":
      return <>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#9945ff" />
            <stop offset="1" stopColor="#19fb9b" />
          </linearGradient>
        </defs>
        <path d="M10.6 9.5h13.2l-2.4 2.9H8.2Z" fill={`url(#${gradientId})`} />
        <path d="M8.2 14.6h13.2l2.4 2.9H10.6Z" fill={`url(#${gradientId})`} />
        <path d="M10.6 19.7h13.2l-2.4 2.9H8.2Z" fill={`url(#${gradientId})`} />
      </>;
    case "usdt":
      return <>
        <rect x="9" y="8.5" width="14" height="3.3" rx="0.6" style={{ fill: fg(code) }} />
        <rect x="14.2" y="8.5" width="3.6" height="15.5" rx="0.6" style={{ fill: fg(code) }} />
        <ellipse cx="16" cy="15.4" rx="7.6" ry="2.2" fill="none" style={{ stroke: fg(code) }} strokeWidth="1.3" />
      </>;
    default:
      return null;
  }
}

/**
 * Currency badge (MEL-36): hand-made inline SVG per catalog code (circle in the currency color + flag/symbol).
 * Unknown codes show their first letters on a neutral badge. Labelled with the pt-BR name (role="img") unless decorative.
 */
export const CurrencyIcon = forwardRef<HTMLSpanElement, CurrencyIconProps>(function CurrencyIcon({ code, size = 20, title, decorative = false, className }, ref) {
  const info = currencyOf(code);
  const key = info.code.toLowerCase();
  const gradientId = useId().replace(/:/g, "");
  const known = key in COLORS;
  const content = known ? glyph(key, `${gradientId}-g`) : symbol(key, info.code.slice(0, 3), info.code.length > 2 ? 9.5 : 12);
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": title ?? info.name };
  return <span ref={ref} className={cx("ui-currency-icon", !known && "is-unknown", className)} data-currency={info.code} style={{ width: size, height: size }} {...a11y}>
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <clipPath id={`${gradientId}-c`}><circle cx="16" cy="16" r="16" /></clipPath>
      <g clipPath={`url(#${gradientId}-c)`}>
        <circle cx="16" cy="16" r="16" style={{ fill: bg(key) }} />
        {content}
      </g>
      <circle cx="16" cy="16" r="15.5" fill="none" style={{ stroke: "var(--currency-ring, rgba(255, 255, 255, 0.14))" }} strokeWidth="1" />
    </svg>
  </span>;
});
