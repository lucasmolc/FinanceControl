import { useState } from "react";
import { api } from "../../api/client";
import { useAsyncList } from "../../hooks/useAsyncList";
import { ArrowRightLeft, Building2, History, LayoutGrid, Landmark, List, Pencil, ScrollText, Trash2 } from "lucide-react";
import { Badge, EmptyState, Money, PageHeader, StatStrip } from "../../components/ui";
import { BankLogo } from "../../components/ui/BankLogo";
import { DataTable, type DataTableColumn } from "../../components/ui/DataTable";
import { DropdownMenu, type MenuActionItem } from "../../components/ui/Menu";
import { Segmented } from "../../components/ui/Segmented";
import { useMarketRates } from "../../hooks/useMarketRates";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { useBankStatement, useInvestmentEntries } from "../../hooks/useStatement";
import { currencyOf, isBaseCurrency } from "../../lib/currencies";
import { currentMonth, formatDate, todayISO } from "../../lib/date";
import { accountTypeLabels, countLabel, investmentTypeLabels, labelFor } from "../../lib/labels";
import { toBaseCents, type ExchangeRates } from "../../lib/money";
import { isRemoving } from "../../lib/removing";
import type { MarketRate } from "../../api/insights";
import type { BankAccount, Investment, PageProps } from "../../types";
import { isMonthClosed, MONTH_CLOSED } from "../closing/closingModel";
import { HistoryDialog } from "../history/HistoryDialog";
import { bankStatementRows, investmentEntryRows } from "../history/historyRows";
import { blockedReason, OFFLINE_REASON } from "../records/offline";
import { projectAccounts, unlinkedBillsUntil, unpaidInvoicesUntil, type AccountProjection } from "./accountProjection";
import { AllocationBar } from "./AllocationBar";
import { allocation, type AllocationBy } from "./allocationModel";
import { baseTotal, benchmarkFallback, benchmarkReference, hasForeignCurrency, type BenchmarkReference, missingRatesNote, rateChangeLabel } from "./conversion";
import { readViewPref, writeViewPref } from "./viewPrefs";
import { CurrencyChip, NativeMoney } from "./MoneyParts";
import { useIndicators } from "./useIndicators";
import { formatSignedPercent, investmentResult, toneBySign } from "./wealthMetrics";

/** MEL-44: movements default to today; when the current month is closed they are blocked until it is reopened. */
const movementLock = (summary: PageProps["summary"]): string | undefined =>
  isMonthClosed(summary, currentMonth()) ? `${MONTH_CLOSED}: reabra ${currentMonth().slice(5)}/${currentMonth().slice(0, 4)} para registrar movimentações.` : undefined;

/** Edit/remove in a menu (MEL-42); `before` adds record actions (list view). While removing: "Removendo…". */
function RecordMenu({ label, removing, onEdit, onRemove, before = [] }: { label: string; removing: boolean; onEdit: () => void; onRemove: () => void; before?: MenuActionItem[] }) {
  if (removing) return <div className="row-actions"><span className="removing-status muted" role="status">Removendo…</span></div>;
  return <DropdownMenu label={`Mais ações para ${label}`} items={[
    ...before,
    { label: "Editar", icon: Pencil, onSelect: onEdit },
    { type: "separator" },
    { label: "Remover", icon: Trash2, tone: "danger", onSelect: onRemove },
  ]} />;
}

/** MEL-46: currencies without a rate — the ones the page could not convert plus the ones the server reports. */
function missingCurrencies(clientMissing: string[], state: PageProps["state"], used: Array<{ currency?: string | null }>): string[] {
  const inUse = new Set(used.map(item => currencyOf(item.currency).code));
  return [...new Set([...clientMissing, ...(state.missing_rate_currencies ?? []).filter(code => inUse.has(code))])].sort();
}

/** "Sem cotação" next to a record whose currency has no known rate (MEL-46: it is left out of the totals). */
const NoRateBadge = () => <Badge tone="warning">Sem cotação · fora do total</Badge>;

/** "USD +0,4% hoje" next to foreign balances (MEL-27). */
function RateChange({ currency, details }: { currency: string; details: Record<string, MarketRate> }) {
  const change = details[currency]?.change_pct;
  const label = rateChangeLabel(change);
  if (!label) return null;
  const tone = toneBySign(change ?? 0);
  return <span className={`rate-change${tone === "positive" ? " up" : tone === "negative" ? " down" : " flat"}`}>{currency} {label}</span>;
}

// ── Investimentos ────────────────────────────────────────────────────────────

function resultText(resultCents: number): string {
  return resultCents > 0 ? "de rendimento" : resultCents < 0 ? "de perda" : "sem variação";
}

interface InvestmentCardProps {
  item: Investment; removing: boolean; rates: ExchangeRates; details: Record<string, MarketRate>; reference: BenchmarkReference | null; lockReason?: string; noRate: boolean;
  onMove: () => void; onHistory: () => void; onEdit: () => void; onRemove: () => void;
}

function InvestmentCard({ item, removing, rates, details, reference, lockReason, noRate, onMove, onHistory, onEdit, onRemove }: InvestmentCardProps) {
  const result = investmentResult(item.invested_cents, item.current_cents);
  const currency = currencyOf(item.currency).code;
  return <article className={`card wealth-card${removing ? " is-removing" : ""}`} aria-busy={removing || undefined}>
    <div className="card-header wealth-card-header">
      <BankLogo institution={item.institution} brand={item.brand} logo={item.logo_data} size={40} decorative />
      <div className="wealth-card-title">
        <h3>{item.name}</h3>
        <p className="muted">{item.institution || "Sem instituição"}</p>
      </div>
      <RecordMenu label={item.name} removing={removing} onEdit={onEdit} onRemove={onRemove} />
    </div>
    <p className="tag-row">
      <Badge>{labelFor(investmentTypeLabels, item.type)}</Badge>
      {!isBaseCurrency(currency) && <CurrencyChip code={currency} />}
      {noRate && <NoRateBadge />}
      {/* R2-INV-1: every card names its reference; the yield line below says what it means today. */}
      {item.benchmark && <Badge>Referência: {item.benchmark}</Badge>}
      {item.liquidity && <Badge>Liquidez: {item.liquidity}</Badge>}
    </p>
    <div className="grid two card-values">
      <div><span className="label">Aplicado</span><div className="value compact-value"><NativeMoney cents={item.invested_cents} currency={currency} rates={rates} /></div></div>
      <div><span className="label">Atual</span><div className="value compact-value"><NativeMoney cents={item.current_cents} currency={currency} rates={rates} /></div></div>
    </div>
    <p>Resultado: <b><Money cents={result.resultCents} currency={currency} signed /></b> {resultText(result.resultCents)}{result.returnPercent !== null && <span className="muted"> ({formatSignedPercent(result.returnPercent)})</span>}</p>
    {!isBaseCurrency(currency) && <p className="wealth-rate"><RateChange currency={currency} details={details} /></p>}
    {reference && <p className="investment-benchmark muted" title={reference.hint}>{reference.text}</p>}
    <div className="card-actions">
      {/* R1-INV-3: one quiet action per card (the page keeps a single primary: "Novo investimento"). */}
      <button type="button" className="btn" disabled={removing || Boolean(lockReason)} title={lockReason} onClick={onMove}><ArrowRightLeft size={15} aria-hidden="true" />Movimentar</button>
      <button type="button" className="btn ghost" disabled={removing} onClick={onHistory}><History size={15} aria-hidden="true" />Histórico</button>
    </div>
  </article>;
}

type InvestmentView = "cards" | "list";
const INVESTMENT_VIEWS: readonly InvestmentView[] = ["cards", "list"];
type InvestmentOrder = "value" | "name";
const INVESTMENT_ORDERS: readonly InvestmentOrder[] = ["value", "name"];

/** R1-INV-2: the largest positions first (in BRL; unknown rates last), or A–Z. */
function orderInvestments(items: Investment[], order: InvestmentOrder, rates: ExchangeRates): Investment[] {
  return [...items].sort((left, right) => {
    if (order === "name") return left.name.localeCompare(right.name, "pt-BR");
    const a = toBaseCents(left.current_cents, currencyOf(left.currency).code, rates);
    const b = toBaseCents(right.current_cents, currencyOf(right.currency).code, rates);
    if (a === null || b === null) return a === b ? left.name.localeCompare(right.name, "pt-BR") : a === null ? 1 : -1;
    return b - a || left.name.localeCompare(right.name, "pt-BR");
  });
}
const ALLOCATION_BY: readonly AllocationBy[] = ["type", "liquidity"];

export function InvestmentsPage({ state, version, summary, openModal, openEdit, onRemove, notify, notifyError, refresh, removing, offline }: PageProps) {
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [view, setView] = useState<InvestmentView>(() => readViewPref("lmm.investments.view", INVESTMENT_VIEWS, "cards"));
  const [by, setBy] = useState<AllocationBy>(() => readViewPref("lmm.investments.allocation", ALLOCATION_BY, "type"));
  const [order, setOrder] = useState<InvestmentOrder>(() => readViewPref("lmm.investments.order", INVESTMENT_ORDERS, "value"));
  const history = useInvestmentEntries(historyId, version);
  const historyItem = state.investments.find(item => item.id === historyId) ?? null;
  const add = () => openModal("investment");
  const foreign = hasForeignCurrency(state.investments);
  const { rates, details } = useMarketRates(foreign);
  const indicators = useIndicators(state.investments.some(item => /cdi|selic|ipca/i.test(`${item.benchmark ?? ""} ${item.name}`)));
  const format = useMoneyFormat();
  const invested = baseTotal(state.investments.map(item => ({ minor: item.invested_cents, currency: item.currency })), rates);
  const current = baseTotal(state.investments.map(item => ({ minor: item.current_cents, currency: item.currency })), rates);
  const totals = investmentResult(invested.cents, current.cents);
  const missing = missingCurrencies(current.missing, state, state.investments);
  const note = missingRatesNote(missing);
  const lockReason = blockedReason(offline, movementLock(summary));
  const split = allocation(state.investments, rates, by);
  const investments = orderInvestments(state.investments, order, rates);
  const chooseOrder = (next: string) => { setOrder(next as InvestmentOrder); writeViewPref("lmm.investments.order", next); };
  const chooseView = (next: string) => { setView(next as InvestmentView); writeViewPref("lmm.investments.view", next); };
  const chooseBy = (next: AllocationBy) => { setBy(next); writeViewPref("lmm.investments.allocation", next); };
  const noRate = (item: Investment) => missing.includes(currencyOf(item.currency).code);

  const handlers = (item: Investment) => ({
    onMove: () => openModal("investment-entry", { investment_id: item.id }),
    onHistory: () => setHistoryId(item.id),
    onEdit: () => openEdit("investment", item),
    onRemove: () => onRemove("investments", item.id, item.name),
  });
  const menu = (item: Investment) => {
    const actions = handlers(item);
    return <RecordMenu label={item.name} removing={isRemoving(removing, "investments", item.id)} onEdit={actions.onEdit} onRemove={actions.onRemove}
      before={[{ label: "Movimentar", icon: ArrowRightLeft, onSelect: actions.onMove, disabled: Boolean(lockReason), disabledReason: lockReason }, { label: "Histórico", icon: History, onSelect: actions.onHistory }]} />;
  };
  const resultCell = (item: Investment) => {
    const result = investmentResult(item.invested_cents, item.current_cents);
    return <span className="amount-stack"><Money cents={result.resultCents} currency={currencyOf(item.currency).code} signed />{result.returnPercent !== null && <small className="muted">{formatSignedPercent(result.returnPercent)}</small>}</span>;
  };
  const columns: DataTableColumn<Investment>[] = [
    { id: "name", header: "Investimento", className: "col-name", sortValue: item => item.name, cell: item => <span className="entity-cell">
      <BankLogo institution={item.institution} brand={item.brand} logo={item.logo_data} size={28} decorative />
      <span className="entity-text"><span className="entity-name">{item.name}</span><small className="muted">{item.institution || "Sem instituição"}</small></span>
    </span> },
    { id: "type", header: "Tipo", sortValue: item => labelFor(investmentTypeLabels, item.type), cell: item => <span className="tag-row"><Badge>{labelFor(investmentTypeLabels, item.type)}</Badge>{noRate(item) && <NoRateBadge />}</span> },
    { id: "invested", header: "Aplicado", align: "right", sortValue: item => toBaseCents(item.invested_cents, currencyOf(item.currency).code, rates), cell: item => <NativeMoney cents={item.invested_cents} currency={item.currency} rates={rates} /> },
    { id: "current", header: "Atual", align: "right", sortValue: item => toBaseCents(item.current_cents, currencyOf(item.currency).code, rates), cell: item => <NativeMoney cents={item.current_cents} currency={item.currency} rates={rates} /> },
    { id: "result", header: "Resultado", align: "right", sortValue: item => investmentResult(item.invested_cents, item.current_cents).returnPercent, cell: resultCell },
    { id: "actions", header: "", actions: true, cell: menu },
  ];

  return <>
    <PageHeader title="Carteira de investimentos" description="Quanto foi aplicado, quanto vale hoje e o resultado de cada aplicação." actionLabel="Novo investimento" onAction={add} actionDisabledReason={offline ? OFFLINE_REASON : undefined} />
    {state.investments.length ? <>
      <StatStrip label="Resumo da carteira" items={[
        { label: "Aplicado", value: <Money cents={invested.cents} />, hint: current.converted ? "Em reais, pelas cotações atuais" : undefined },
        { label: "Atual", value: <Money cents={current.cents} />, tone: note ? "warning" : undefined, hint: note ?? undefined },
        { label: "Resultado", value: <Money cents={totals.resultCents} signed tone="neutral" />, tone: totals.tone, hint: resultText(totals.resultCents) },
        { label: "Rentabilidade", value: formatSignedPercent(totals.returnPercent), tone: totals.tone, hint: "Sobre o valor aplicado" },
      ]} />
      <AllocationBar value={split} by={by} onByChange={chooseBy} note={split.missing.length ? missingRatesNote(split.missing) : null} />
      <div className="toolbar wealth-toolbar">
        {state.investments.length > 1 && <Segmented size="sm" aria-label="Ordenar investimentos por" value={order} onChange={chooseOrder}
          options={[{ value: "value", label: "Maior valor" }, { value: "name", label: "A–Z" }]} />}
        <Segmented size="sm" aria-label="Visualizar investimentos como" value={view} onChange={chooseView}
          options={[{ value: "cards", label: "Cartões", icon: LayoutGrid }, { value: "list", label: "Lista", icon: List }]} />
      </div>
      {view === "list"
        ? <DataTable rows={investments} columns={columns} rowKey={item => item.id} caption="Investimentos" rowLabel={item => item.name}
          rowClassName={item => (isRemoving(removing, "investments", item.id) ? "is-removing" : undefined)}
          compact={{
            leading: item => <BankLogo institution={item.institution} brand={item.brand} logo={item.logo_data} size={28} decorative />,
            title: item => item.name,
            meta: item => [labelFor(investmentTypeLabels, item.type), item.institution, noRate(item) ? "sem cotação" : null],
            amount: item => <Money cents={item.current_cents} currency={currencyOf(item.currency).code} />,
            aside: item => {
              const result = investmentResult(item.invested_cents, item.current_cents);
              return result.returnPercent === null ? null : <span className={result.tone ?? undefined}>{formatSignedPercent(result.returnPercent)}</span>;
            },
            actions: menu,
          }} />
        : <div className="grid two">{investments.map(item => <InvestmentCard key={item.id} item={item} removing={isRemoving(removing, "investments", item.id)}
          rates={rates} details={details} reference={benchmarkReference(item.benchmark, indicators, item.name) ?? benchmarkFallback(item.benchmark)} lockReason={lockReason} noRate={noRate(item)} {...handlers(item)} />)}</div>}
    </> : <EmptyState icon={Landmark} title="Nenhum investimento cadastrado" description="Adicione apenas os ativos que deseja acompanhar, como Tesouro, CDB, fundos ou cripto." actionLabel="Novo investimento" onAction={add} />}
    {historyId !== null && <HistoryDialog
      title={`Histórico · ${historyItem?.name ?? "investimento"}`}
      summary={historyItem && <p className="muted">Aplicado <b>{format(historyItem.invested_cents, historyItem.currency)}</b> · Atual <b>{format(historyItem.current_cents, historyItem.currency)}</b></p>}
      rows={investmentEntryRows(historyId, history.items)}
      currency={historyItem?.currency}
      balanceCents={historyItem?.current_cents ?? null} balanceLabel="Valor após"
      loading={history.loading} error={history.error} onRetry={() => void history.reload()}
      total={history.total} hasMore={history.hasMore} loadingMore={history.loadingMore} onLoadMore={() => void history.loadMore()}
      emptyTitle="Nenhuma movimentação registrada"
      emptyDescription="Aportes, resgates, rendimentos e ajustes deste investimento aparecem aqui."
      onClose={() => setHistoryId(null)} refresh={refresh} notify={notify} notifyError={notifyError} />}
  </>;
}

// ── Contas bancárias ─────────────────────────────────────────────────────────

interface AccountCardProps {
  item: BankAccount; removing: boolean; rates: ExchangeRates; details: Record<string, MarketRate>; noRate: boolean; projection?: AccountProjection; lockReason?: string;
  onMove: () => void; onStatement: () => void; onEdit: () => void; onRemove: () => void;
}

/**
 * R1-CONTAS-1 / R2-CONTAS-1: what still leaves the account this month — automatic debits and unpaid bills linked to it,
 * overdue ones included — and the balance after it.
 */
/** R3-CONTAS-1: "3 faturas de cartão (1 vencida) e 3 contas sem conta definida (2 vencidas)". */
function outsideNote(invoices: { count: number; overdue: number }, bills: number, billsOverdue: number): string {
  const overdue = (count: number) => count ? ` (${count} ${count === 1 ? "vencida" : "vencidas"})` : "";
  return [
    invoices.count ? `${countLabel(invoices.count, "fatura de cartão", "faturas de cartão")}${overdue(invoices.overdue)}` : null,
    bills ? `${countLabel(bills, "conta sem conta definida", "contas sem conta definida")}${overdue(billsOverdue)}` : null,
  ].filter(Boolean).join(" e ");
}

function AccountOutlook({ projection, currency }: { projection: AccountProjection; currency: string }) {
  const format = useMoneyFormat();
  if (!projection.debits.length) return null;
  const list = projection.debits.map(debit => `${debit.name} ${debit.overdue ? `vencida em ${formatDate(debit.date).slice(0, 5)}` : formatDate(debit.date).slice(0, 5)} (${format(debit.cents, currency)})`).join(", ");
  return <div className="account-outlook">
    <div className="account-outlook-row"><span className="muted">A sair até o fim do mês</span><b><Money cents={-projection.pendingCents} currency={currency} signed tone="neutral" /></b></div>
    <div className="account-outlook-row"><span className="muted">Saldo projetado</span><b><Money cents={projection.projectedCents} currency={currency} tone={projection.projectedCents < 0 ? "negative" : "neutral"} /></b></div>
    <small className="muted">{list}</small>
  </div>;
}

function AccountCard({ item, removing, rates, details, noRate, projection, lockReason, onMove, onStatement, onEdit, onRemove }: AccountCardProps) {
  const negative = item.current_balance_cents < 0;
  const currency = currencyOf(item.currency).code;
  // MEL-14: the latest movement comes with the state (no request per account).
  const lastMovement = item.last_movement_date;
  return <article className={`card wealth-card${removing ? " is-removing" : ""}`} aria-busy={removing || undefined}>
    <div className="card-header wealth-card-header">
      <BankLogo institution={item.institution} brand={item.brand} logo={item.logo_data} size={40} decorative />
      <div className="wealth-card-title">
        <h3>{item.name}</h3>
        <p className="muted">{item.institution}</p>
      </div>
      <RecordMenu label={`${item.institution} · ${item.name}`} removing={removing} onEdit={onEdit} onRemove={onRemove} />
    </div>
    <p className="tag-row">
      <Badge>{labelFor(accountTypeLabels, item.account_type)}</Badge>
      <CurrencyChip code={currency} />
      {noRate && <NoRateBadge />}
      {negative && <Badge tone="negative">Saldo negativo</Badge>}
    </p>
    <span className="label">Saldo atual</span>
    <div className="value compact-value"><NativeMoney cents={item.current_balance_cents} currency={currency} rates={rates} tone={negative ? "negative" : "neutral"} /></div>
    {!isBaseCurrency(currency) && <p className="wealth-rate"><RateChange currency={currency} details={details} /></p>}
    <p className="muted account-last-move">{lastMovement ? `Última movimentação em ${formatDate(lastMovement)}` : "Sem movimentações registradas"}</p>
    {projection && <AccountOutlook projection={projection} currency={currency} />}
    <div className="card-actions">
      <button type="button" className="btn" disabled={removing || Boolean(lockReason)} title={lockReason} onClick={onMove}><ArrowRightLeft size={15} aria-hidden="true" />Movimentar</button>
      <button type="button" className="btn ghost" disabled={removing} onClick={onStatement}><ScrollText size={15} aria-hidden="true" />Extrato</button>
    </div>
  </article>;
}

type AccountOrder = "balance" | "recent";
const ACCOUNT_ORDERS: readonly AccountOrder[] = ["balance", "recent"];

/** CR-20: the main accounts first — by balance in BRL (unknown rates last) or by the latest movement. */
function orderAccounts(accounts: BankAccount[], order: AccountOrder, rates: ExchangeRates): BankAccount[] {
  const balance = (item: BankAccount) => toBaseCents(item.current_balance_cents, currencyOf(item.currency).code, rates);
  return [...accounts].sort((left, right) => {
    if (order === "recent") return (right.last_movement_date ?? "").localeCompare(left.last_movement_date ?? "") || left.name.localeCompare(right.name, "pt-BR");
    const a = balance(left);
    const b = balance(right);
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return b - a || left.name.localeCompare(right.name, "pt-BR");
  });
}

export function AccountsPage({ state, month, checklist, version, openModal, openEdit, onRemove, notify, notifyError, refresh, removing, offline }: PageProps) {
  const [statementId, setStatementId] = useState<number | null>(null);
  const [order, setOrder] = useState<AccountOrder>(() => readViewPref("lmm.accounts.order", ACCOUNT_ORDERS, "balance"));
  const statement = useBankStatement(statementId, version);
  const statementAccount = state.bank_accounts.find(item => item.id === statementId) ?? null;
  const add = () => openModal("bank-account");
  const { rates, details } = useMarketRates(hasForeignCurrency(state.bank_accounts));
  const format = useMoneyFormat();
  const balance = baseTotal(state.bank_accounts.map(item => ({ minor: item.current_balance_cents, currency: item.currency })), rates);
  const negativeCount = state.bank_accounts.filter(item => item.current_balance_cents < 0).length;
  const missing = missingCurrencies(balance.missing, state, state.bank_accounts);
  const note = missingRatesNote(missing);
  const accounts = orderAccounts(state.bank_accounts, order, rates);
  // R1-CONTAS-1: payments still ahead this month (only while the current month is on screen: the checklist is its own).
  const today = todayISO();
  const current = month === currentMonth();
  const projections = current ? projectAccounts(state.bank_accounts, state.bills, checklist, state.subscriptions, month, today) : new Map<number, AccountProjection>();
  const pendingTotal = baseTotal(state.bank_accounts.map(item => ({ minor: projections.get(item.id)?.pendingCents ?? 0, currency: item.currency })), rates);
  const debitCount = [...projections.values()].reduce((sum, item) => sum + item.debits.length, 0);
  // R2-CONTAS-1: card invoices still to pay (overdue ones too) have no account; they lower only the consolidated projection.
  const invoiceList = useAsyncList(() => api.cardInvoicesDue(month), current && state.cards.length ? `account-invoices:${month}:${version}` : null);
  const invoices = current && invoiceList.loadedKey?.startsWith(`account-invoices:${month}:`) ? unpaidInvoicesUntil(invoiceList.items, month, today) : { count: 0, cents: 0, overdue: 0 };
  // R3-CONTAS-1: bills without an account leave some account too — they lower the consolidated projection like invoices.
  const unlinked = current ? unlinkedBillsUntil(state.bills, state.bank_accounts, checklist, month, today) : [];
  const unlinkedTotal = baseTotal(unlinked.map(bill => ({ minor: bill.amount_cents, currency: bill.currency })), rates);
  // Decision 2: invoices that could not be loaded (offline/failure) are named next to the number, never silently left out.
  const invoicesMissing = current && state.cards.length > 0 && !invoiceList.loadedKey?.startsWith(`account-invoices:${month}:`) && (Boolean(offline) || invoiceList.error !== null);
  const projected = balance.cents - pendingTotal.cents - invoices.cents - unlinkedTotal.cents;
  const paymentCount = debitCount + invoices.count + unlinked.length;
  const outsideAccounts = [invoices.count ? countLabel(invoices.count, "fatura", "faturas") : null, unlinked.length ? countLabel(unlinked.length, "conta sem conta definida", "contas sem conta definida") : null].filter(Boolean).join(" e ");
  const projectedHint = (paymentCount
    ? `Após ${countLabel(paymentCount, "pagamento", "pagamentos")} até o fim do mês${outsideAccounts ? ` (${outsideAccounts})` : ""}`
    : "Nada a pagar até o fim do mês") + (invoicesMissing ? " · sem as faturas de cartão" : "");
  const lockReason = offline ? OFFLINE_REASON : undefined;
  const chooseOrder = (next: string) => { setOrder(next as AccountOrder); writeViewPref("lmm.accounts.order", next); };

  return <>
    <PageHeader title="Saldos por conta" description="Bancos, corretoras e carteiras, em qualquer moeda. Os saldos mudam pelas movimentações e pelos lançamentos vinculados." actionLabel="Nova conta bancária" onAction={add} actionDisabledReason={lockReason} />
    {state.bank_accounts.length ? <>
      <StatStrip label="Resumo das contas" items={[
        { label: "Saldo consolidado", value: <Money cents={balance.cents} tone="neutral" />, tone: balance.cents < 0 ? "negative" : note ? "warning" : undefined,
          hint: note ?? (balance.cents < 0 ? "Negativo" : balance.converted ? "Em reais, pelas cotações atuais" : undefined) },
        // R1-CONTAS-2: the count said nothing; the balance after this month's automatic debits does.
        { label: "Saldo projetado", value: <Money cents={projected} tone="neutral" />, tone: projected < 0 ? "negative" : undefined,
          hint: projectedHint },
        // CR-29: a zero count is noise; the KPI only speaks up when an account is in the red.
        negativeCount
          ? { label: "Contas no vermelho", value: String(negativeCount), tone: "negative", hint: "Verifique o cheque especial" }
          : { label: "Situação", value: "Todas no azul", hint: "Nenhuma conta com saldo negativo" },
      ]} />
      {(invoices.count > 0 || unlinked.length > 0) && <p className="field-hint account-invoices-note" role="note">
        {outsideNote(invoices, unlinked.length, unlinked.filter(bill => bill.overdue).length)} a pagar (<Money cents={invoices.cents + unlinkedTotal.cents} />) {invoices.count + unlinked.length === 1 ? "entra" : "entram"} só no saldo projetado consolidado: a conta é escolhida ao pagar.
      </p>}
      {state.bank_accounts.length > 1 && <div className="toolbar wealth-toolbar">
        <Segmented size="sm" aria-label="Ordenar contas por" value={order} onChange={chooseOrder}
          options={[{ value: "balance", label: "Maior saldo" }, { value: "recent", label: "Uso recente" }]} />
      </div>}
      <div className="grid two accounts-grid">{accounts.map(item => <AccountCard key={item.id} item={item} removing={isRemoving(removing, "bank-accounts", item.id)} rates={rates} details={details}
        noRate={missing.includes(currencyOf(item.currency).code)} projection={projections.get(item.id)} lockReason={lockReason}
        onMove={() => openModal("bank-entry", { account_id: item.id })}
        onStatement={() => setStatementId(item.id)}
        onEdit={() => openEdit("bank-account", item)}
        onRemove={() => onRemove("bank-accounts", item.id, item.name)} />)}</div>
    </> : <EmptyState icon={Building2} title="Nenhuma conta cadastrada" description="Cadastre bancos, corretoras, contas em outras moedas ou dinheiro em espécie para consolidar seus saldos." actionLabel="Nova conta bancária" onAction={add} />}
    {statementId !== null && <HistoryDialog
      title={`Extrato · ${statementAccount ? `${statementAccount.institution} · ${statementAccount.name}` : "conta"}`}
      summary={statementAccount && <p className="muted">Saldo atual: <b className={statementAccount.current_balance_cents < 0 ? "negative" : undefined}>{format(statementAccount.current_balance_cents, statementAccount.currency)}</b>. Entradas e saídas podem ser estornadas pelo menu de cada linha; despesas e receitas vinculadas são removidas pelo lançamento.</p>}
      rows={bankStatementRows(statementId, statement.items, (id, label) => onRemove("transactions", id, label))}
      currency={statementAccount?.currency}
      balanceCents={statementAccount?.current_balance_cents ?? null}
      loading={statement.loading} error={statement.error} onRetry={() => void statement.reload()}
      total={statement.total} hasMore={statement.hasMore} loadingMore={statement.loadingMore} onLoadMore={() => void statement.loadMore()}
      emptyTitle="Extrato vazio"
      emptyDescription="Movimentações desta conta e lançamentos vinculados a ela aparecem aqui."
      onClose={() => setStatementId(null)} refresh={refresh} notify={notify} notifyError={notifyError} />}
  </>;
}
