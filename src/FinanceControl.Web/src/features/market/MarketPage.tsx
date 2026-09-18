import { useContext, useId, useState, type FormEvent } from "react";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, ChevronDown, Minus, Pencil, RefreshCw, ShieldCheck, Undo2 } from "lucide-react";
import { errorMessage, isConnectivityError } from "../../api/client";
import { insightsApi, OFFLINE_REASON, type MarketData, type MarketIndicator } from "../../api/insights";
import { Dialog } from "../../components/Dialog";
import { Badge, EmptyState, Field, MoneyInput, Skeleton } from "../../components/ui";
import { CurrencyIcon } from "../../components/ui/CurrencyIcon";
import { Select } from "../../components/ui/Select";
import { ToastContext, type ToastTone } from "../../components/toastContext";
import { invalidateMarketRates } from "../../hooks/useMarketRates";
import { currencyGroups, currencyOf } from "../../lib/currencies";
import { formatDate, todayISO } from "../../lib/date";
import { formatMoney, formatRate, parseMoney, parseRate } from "../../lib/money";
import type { PageProps } from "../../types";
import { convertMinor, formatChange, formatDateTime, formatIndicator, formatUnitRate, heldCurrencies, indicatorUnit, ratesMap, REFERENCE_CURRENCIES, referenceDate, sourceLabel, sourcesText, splitRates, unitRate, type RateRow } from "./marketModel";
import { useReconnect } from "../plan/useReconnect";
import { useMarket } from "./useMarket";

const INDICATOR_ORDER = ["selic", "cdi", "ipca_12m", "ipca_month"];

function IndicatorItem({ indicator, today }: { indicator: MarketIndicator; today: string }) {
  // CR-23: never show a future reference date; fall back to when the value was fetched.
  const reference = referenceDate(indicator.reference_date, today);
  return <div className="indicator" role="listitem">
    <span className="indicator-label">{indicator.label}</span>
    <p className="indicator-value">{formatIndicator(indicator.value, indicator.code === "selic" || indicator.code === "cdi" ? indicator.unit : indicatorUnit(indicator.label, indicator.unit))}</p>
    <small className="market-updated">{sourceLabel(indicator.source)} · {reference ? `vigente em ${formatDate(reference)}` : `consultado em ${formatDate(indicator.fetched_at.slice(0, 10))}`}{indicator.stale && <> <Badge tone="warning">Desatualizado</Badge></>}</small>
  </div>;
}

function RateCard({ row: { info, rate }, busy, onManual, onClear }: { row: RateRow; busy: boolean | string; onManual: (code: string) => void; onClear: (code: string) => void }) {
  // `busy` as a string is the reason the actions are unavailable (offline).
  const reason = typeof busy === "string" ? busy : undefined;
  const change = rate && !rate.manual ? rate.change_pct : null;
  return <article className={`card market-card${rate?.stale && !rate.manual ? " is-stale" : ""}`} aria-label={info.name}>
    <div className="market-card-head">
      <CurrencyIcon code={info.code} size={32} decorative />
      <div className="market-name"><b>{info.name}</b><small className="muted">{info.kind === "crypto" ? "Cripto" : "Moeda"} · 1 {info.code} em reais</small></div>
    </div>
    <p className="market-price">{rate ? formatUnitRate(rate.rate_brl) : <span className="muted">Sem cotação</span>}</p>
    {change !== null && change !== undefined && <ChangeChip pct={change} />}
    {/* CR-23: source and date live once in the page status; a card only speaks up when it differs (manual, stale, missing). */}
    {(!rate || rate.manual || rate.stale) && <small className="market-updated">
      {!rate ? "Atualize para buscar a cotação." : rate.manual ? <><Badge tone="accent">Manual</Badge> · desde {formatDateTime(rate.fetched_at)}</> : <><Badge tone="warning">Desatualizada</Badge> · {formatDateTime(rate.fetched_at)}</>}
    </small>}
    {/* R1-MKT-4: a visible label instead of a lone pencil in the corner. */}
    <div className="card-actions">
      <button type="button" className="btn small ghost" aria-label={`Definir cotação manual de ${info.name}`} title={reason} disabled={Boolean(busy)} onClick={() => onManual(info.code)}><Pencil size={14} aria-hidden="true" />{rate?.manual ? "Alterar" : "Cotação manual"}</button>
      {rate?.manual && <button type="button" className="btn small ghost" aria-label={`Voltar ${info.name} para a cotação automática`} title={reason} disabled={Boolean(busy)} onClick={() => onClear(info.code)}><Undo2 size={14} aria-hidden="true" />Automática</button>}
    </div>
  </article>;
}

function ChangeChip({ pct }: { pct: number }) {
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  return <span className={`market-change has-icon ${direction}`}>
    <Icon size={14} aria-hidden="true" />{formatChange(pct)} <span className="sr-only">em 24 horas</span>
  </span>;
}

function RatesGrid({ title, note, rows, busyCode, onManual, onClear, level = 2, lockedReason }: { title: string; note?: string; rows: RateRow[]; busyCode: string | null; onManual: (code: string) => void; onClear: (code: string) => void; level?: 2 | 3; lockedReason?: string }) {
  const titleId = useId();
  const Heading = level === 2 ? "h2" : "h3";
  if (!rows.length) return null;
  return <section className="stack market-rate-group" aria-labelledby={titleId}>
    <div><Heading id={titleId} className="section-title">{title}</Heading>{note && <p className="muted">{note}</p>}</div>
    <div className="market-grid">
      {rows.map(row => <RateCard key={row.info.code} row={row} busy={lockedReason ?? busyCode === row.info.code} onManual={onManual} onClear={onClear} />)}
    </div>
  </section>;
}

const CURRENCY_OPTIONS = currencyGroups().map(group => ({
  label: group.label,
  options: group.options.map(([code, label]) => ({ value: code, label, icon: <CurrencyIcon code={code} size={18} decorative /> })),
}));

function CurrencySelect({ id, value, onChange, ...aria }: { id?: string; value: string; onChange: (code: string) => void; "aria-describedby"?: string; "aria-invalid"?: boolean }) {
  return <Select id={id} value={value} onChange={onChange} options={CURRENCY_OPTIONS} {...aria} />;
}

function Converter({ market, initialFrom = "USD" }: { market: MarketData; initialFrom?: string }) {
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState("BRL");
  const rates = ratesMap(market);
  const fromInfo = currencyOf(from);
  const parsed = parseMoney(amount, fromInfo.decimals);
  const result = parsed === null ? null : convertMinor(parsed, from, to, rates);
  const unit = unitRate(from, to, rates);
  const invalid = amount.trim() !== "" && parsed === null;
  const missing = parsed !== null && result === null;
  return <section className="card converter" aria-labelledby="converter-title">
    <h2 id="converter-title" className="section-title">Conversor</h2>
    <Field label="Valor" error={invalid ? `Informe um valor válido em ${fromInfo.code}, por exemplo 1.234,56.` : undefined}>
      <MoneyInput currency={from} value={amount} onChange={setAmount} />
    </Field>
    <div className="converter-grid">
      <Field label="De"><CurrencySelect value={from} onChange={setFrom} /></Field>
      <button type="button" className="icon-btn converter-swap" aria-label="Inverter moedas" onClick={() => { setFrom(to); setTo(from); }}><ArrowLeftRight size={18} aria-hidden="true" /></button>
      <Field label="Para"><CurrencySelect value={to} onChange={setTo} /></Field>
    </div>
    <output className="converter-result" aria-live="polite">
      {result !== null && parsed !== null
        ? <><span className="muted">{formatMoney(parsed, from)} =</span> <b>{formatMoney(result, to)}</b></>
        : missing ? <span className="muted">Sem cotação para esta conversão. Atualize as cotações ou defina uma cotação manual.</span>
          : <span className="muted">Digite um valor para converter.</span>}
    </output>
    {unit !== null && from !== to && <p className="muted converter-unit">1 {fromInfo.code} = {formatUnitRate(unit, currencyOf(to).symbol)}</p>}
  </section>;
}

function ManualRateDialog({ code, current, onClose, onSaved }: { code: string; current: string | null; onClose: () => void; onSaved: (message: string) => void }) {
  const info = currencyOf(code);
  const [text, setText] = useState(current ? formatRate(current) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const rate = parseRate(text);
    if (!rate) { setError("Informe uma cotação maior que zero, por exemplo 5,1234."); return; }
    setBusy(true);
    try {
      await insightsApi.setManualRate(code, rate);
      invalidateMarketRates();
      onSaved(`Cotação manual de ${info.code} salva: ${formatUnitRate(rate)}.`);
    } catch (reason) {
      setError(errorMessage(reason, "Não foi possível salvar a cotação."));
      setBusy(false);
    }
  };
  return <Dialog title={`Cotação manual · ${info.name}`} onClose={onClose} busy={busy}
    footer={<>
      <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
      <button type="submit" form="manual-rate-form" className="btn primary" disabled={busy}>{busy ? "Salvando…" : "Salvar cotação"}</button>
    </>}>
    <form id="manual-rate-form" onSubmit={submit} noValidate>
      <Field label={`Quanto vale 1 ${info.code} em reais`} error={error ?? undefined} hint="A cotação manual não é substituída pelas atualizações automáticas até você voltar ao automático.">
        <input type="text" inputMode="decimal" autoComplete="off" value={text} onChange={event => { setText(event.target.value); setError(null); }} placeholder="5,1234" />
      </Field>
    </form>
  </Dialog>;
}

export function MarketPage({ state, version, notify, offline = false }: PageProps) {
  const { data, loading, error, fromCache, reload, replace } = useMarket(version);
  useReconnect(offline, reload);
  const toastApi = useContext(ToastContext);
  const [refreshing, setRefreshing] = useState(false);
  const [manualCode, setManualCode] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const report = (message: string, tone: ToastTone) => { if (toastApi) toastApi.toast({ message, tone }); else notify(message); };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await insightsApi.refreshMarket();
      invalidateMarketRates();
      replace(result);
      if (result.last_error) report(result.last_error, "error");
      else {
        const rates = result.refreshed?.rates ?? result.rates.length;
        const indicators = result.refreshed?.indicators ?? result.indicators.length;
        report(`Cotações atualizadas: ${rates} ${rates === 1 ? "moeda" : "moedas"} e ${indicators} ${indicators === 1 ? "indicador" : "indicadores"}.`, "success");
      }
    } catch (reason) {
      report(errorMessage(reason, "Não foi possível atualizar as cotações agora."), "error");
    } finally {
      setRefreshing(false);
    }
  };
  const clearManual = async (code: string) => {
    setBusyCode(code);
    try {
      await insightsApi.clearManualRate(code);
      invalidateMarketRates();
      await reload();
      report(`${code} volta a usar a cotação automática na próxima atualização.`, "success");
    } catch (reason) {
      report(errorMessage(reason, "Não foi possível remover a cotação manual."), "error");
    } finally {
      setBusyCode(null);
    }
  };

  // Decision 1 (R3-MKT-1): without the local server the global banner is the only notice with a retry.
  const disconnected = offline || isConnectivityError(error);
  if (!data) {
    if (error && disconnected) return <EmptyState icon={RefreshCw} title="As cotações aparecem quando o servidor voltar." description="Sem dados enquanto o servidor estiver fora. A página recarrega sozinha assim que ele responder." />;
    if (error) return <EmptyState icon={RefreshCw} title="Não foi possível carregar as cotações" description={error} actionLabel="Tentar novamente" onAction={() => void reload()} />;
    return <Skeleton label="Carregando cotações…" lines={6} />;
  }

  const held = heldCurrencies(state);
  const split = splitRates(data.rates, held);
  const today = todayISO();
  const sources = sourcesText(data.rates);
  // R3-MKT-3: with fewer than three own currencies the first screen also shows the reference ones (USD, EUR, BTC).
  const references = split.referencesOnly || split.yours.length >= 3 ? [] : REFERENCE_CURRENCIES
    .map(code => [...split.others.fiat, ...split.others.crypto].find(row => row.info.code === code))
    .filter((row): row is RateRow => Boolean(row?.rate));
  const shownReference = new Set(references.map(row => row.info.code));
  const others = { fiat: split.others.fiat.filter(row => !shownReference.has(row.info.code)), crypto: split.others.crypto.filter(row => !shownReference.has(row.info.code)) };
  const othersCount = others.fiat.length + others.crypto.length;
  const indicators = [...data.indicators].sort((left, right) => {
    const a = INDICATOR_ORDER.indexOf(left.code);
    const b = INDICATOR_ORDER.indexOf(right.code);
    return (a < 0 ? 99 : a) - (b < 0 ? 99 : b);
  });
  const manualRate = manualCode ? data.rates.find(rate => rate.currency === manualCode)?.rate_brl ?? null : null;
  const hasAnyRate = data.rates.length > 0;
  // R1-MKT-3 / decision 4: without the local server the saved values stay on screen, read-only.
  const unreachable = offline || fromCache || Boolean(error);
  const lockedReason = unreachable ? OFFLINE_REASON : undefined;

  return <div className="stack market-page">
    {/* R1-MKT-1: the shell shows the page title; one status line carries the date (no second timestamp). */}
    <div className="page-header market-header">
      <div className="market-status">
        <p className="market-updated-line"><b>{data.last_refresh_at ? `Valores de ${formatDateTime(data.last_refresh_at)}` : "Ainda não houve atualização"}</b>{sources && <span className="muted"> · fontes: {sources}</span>}</p>
        <p className="row">
          <Badge tone={data.auto_refresh ? "positive" : "neutral"}>{data.auto_refresh ? "Atualização automática ligada" : "Atualização automática desligada"}</Badge>
          <span className="muted">{data.auto_refresh ? "a cada 6 horas" : <>Ative em <a href="#/configuracoes">Configurações</a>.</>}</span>
          {loading && <span className="muted" role="status">Carregando…</span>}
        </p>
      </div>
      <div className="page-header-actions">
        {/* R2-MKT-3: a normal-width secondary action next to the status (automatic refresh is the default path). */}
        <button type="button" className="btn market-refresh" onClick={() => void refresh()} disabled={refreshing || unreachable} title={lockedReason} aria-busy={refreshing || undefined}>
          <RefreshCw size={15} aria-hidden="true" className={refreshing ? "spin" : undefined} />{refreshing ? "Atualizando…" : "Atualizar agora"}
        </button>
      </div>
    </div>
    {/* R3-MKT-1: offline, one quiet line (the global banner already says it and has "Tentar agora"). */}
    {unreachable && (disconnected || fromCache
      ? <p className="muted market-saved-note" role="note">{data.last_refresh_at ? `Mostrando os valores salvos de ${formatDateTime(data.last_refresh_at)}.` : "Mostrando os últimos valores salvos."}</p>
      : <p className="form-error" role="alert">{error} <button type="button" className="btn small ghost" onClick={() => void reload()}>Tentar novamente</button></p>)}
    {data.last_error && !unreachable && <p className="form-error" role="alert">{data.last_error}</p>}

    {!hasAnyRate && <EmptyState icon={RefreshCw} title="Nenhuma cotação salva" description="Busque as cotações agora ou defina uma cotação manual para usar outras moedas." actionLabel={unreachable ? undefined : "Atualizar agora"} onAction={() => void refresh()} compact />}
    <RatesGrid title="Suas moedas" note={split.referencesOnly ? "Você ainda não usa outra moeda em contas, assinaturas, investimentos ou metas; estas são as referências mais usadas." : "Moedas usadas nas suas contas, contas a pagar, assinaturas, investimentos e metas."}
      rows={split.yours} busyCode={busyCode} onManual={setManualCode} onClear={code => void clearManual(code)} lockedReason={lockedReason} />

    {references.length > 0 && <RatesGrid level={3} title="Referência" rows={references} busyCode={busyCode} onManual={setManualCode} onClear={code => void clearManual(code)} lockedReason={lockedReason} />}

    <section aria-labelledby="indicators-title" className="stack">
      <h2 id="indicators-title" className="section-title">Indicadores</h2>
      {indicators.length
        ? <div className="indicator-grid" role="list">{indicators.map(indicator => <IndicatorItem key={indicator.code} indicator={indicator} today={today} />)}</div>
        : <p className="muted">Nenhum indicador salvo ainda. Use "Atualizar agora" para buscar Selic, CDI e IPCA.</p>}
    </section>

    <Converter market={data} initialFrom={split.yours[0]?.info.code ?? "USD"} />

    {othersCount > 0 && <details className="market-others">
      <summary><ChevronDown size={16} aria-hidden="true" />Outras moedas e cripto <span className="muted">({othersCount})</span></summary>
      <div className="stack">
        <RatesGrid level={3} title="Moedas" rows={others.fiat} busyCode={busyCode} onManual={setManualCode} onClear={code => void clearManual(code)} lockedReason={lockedReason} />
        <RatesGrid level={3} title="Cripto" rows={others.crypto} busyCode={busyCode} onManual={setManualCode} onClear={code => void clearManual(code)} lockedReason={lockedReason} />
      </div>
    </details>}

    <p className="privacy-note muted"><ShieldCheck size={15} aria-hidden="true" /> As cotações vêm de fontes públicas (AwesomeAPI, CoinGecko e Banco Central). O app só pede os preços: nenhum dado seu é enviado. Sem internet, os últimos valores salvos continuam valendo.</p>

    {manualCode && <ManualRateDialog code={manualCode} current={manualRate} onClose={() => setManualCode(null)} onSaved={message => { setManualCode(null); void reload(); report(message, "success"); }} />}
  </div>;
}

