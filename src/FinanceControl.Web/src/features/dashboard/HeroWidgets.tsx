import { useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CandlestickChart, Minus } from "lucide-react";
import type { MarketRate, ReportNetWorth } from "../../api/insights";
import { seriesColor, Sparkline } from "../../components/charts";
import { EmptyState, Money } from "../../components/ui";
import { CurrencyIcon } from "../../components/ui/CurrencyIcon";
import { KpiDelta } from "../../components/ui/Stat";
import { useCountUp } from "../../hooks/useCountUp";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { currencyOf } from "../../lib/currencies";
import { formatMonthLabel } from "../../lib/date";
import { formatChange, formatUnitRate } from "../market/marketModel";
import type { ChartWidgetState } from "./ChartWidgets";
import { changeRatio, type ForeignHolding } from "./dashboardModel";
import { WidgetEditControls, WidgetFrame } from "./WidgetFrame";
import { dragProps } from "./widgetDrag";

export interface HeroWidgetProps {
  label: string;
  /** BRL cents (live for the current month, the month snapshot otherwise); null when unknown. */
  total: number | null;
  bank: number;
  investments: number;
  reserveTarget: number;
  previous: ReportNetWorth | null;
  history: ReportNetWorth[];
  missing: string[];
  /** Month of the figures ("agosto de 2026"): names the missing snapshot when `total` is null (R1-PAINEL-7). */
  monthLabel?: string;
  state: ChartWidgetState;
}

/** saldo — patrimônio in BRL with count-up, delta vs the previous snapshot and the net-worth sparkline. */
export function HeroWidget({ label, total, bank, investments, reserveTarget, previous, history, missing, monthLabel, state }: HeroWidgetProps) {
  const fmt = useMoneyFormat();
  // CR-29: mounted under the brand opening means no count-up from zero (it would still be running after a skip and
  // show a wrong value); later changes (month switch, refresh) still count from the value on screen.
  const [underIntro] = useState(() => typeof document !== "undefined" && document.documentElement.dataset.introPhase !== undefined);
  const shown = useCountUp(total ?? 0, { duration: 900, from: underIntro ? total ?? 0 : 0 });
  const { editing, switching } = state;
  const classes = ["widget span-full widget-hero", switching ? "is-switching" : "", editing?.dragging === "saldo" ? "is-dragging" : "", editing?.dropTarget === "saldo" && editing.dragging !== "saldo" ? "is-drop-target" : ""].filter(Boolean).join(" ");
  return <div className={classes} data-widget="saldo" {...dragProps("saldo", editing)}>
    <section className="hero-balance" aria-labelledby="hero-label" aria-busy={switching || undefined}>
      <h2 id="hero-label" className="hero-label">{label}</h2>
      <p className={`hero-value count-up${total !== null && total < 0 ? " negative" : ""}`}>{total === null ? "—" : fmt(shown)}</p>
      <div className="hero-meta">
        {total !== null && previous && <span className="hero-delta"><KpiDelta value={changeRatio(total, previous.total_cents)} context={`em relação a ${formatMonthLabel(previous.month)}`} /> <span>desde {formatMonthLabel(previous.month)}</span></span>}
        {total === null
          ? <span className="muted">Sem fotografia do patrimônio{monthLabel ? ` de ${monthLabel}` : ""}: ela é registrada mês a mês a partir do primeiro uso.</span>
          : <><span>Contas <Money cents={bank} /></span><span>Investimentos <Money cents={investments} /></span></>}
        {reserveTarget > 0 && <span>Meta de reserva <Money cents={reserveTarget} /></span>}
        {missing.length > 0 && <span className="muted">Sem cotação para {missing.join(", ")}: fora do total.</span>}
      </div>
      {history.length > 1 && <div className="hero-aside">
        <Sparkline title="Patrimônio por mês" color={seriesColor("net_worth")} values={history.map(item => item.total_cents)} labels={history.map(item => formatMonthLabel(item.month))} height={64} xLabel="Mês" />
      </div>}
      {editing && <div className="hero-actions"><WidgetEditControls id="saldo" title="Patrimônio em destaque" editing={editing} /></div>}
    </section>
  </div>;
}

function Change({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return null;
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  return <span className={`ticker-change ${direction === "flat" ? "" : direction} has-icon`.trim()}><Icon size={13} aria-hidden="true" />{formatChange(pct)}<span className="sr-only"> em 24 horas</span></span>;
}

/** Ticker strip above the widgets (preference `show_market_ticker`): USD, EUR, BTC + the currencies held. */
export function MarketTicker({ details, codes, onOpenMarket }: { details: Record<string, MarketRate>; codes: string[]; onOpenMarket: () => void }) {
  const rows = codes.map(code => details[code]).filter((rate): rate is MarketRate => Boolean(rate));
  if (!rows.length) return null;
  return <nav className="ticker" aria-label="Cotações">
    {rows.map(rate => <a key={rate.currency} className="ticker-item" href="#/mercado" onClick={event => { event.preventDefault(); onOpenMarket(); }}
      aria-label={`${currencyOf(rate.currency).name}: ${formatUnitRate(rate.rate_brl)}`}>
      <CurrencyIcon code={rate.currency} size={18} decorative />
      <span className="ticker-code">{rate.currency}</span>
      <span className="ticker-value">{formatUnitRate(rate.rate_brl)}</span>
      <Change pct={rate.manual ? null : rate.change_pct} />
    </a>)}
  </nav>;
}

/** mercado — reference rates and the person's foreign balances converted to BRL. */
export function MarketWidget({ details, codes, foreign, loading, error, onOpenMarket, state }: { details: Record<string, MarketRate>; codes: string[]; foreign: ForeignHolding[]; loading: boolean; error: string | null; onOpenMarket: () => void; state: ChartWidgetState }) {
  const rows = codes.map(code => ({ code, rate: details[code] ?? null }));
  const any = rows.some(row => row.rate);
  return <WidgetFrame id="mercado" description="Dólar, euro e bitcoin em reais." {...state} loading={state.loading || (loading && !any)}
    footer={<button type="button" className="btn small ghost widget-link" onClick={onOpenMarket}>Ver Mercado<ArrowRight size={14} aria-hidden="true" /></button>}>
    {any ? <>
      <ul className="list market-widget-list" aria-label="Cotações de referência">
        {rows.map(({ code, rate }) => <li className="list-item" key={code}>
          <CurrencyIcon code={code} size={28} />
          <div className="list-main"><b>{code}</b><small className="muted">{currencyOf(code).name}</small></div>
          <div className="list-amount"><span className="num">{rate ? formatUnitRate(rate.rate_brl) : "—"}</span>{rate && <Change pct={rate.manual ? null : rate.change_pct} />}</div>
        </li>)}
      </ul>
      {foreign.length > 0 && <>
        <h3 className="widget-subtitle">Seus valores em outras moedas</h3>
        <ul className="list" aria-label="Saldos em outras moedas">
          {foreign.map(item => <li className="list-item" key={item.currency}>
            <CurrencyIcon code={item.currency} size={24} decorative />
            <div className="list-main"><Money cents={item.native} currency={item.currency} /></div>
            <div className="list-amount">{item.base === null ? <span className="muted">Sem cotação</span> : <>≈ <Money cents={item.base} /></>}</div>
          </li>)}
        </ul>
      </>}
    </> : <EmptyState compact icon={CandlestickChart} title={error ? "Cotações indisponíveis" : "Nenhuma cotação salva"} description={error ?? "Atualize as cotações na página Mercado para acompanhar dólar, euro e bitcoin."} actionLabel="Abrir Mercado" onAction={onOpenMarket} />}
  </WidgetFrame>;
}

