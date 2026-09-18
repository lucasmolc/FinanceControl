import { useState, type ReactNode } from "react";
import { api, errorMessage } from "../../api/client";
import { Select } from "../../components/ui/Select";
import { BUCKETS, bucketLabel, bucketLabels, isBucket } from "../plan/bucketModel";
import { ArrowDown, ArrowRight, CreditCard, Receipt, Tags, Tv } from "lucide-react";
import { Badge, EmptyState, LinkedName, Money, PageHeader, RowActions, StatStrip } from "../../components/ui";
import { BrandBadge } from "../../components/ui/BrandBadge";
import { CategoryIcon } from "../../components/ui/CategoryIcon";
import { Progress, type ProgressProps } from "../../components/ui/Progress";
import { Segmented } from "../../components/ui/Segmented";
import { DataTable, RowMenu, type DataTableColumn } from "../../components/ui/DataTable";
import { recordMenuItems } from "../../components/ui/DataTable/menuItems";
import { useMarketRates } from "../../hooks/useMarketRates";
import { currencyOf } from "../../lib/currencies";
import { formatDate, formatMonthLabel, todayISO } from "../../lib/date";
import { categoryKindLabels, labelFor, monthlyEquivalentCents, subscriptionFrequencyLabels } from "../../lib/labels";
import { formatProgress } from "../../lib/progress";
import { isRemoving } from "../../lib/removing";
import { toBaseCents, type ExchangeRates } from "../../lib/money";
import type { Card, Category, CategoryBucket, PageProps, PlanSummary, Subscription } from "../../types";
import { baseTotal, hasForeignCurrency, missingRatesNote } from "../wealth/conversion";
import { NativeMoney } from "../wealth/MoneyParts";
import { CardInvoices } from "./CardInvoices";
import { cardLimitView, invoicePhase, invoicesToPay } from "./invoiceModel";
import { useAsyncList } from "../../hooks/useAsyncList";
import { planBars, type PlanBar } from "../plan/planModel";
import { annualCents, bestPurchaseDay, budgetStatus, type BudgetStatus, cardSubscriptions, categorySpending, chargedLabel, chargePending, filterCategories, lastBillingDate, limitUsage, needsBillingDate, nextBillingDate, type CategoryFilter } from "./catalogMetrics";
import { VisualCard } from "./VisualCard";
import { OFFLINE_REASON } from "../records/offline";

/** Status tone → Progress tone (MEL-42). */
const progressTone = (tone: string | undefined): ProgressProps["tone"] => tone === "negative" ? "danger" : tone === "warning" ? "warning" : tone === "positive" ? "positive" : "accent";
/**
 * R3 decision 3: limit usage with the app's single progress rule (one decimal below 10%); past the limit the real share
 * is kept ("132%") instead of the 100% cap used for goals.
 */
const usagePct = (percent: number): string => percent >= 100 ? `${Math.floor(percent)}%` : formatProgress(percent, 100);
const optionalMoney = (cents: number) => cents > 0 ? <Money cents={cents} /> : <span className="muted">Não informado</span>;

// ── Cartões ─────────────────────────────────────────────────────────────────

interface CardItemProps {
  card: Card; subscriptions: Subscription[]; rates: ExchangeRates; removing: boolean; version: number; lockReason?: string;
  onEdit: () => void; onRemove: () => void;
  openModal: PageProps["openModal"]; notify: PageProps["notify"]; notifyError: PageProps["notifyError"]; refresh: PageProps["refresh"];
}

/** "Mensal" for a BRL monthly charge; the charged amount only when it differs from the monthly column ("US$ 4,99 · mensal"). */
function chargeLine(item: Subscription): ReactNode {
  const frequency = labelFor(subscriptionFrequencyLabels, item.frequency);
  const code = currencyOf(item.currency).code;
  if (code === "BRL" && item.frequency === "monthly") return frequency;
  return <><Money cents={item.amount_cents} currency={code} /> · {frequency.toLowerCase()}</>;
}

function CardItem({ card, subscriptions, rates, removing, version, lockReason, onEdit, onRemove, openModal, notify, notifyError, refresh }: CardItemProps) {
  const linked = cardSubscriptions(subscriptions, card.id, rates);
  const usage = limitUsage(linked.monthlyCents, card.personal_limit_cents);
  const limit = cardLimitView(card);
  const openCents = Math.max(0, card.open_invoice_cents ?? 0);
  const toPayCents = invoicesToPay([card])[0]?.cents ?? 0;
  const missing = missingRatesNote(linked.missing);
  const invoices = useAsyncList(() => api.cardInvoices(card.id), `invoices:${card.id}:${version}`);
  const today = todayISO();
  // R2-CARD-1: overdue invoices are announced right under the name (phones reach them after ~1.100 px otherwise).
  const overdue = invoices.items.filter(invoice => invoicePhase(invoice, today) === "vencida" && invoice.total_cents > 0);
  const overdueCents = overdue.reduce((sum, invoice) => sum + invoice.total_cents, 0);
  const panelId = `faturas-cartao-${card.id}`;
  const jump = () => {
    const panel = document.getElementById(panelId);
    panel?.scrollIntoView({ block: "start", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    panel?.focus({ preventScroll: true });
  };
  return <article className={`card credit-card-tile${removing ? " is-removing" : ""}`} aria-busy={removing || undefined}>
    <div className="card-header">
      {/* R2-CARD-2: issuer and dates already live on the card art; the header keeps the name. */}
      <div><h3>{card.name}</h3>
        {overdue.length > 0 && <button type="button" className="card-overdue-jump" onClick={jump}>
          {overdue.length === 1 ? "1 fatura vencida" : `${overdue.length} faturas vencidas`} · <Money cents={overdueCents} /><ArrowDown size={14} aria-hidden="true" />
        </button>}
      </div>
      <RowMenu label={card.name} removing={removing} items={recordMenuItems({ onEdit, onRemove })} />
    </div>
    {/* R2-CARD-1: the art with the best day and both limits on one side, the usage on the other — no dead band under the art. */}
    <div className="credit-card-body">
      <div className="credit-card-side">
        <VisualCard compact name={card.name} brand={card.brand} network={card.network} color={card.color} dueDay={card.due_day} closingDay={card.closing_day} />
        <p className="credit-card-best"><Badge tone="accent">Melhor dia de compra: dia {bestPurchaseDay(card.closing_day)}</Badge></p>
      </div>
      <div className="stack credit-card-details">
        {/* R2-CARD-1/2: the limit in use is named once, inside the usage block; the other limit is one line below it. */}
        {limit ? <div className="card-limit">
          <div className="card-limit-row"><span>{card.personal_limit_cents > 0 ? "Limite pessoal usado" : "Limite do banco usado"}</span><b><Money cents={limit.usedCents} /> <span className="muted">de <Money cents={limit.limitCents} /></span></b></div>
          {card.personal_limit_cents > 0 && card.real_limit_cents > 0 && <div className="card-limit-row card-limit-split"><span className="muted">Limite do banco</span><b><Money cents={card.real_limit_cents} /></b></div>}
          {/* R1-CARD-2: the same split as Contas a pagar — closed invoices to pay now, and the one still collecting purchases. */}
          {toPayCents > 0 && <div className="card-limit-row card-limit-split"><span className="muted">Fechadas a pagar</span><b><Money cents={toPayCents} /></b></div>}
          <div className="card-limit-row card-limit-split"><span className="muted">Fatura atual</span><b><Money cents={openCents} /></b></div>
          <Progress label={`Uso do limite de ${card.name}`} value={Math.min(100, Math.round(limit.percent))} valueText={`${usagePct(limit.percent)} do limite`} tone={progressTone(limit.tone)} />
          <div className="card-limit-row"><Badge tone={limit.tone ?? "positive"}>{limit.label} · {usagePct(limit.percent)}</Badge><span>Disponível <b><Money cents={limit.availableCents} tone={limit.availableCents < 0 ? "negative" : "neutral"} /></b></span></div>
        </div> : <>
          <div className="grid two card-values">
            <div><span className="label">Limite pessoal</span><div className="value compact-value">{optionalMoney(card.personal_limit_cents)}</div></div>
            <div><span className="label">Limite do banco</span><div className="value compact-value">{optionalMoney(card.real_limit_cents)}</div></div>
          </div>
          <p className="muted">O limite pessoal é quanto você se permite gastar por mês; o do banco é o crédito liberado.</p>
        </>}
      </div>
    </div>
    <CardInvoices id={panelId} card={card} version={version} list={invoices} openModal={openModal} notify={notify} notifyError={notifyError} refresh={refresh} lockReason={lockReason} />
    <h4 className="label card-section-title">Assinaturas neste cartão</h4>
    {linked.items.length ? <>
      {/* R2-CARD-2: the amount once, at the right; the line below says only what differs from it. */}
      <ul className="list">{linked.items.map(item => <li className="list-item" key={item.id}>
        <BrandBadge brand={item.brand} name={item.name} kind="service" size={28} decorative />
        <div className="list-main"><b>{item.name}</b><small className="muted">{chargeLine(item)}</small></div>
        <div className="list-amount"><NativeMoney cents={monthlyEquivalentCents(item.amount_cents, item.frequency)} currency={item.currency} rates={rates} /><span className="muted">/mês</span></div>
      </li>)}</ul>
      {/* R3-CARD-2: the same summary line on every card, whatever the number of subscriptions. */}
      <p className="card-subs-total">Total mensal equivalente: <b><Money cents={linked.monthlyCents} /></b>{usage && <span className="muted"> · {usagePct(usage.percent)} do limite pessoal</span>}</p>
      {missing && <p className="field-hint missing-rate-note">{missing}</p>}
      {usage?.tone && <p><Badge tone={usage.tone}>{usage.label}</Badge></p>}
    </> : <p className="muted">Nenhuma assinatura vinculada a este cartão.</p>}
  </article>;
}

export function CardsPage({ state, version, openModal, openEdit, onRemove, notify, notifyError, refresh, removing, offline }: PageProps) {
  const add = () => openModal("card");
  const { rates } = useMarketRates(hasForeignCurrency(state.subscriptions.filter(item => item.card_id !== null)));
  return <>
    <PageHeader title="Seus cartões" description="Limites, faturas e as assinaturas cobradas em cada cartão. Compras lançadas no cartão entram na fatura do período." actionLabel="Novo cartão" onAction={add} actionDisabledReason={offline ? OFFLINE_REASON : undefined} />
    {state.cards.length ? <div className="grid two cards-grid">{state.cards.map(card => <CardItem key={card.id} card={card} subscriptions={state.subscriptions} rates={rates} removing={isRemoving(removing, "cards", card.id)}
      version={version} lockReason={offline ? OFFLINE_REASON : undefined} openModal={openModal} notify={notify} notifyError={notifyError} refresh={refresh}
      onEdit={() => openEdit("card", card)} onRemove={() => onRemove("cards", card.id, card.name)} />)}</div>
      : <EmptyState icon={CreditCard} title="Nenhum cartão cadastrado" description="Adicione um cartão para acompanhar limites, o melhor dia de compra e as assinaturas vinculadas." actionLabel="Novo cartão" onAction={add} />}
  </>;
}

// ── Categorias ──────────────────────────────────────────────────────────────

const categoryFilters: [CategoryFilter, string][] = [["all", "Todas"], ["expense", "Despesas"], ["income", "Receitas"], ["investment", "Investimentos"]];

const shortMonthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

/** "set." for "2026-09" (CR-11: short column headers). */
const shortMonth = (month: string): string => shortMonthFormatter.format(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)));

/** Column/label for the realized amount in the month (MEL-11, CR-11): "Gasto em set." · "Recebido em set." · "Aplicado em set." · "Realizado em set.". */
const realizedLabel = (kind: CategoryFilter | Category["kind"], month: string): string =>
  `${kind === "expense" ? "Gasto" : kind === "income" ? "Recebido" : kind === "investment" ? "Aplicado" : "Realizado"} em ${shortMonth(month)}`;

interface CategoryRow { item: Category; spent: number; status: BudgetStatus | null; }

/** "Restam R$ …" / "Excedeu R$ …" (or "—" without a budget). */
function Remaining({ status }: { status: BudgetStatus | null }) {
  if (!status) return <span className="muted">—</span>;
  return status.remainingCents >= 0 ? <span>Restam <Money cents={status.remainingCents} /></span> : <span>Excedeu <Money cents={-status.remainingCents} tone="negative" /></span>;
}

const BUCKET_OPTIONS = BUCKETS.map(bucket => ({ value: bucket, label: bucketLabels[bucket] }));

/** R1-CAT-1: bucket of the 70-20-10 plan, chosen right in the table (income never enters the plan). */
function BucketCell({ item, disabledReason, busy, onChange }: { item: Category; disabledReason?: string; busy: boolean; onChange: (bucket: CategoryBucket | null) => void }) {
  if (item.kind === "income") return <span className="muted">Não entra no plano</span>;
  return <Select size="sm" className="bucket-select" aria-label={`Balde do plano de ${item.name}`} value={isBucket(item.bucket) ? item.bucket : ""} emptyLabel="Sem balde"
    options={BUCKET_OPTIONS} disabled={busy || Boolean(disabledReason)} onChange={next => onChange(isBucket(next) ? next : null)} />;
}

const planTone = (bar: PlanBar): ProgressProps["tone"] => bar.state === "over" ? "danger" : bar.state === "near" ? "warning" : bar.state === "reached" ? "positive" : "accent";

/**
 * R1-CAT-2 / R2-CAT-1: the three parts of the plan side by side, each with its bar — spent (or invested) of the month
 * against the plan limit (or minimum), and for the spending buckets the category limits summed (decision 1: plan rows
 * are limits and a minimum, never "teto").
 */
function PlanBuckets({ plan, categoryLimits, unbucketed, onShowUnbucketed, filtering }: { plan: PlanSummary; categoryLimits: Record<"fixo" | "lazer", number>; unbucketed: number; onShowUnbucketed: () => void; filtering: boolean }) {
  return <section className="plan-buckets" aria-label="Baldes do plano 70-20-10">
    <h3 className="section-title">Baldes do plano</h3>
    <ul className="plan-bucket-list">
      {planBars(plan).map(bar => {
        const ceiling = bar.kind === "ceiling";
        const limits = bar.id === "investimento" ? null : categoryLimits[bar.id];
        const limitsOver = limits !== null && bar.limitCents > 0 && limits > bar.limitCents;
        return <li key={bar.id} className={`plan-bucket is-${bar.state}`}>
          <div className="plan-bucket-head">
            <span className="plan-bucket-name">{ceiling ? bar.label : "Investimento mínimo"}</span>
            {bar.state === "over" && <Badge tone="negative">Acima do limite</Badge>}
            {bar.state === "reached" && <Badge tone="positive">Mínimo atingido</Badge>}
          </div>
          <span className="plan-bucket-amount"><b><Money cents={bar.realizedCents} /></b> <span className="muted">de <Money cents={bar.limitCents} /> ({ceiling ? "limite" : "mínimo"})</span></span>
          <Progress size="sm" label={`${bar.label}: realizado × plano`} value={Math.min(bar.pct, 100)} valueText={`${bar.pct}% do ${ceiling ? "limite" : "mínimo"}`} tone={planTone(bar)} />
          <small className="muted plan-bucket-foot">{limits !== null
            ? limits > 0 ? <>Limites das categorias: <Money cents={limits} />{limitsOver && <> · <b className="negative">passam <Money cents={limits - bar.limitCents} /></b></>}</> : "Nenhuma categoria com limite neste balde"
            : bar.state === "reached" ? `${bar.pct}% do mínimo investido` : <>Faltam <Money cents={Math.max(0, bar.limitCents - bar.realizedCents)} /> para o mínimo</>}</small>
        </li>;
      })}
    </ul>
    {unbucketed > 0 && <p className="plan-bucket-note">
      <Badge tone="warning">{unbucketed === 1 ? "1 categoria sem balde" : `${unbucketed} categorias sem balde`}</Badge>
      <span className="muted"> ficam fora das somas do plano.</span>
      {!filtering && <button type="button" className="btn small ghost" onClick={onShowUnbucketed}>Mostrar só as sem balde</button>}
    </p>}
  </section>;
}

export function CategoriesPage({ state, month, summary, openModal, openEdit, onRemove, removing, navigate, routeParams, notify, notifyError, refresh, offline }: PageProps) {
  const [filter, setFilter] = useState<CategoryFilter>("all");
  // R1-CAT-1: "#/categorias?balde=sem" (Painel → "Escolher baldes") opens with only the categories without a bucket.
  const [onlyUnbucketed, setOnlyUnbucketed] = useState(routeParams?.balde === "sem");
  const [appliedBalde, setAppliedBalde] = useState(routeParams?.balde ?? "");
  if ((routeParams?.balde ?? "") !== appliedBalde) { setAppliedBalde(routeParams?.balde ?? ""); setOnlyUnbucketed(routeParams?.balde === "sem"); }
  const [busyId, setBusyId] = useState<number | null>(null);
  const add = () => openModal("category");
  const monthLabel = formatMonthLabel(month);
  const spentById = categorySpending(summary, state.transactions, month, state.categories);
  const needsBucket = (item: Category) => item.kind !== "income" && !isBucket(item.bucket);
  const unbucketedCount = state.categories.filter(needsBucket).length;
  const visible = filterCategories(state.categories, filter).filter(item => !onlyUnbucketed || needsBucket(item));
  const expenseCategories = state.categories.filter(item => item.kind === "expense");
  const budgetTotal = expenseCategories.reduce((sum, item) => sum + item.monthly_budget_cents, 0);
  const spentTotal = expenseCategories.reduce((sum, item) => sum + (spentById.get(item.id) ?? 0), 0);
  const exceeded = expenseCategories.filter(item => budgetStatus(spentById.get(item.id) ?? 0, item.monthly_budget_cents)?.tone === "negative").length;
  const uncategorized = summary && summary.month === month ? summary.uncategorized_expense_cents : null;
  const ceiling = state.settings.monthly_spending_limit_cents;
  const hasPlan = typeof state.settings.plan_fixed_pct === "number";
  const plan = summary && summary.month === month ? summary.plan ?? null : null;
  const lockReason = offline ? OFFLINE_REASON : undefined;
  const rows: CategoryRow[] = visible.map(item => {
    const spent = spentById.get(item.id) ?? 0;
    return { item, spent, status: item.kind === "expense" ? budgetStatus(spent, item.monthly_budget_cents) : null };
  });
  // CR-16: the amber KPI leads to Lançamentos filtered by "Sem categoria", where they can be categorized in bulk.
  const reviewUncategorized = navigate && uncategorized ? () => navigate("transactions", { categoria: "sem", tipo: "expense" }) : undefined;
  const limitsOf = (bucket: CategoryBucket) => expenseCategories.filter(item => item.bucket === bucket).reduce((sum, item) => sum + item.monthly_budget_cents, 0);

  async function changeBucket(item: Category, bucket: CategoryBucket | null) {
    setBusyId(item.id);
    try {
      await api.update("categories", item.id, { bucket });
      await refresh();
      notify(`${item.name}: ${bucketLabel(bucket)}.`);
    } catch (reason) {
      if (notifyError) notifyError(reason); else notify(errorMessage(reason));
    } finally {
      setBusyId(null);
    }
  }

  const columns: DataTableColumn<CategoryRow>[] = [
    // R4-CAT-1 (R3-CAT-2 remainder): no "Tipo" column repeating "Despesa" on every row — income and investment categories
    // carry a badge next to the name; everything else is an expense (the filter above says so too).
    { id: "name", header: "Categoria", className: "col-name", sortValue: row => row.item.name, cell: ({ item }) => <span className="entity-cell compact"><CategoryIcon icon={item.icon} color={item.color} name={item.name} kind={item.kind} size="sm" /><span className="entity-name">{item.name}</span>{item.kind !== "expense" && <Badge>{labelFor(categoryKindLabels, item.kind)}</Badge>}</span> },
    ...(hasPlan || state.categories.some(item => isBucket(item.bucket)) ? [{ id: "bucket", header: "Balde", sortValue: (row: CategoryRow) => bucketLabel(row.item.bucket), cell: ({ item }: CategoryRow) => <BucketCell item={item} disabledReason={lockReason} busy={busyId === item.id} onChange={bucket => void changeBucket(item, bucket)} /> }] : []),
    { id: "budget", header: "Limite mensal", align: "right", sortValue: row => row.item.kind === "expense" ? row.item.monthly_budget_cents : null, cell: ({ item }) => item.kind === "expense" && item.monthly_budget_cents > 0 ? <Money cents={item.monthly_budget_cents} /> : <span className="muted">—</span> },
    { id: "spent", header: realizedLabel(filter, month), align: "right", sortValue: row => row.spent, cell: row => <Money cents={row.spent} /> },
    // The remaining amount sits under the bar (one column less, so the bucket column fits at 1440 px).
    { id: "status", header: "Uso do limite", sortValue: row => row.status?.percent ?? null, cell: ({ item, status }) => status
      // R2-CAT-2: bar + "72% · Restam R$ …"; the pill only when the limit was passed.
      ? <div className="budget-status">
        {status.tone === "negative"
          ? <Badge tone="negative">{status.label} · {usagePct(status.percent)} · <Money cents={-status.remainingCents} /> acima</Badge>
          : null}
        <Progress size="sm" label={`Uso do limite de ${item.name}`} value={Math.min(100, Math.round(status.percent))} valueText={`${usagePct(status.percent)} do limite`} tone={progressTone(status.tone)} />
        {status.tone !== "negative" && <small className="muted">{usagePct(status.percent)} · <Remaining status={status} /></small>}
      </div>
      : <span className="muted">{item.kind === "expense" ? "Sem limite definido" : "Sem limite (não é despesa)"}</span> },
    { id: "actions", header: "", actions: true, cell: ({ item }) => <RowActions label={item.name} removing={isRemoving(removing, "categories", item.id)} disabledReason={lockReason} onEdit={() => openEdit("category", item)} onRemove={() => onRemove("categories", item.id, item.name)} /> },
  ];

  return <>
    <PageHeader title={`Orçamento de ${monthLabel}`} description="Limite mensal por categoria de despesa, o balde de cada uma no plano 70-20-10 e quanto já foi gasto no mês escolhido." actionLabel="Nova categoria" onAction={add} actionDisabledReason={lockReason} />
    {state.categories.length ? <>
      <StatStrip label={`Resumo de ${monthLabel}`} items={[
        // Decision 1: the sum of the category limits is compared with the month's spending ceiling, never called "teto" itself.
        { label: "Soma dos limites por categoria", value: <Money cents={budgetTotal} />, tone: ceiling > 0 && budgetTotal > ceiling ? "warning" : undefined,
          hint: ceiling > 0 ? <>{budgetTotal > ceiling ? "Acima" : "Dentro"} do teto de gastos de <Money cents={ceiling} /></> : "Categorias de despesa" },
        // R1-CAT-3: only categorized spending is counted here (the Painel total also has the uncategorized part).
        { label: "Gasto categorizado", value: <Money cents={spentTotal} />, tone: budgetTotal > 0 && spentTotal > budgetTotal ? "negative" : undefined, hint: budgetTotal > 0 ? `${usagePct(spentTotal / budgetTotal * 100)} da soma dos limites` : `Em ${monthLabel}` },
        { label: "Categorias excedidas", value: String(exceeded), tone: exceeded ? "negative" : undefined, hint: exceeded ? "Acima do limite mensal" : "Nenhuma acima do limite" },
        ...(uncategorized !== null ? [{
          label: "Despesas sem categoria",
          value: reviewUncategorized
            ? <button type="button" className="stat-link" onClick={reviewUncategorized} aria-label="Ver despesas sem categoria em Lançamentos"><Money cents={uncategorized} /><ArrowRight size={16} aria-hidden="true" /></button>
            : <Money cents={uncategorized} />,
          tone: uncategorized > 0 ? "warning" as const : undefined,
          hint: reviewUncategorized ? "Categorize em lote em Lançamentos" : uncategorized > 0 ? undefined : "Tudo categorizado",
        }] : []),
      ]} />
      {plan && <PlanBuckets plan={plan} categoryLimits={{ fixo: limitsOf("fixo"), lazer: limitsOf("lazer") }} unbucketed={unbucketedCount} filtering={onlyUnbucketed} onShowUnbucketed={() => { setFilter("all"); setOnlyUnbucketed(true); }} />}
      <div className="toolbar">
        <Segmented size="sm" aria-label="Filtrar por tipo" value={filter} onChange={next => setFilter(next as CategoryFilter)} options={categoryFilters.map(([value, label]) => ({ value, label }))} />
        {onlyUnbucketed && <span className="filter-chip" role="status">Só categorias sem balde <button type="button" className="btn small ghost" onClick={() => setOnlyUnbucketed(false)}>Mostrar todas</button></span>}
      </div>
      {rows.length ? <DataTable rows={rows} columns={columns} rowKey={row => row.item.id} caption={`Categorias e uso do limite em ${monthLabel}`} rowLabel={row => row.item.name}
        rowClassName={row => (isRemoving(removing, "categories", row.item.id) ? "is-removing" : undefined)}
        compactOnOverflow className="records-compact"
        compact={{
          leading: ({ item }) => <CategoryIcon icon={item.icon} color={item.color} name={item.name} kind={item.kind} size="sm" />,
          title: ({ item }) => item.name,
          // Usage first (it is what the row is for), then bucket and kind — the line is cut at the end on narrow phones.
          meta: ({ item, status }) => [
            status ? (status.tone === "negative" ? `${status.label} · ${usagePct(status.percent)}` : `${usagePct(status.percent)} do limite`) : item.kind === "expense" ? "Sem limite" : null,
            item.kind !== "income" && (hasPlan || isBucket(item.bucket)) ? bucketLabel(item.bucket) : null,
            // R4-CAT-1: the kind only for income/investment, and never twice ("Investimento · Investimento").
            filter === "all" && item.kind !== "expense" && labelFor(categoryKindLabels, item.kind) !== bucketLabel(item.bucket) ? labelFor(categoryKindLabels, item.kind) : null,
          ],
          amount: row => <Money cents={row.spent} />,
          aside: ({ status }) => status ? <Remaining status={status} /> : null,
          detail: ({ item, status }) => status ? <Progress size="sm" label={`Uso do limite de ${item.name}`} value={Math.min(100, Math.round(status.percent))} valueText={`${usagePct(status.percent)} do limite`} tone={progressTone(status.tone)} /> : null,
          actions: ({ item }) => <RowMenu label={item.name} removing={isRemoving(removing, "categories", item.id)} items={recordMenuItems({ disabledReason: lockReason, onEdit: () => openEdit("category", item), onRemove: () => onRemove("categories", item.id, item.name) })} />,
        }} />
        : onlyUnbucketed
          ? <EmptyState compact icon={Tags} title="Todas as categorias têm balde" description="Os gastos já entram nas somas do plano 70-20-10." actionLabel="Mostrar todas" onAction={() => setOnlyUnbucketed(false)} />
          : <EmptyState compact icon={Tags} title="Nenhuma categoria deste tipo" description="Escolha outro filtro ou crie uma categoria." />}
    </> : <EmptyState icon={Tags} title="Nenhuma categoria criada" description="Organize do seu jeito. Exemplos possíveis: alimentação, moradia ou transporte. Categorias de despesa podem ter um limite mensal." actionLabel={lockReason ? undefined : "Nova categoria"} onAction={add} />}
  </>;
}

// ── Assinaturas ─────────────────────────────────────────────────────────────

/** Name cell: service badge (Netflix, Spotify, Smart Fit…), name, charge of the month and auto-debit (MEL-05/29/39). */
function SubscriptionName({ item, charged }: { item: Subscription; charged: string | null }) {
  return <div className="entity-cell">
    <BrandBadge brand={item.brand} name={item.name} kind="service" size={28} decorative />
    <div className="entity-text">
      <span className="entity-name">{item.name}</span>
      {(charged || item.auto_debit) && <small className="tag-row">
        {charged && <Badge tone="positive">{charged}</Badge>}
        {item.auto_debit && <span className="badge auto-debit">Débito automático{item.card_id ? " no cartão" : item.account_name ? ` · ${item.account_name}` : ""}</span>}
      </small>}
    </div>
  </div>;
}

/**
 * R1-ASSIN-2: the monthly equivalent in reais first (the totals are in reais); the charged amount and its frequency below
 * when they differ ("US$ 4,99 · mensal", "R$ 166,80 · anual").
 */
function MonthlyInBase({ item, rates }: { item: Subscription; rates: ExchangeRates }) {
  const code = currencyOf(item.currency).code;
  const monthly = monthlyEquivalentCents(item.amount_cents, item.frequency);
  const base = code === "BRL" ? monthly : toBaseCents(monthly, code, rates);
  const original = code !== "BRL" || item.frequency !== "monthly";
  return <span className="amount-stack">
    {base === null ? <span className="muted">Sem cotação</span> : <Money cents={base} />}
    {original && <small className="muted"><Money cents={item.amount_cents} currency={code} /> · {labelFor(subscriptionFrequencyLabels, item.frequency).toLowerCase()}</small>}
  </span>;
}

/** R1-ASSIN-3: card mark + name on one line. */
function CardName({ card, name, removed }: { card: Card | undefined; name: string | null; removed: boolean }) {
  if (!name) return <span className="muted">—</span>;
  return <span className="entity-cell compact card-name-cell" title={name}>
    <BrandBadge brand={card?.brand} name={name} kind="bank" size="sm" decorative />
    <span className="card-name-text">{name}{removed && <span className="muted"> (removido)</span>}</span>
  </span>;
}

interface SubscriptionRow { item: Subscription; next: string | null; charged: string | null; pending: boolean; pendingDate: string | null; missingDate: boolean; }

export function SubscriptionsPage({ state, openModal, openEdit, onRemove, removing, offline }: PageProps) {
  const add = () => openModal("subscription");
  const today = todayISO();
  const [onlyPending, setOnlyPending] = useState(false);
  const active = state.subscriptions.filter(item => item.active !== false);
  const { rates } = useMarketRates(hasForeignCurrency(active));
  const monthly = baseTotal(active.map(item => ({ minor: monthlyEquivalentCents(item.amount_cents, item.frequency), currency: item.currency })), rates);
  const annual = baseTotal(active.map(item => ({ minor: annualCents(item.amount_cents, item.frequency), currency: item.currency })), rates);
  const autoCount = active.filter(item => item.auto_debit).length;
  const cardsById = new Map(state.cards.map(item => [item.id, item]));
  const activeCategories = new Set(state.categories.map(item => item.id));
  const lockReason = offline ? OFFLINE_REASON : undefined;
  const allRows: SubscriptionRow[] = state.subscriptions
    .map(item => {
      const next = nextBillingDate(item, today);
      const pending = chargePending(item, today);
      return { item, next, charged: chargedLabel(item, today), pending, pendingDate: pending ? lastBillingDate(item, today) : null, missingDate: !next && needsBillingDate(item) };
    })
    // Pending charges lead: they are what needs doing now (R1-ASSIN-1).
    .sort((left, right) => Number(right.pending) - Number(left.pending) || (left.next ?? "9999").localeCompare(right.next ?? "9999") || left.item.name.localeCompare(right.item.name, "pt-BR"));
  const pendingCount = allRows.filter(row => row.pending).length;
  const filtering = onlyPending && pendingCount > 0;
  const rows = filtering ? allRows.filter(row => row.pending) : allRows;
  const note = missingRatesNote(monthly.missing);
  const charge = (item: Subscription) => openModal("subscription-charge", { subscription_id: item.id });
  const menu = ({ item }: SubscriptionRow) => <RowMenu label={item.name} removing={isRemoving(removing, "subscriptions", item.id)} items={recordMenuItems({
    before: [{ label: "Lançar cobrança", icon: Receipt, onSelect: () => charge(item), disabled: Boolean(lockReason), disabledReason: lockReason }],
    disabledReason: lockReason,
    onEdit: () => openEdit("subscription", item),
    onRemove: () => onRemove("subscriptions", item.id, item.name),
  })} />;
  const chargeButton = (row: SubscriptionRow) => row.pending && !isRemoving(removing, "subscriptions", row.item.id)
    ? <button type="button" className="btn small" disabled={Boolean(lockReason)} title={lockReason} aria-label={`Lançar cobrança de ${row.item.name}`} onClick={() => charge(row.item)}><Receipt size={14} aria-hidden="true" />Lançar</button>
    : null;
  /** R1-ASSIN-1: a pending charge replaces the next date with what is missing ("Cobrança de 08/09 não lançada"). */
  const nextCell = ({ item, next, missingDate, pendingDate }: SubscriptionRow) => pendingDate
    ? <div><Badge tone="warning">Cobrança de {formatDate(pendingDate).slice(0, 5)} não lançada</Badge>{next && next !== pendingDate && <small className="muted">Próxima em {formatDate(next)}</small>}</div>
    : next
      ? <div>{formatDate(next)}{item.auto_debit && <small className="muted">Lançada automaticamente</small>}</div>
      : missingDate
        ? <div><Badge tone="warning">Informe a próxima cobrança</Badge> <button type="button" className="btn small ghost" disabled={isRemoving(removing, "subscriptions", item.id) || Boolean(lockReason)} onClick={() => openEdit("subscription", item)}>Informar data</button></div>
        : <span className="muted">Não informada</span>;

  const columns: DataTableColumn<SubscriptionRow>[] = [
    { id: "name", header: "Assinatura", className: "col-name", sortValue: row => row.item.name, cell: row => <SubscriptionName item={row.item} charged={row.charged} /> },
    { id: "monthly", header: "Por mês", label: "Equivalente mensal em reais", align: "right", sortValue: ({ item }) => toBaseCents(monthlyEquivalentCents(item.amount_cents, item.frequency), currencyOf(item.currency).code, rates), cell: ({ item }) => <MonthlyInBase item={item} rates={rates} /> },
    { id: "next", header: "Próxima cobrança", sortValue: row => (row.pendingDate ? `0${row.pendingDate}` : row.next), cell: nextCell },
    { id: "card", header: "Cartão", cell: ({ item }) => <CardName card={item.card_id !== null ? cardsById.get(item.card_id) : undefined} name={item.card_name} removed={item.card_id !== null && !cardsById.has(item.card_id)} /> },
    { id: "category", header: "Categoria", cell: ({ item }) => <LinkedName name={item.category_name} removed={item.category_id !== null && !activeCategories.has(item.category_id)} /> },
    { id: "actions", header: "", actions: true, cell: row => <div className="row-actions">{chargeButton(row)}{menu(row)}</div> },
  ];

  return <>
    <PageHeader title="Serviços recorrentes" description="Custo de cada assinatura convertido para o equivalente mensal em reais, com a próxima cobrança. Com débito automático, a cobrança é lançada sozinha." actionLabel="Nova assinatura" onAction={add} actionDisabledReason={lockReason} />
    {allRows.length ? <>
      <StatStrip label="Resumo das assinaturas" items={[
        { label: "Custo mensal equivalente", value: <Money cents={monthly.cents} />, hint: note ?? "Inclui anuais ÷ 12 e semanais × 52 ÷ 12" },
        { label: "Custo anual", value: <Money cents={annual.cents} /> },
        { label: "Assinaturas ativas", value: String(active.length), hint: autoCount ? `${autoCount} em débito automático` : undefined },
        ...(pendingCount ? [{
          label: "Cobranças a lançar",
          // R1-ASSIN-1: the KPI says which ones — it filters the list.
          // R2-ASSIN-1: a real name for the filter, and the whole KPI is the target (.stat-link covers it).
          value: <button type="button" className="stat-link" aria-pressed={filtering} onClick={() => setOnlyPending(!filtering)}
            aria-label={filtering ? "Mostrar todas as assinaturas" : `Mostrar só ${pendingCount === 1 ? "a cobrança" : `as ${pendingCount} cobranças`} a lançar`}>{String(pendingCount)}<ArrowRight size={16} aria-hidden="true" /></button>,
          tone: "warning" as const,
          // R2-ASSIN-2: no "toque" on a desktop.
          // R3-ASSIN-2: what the KPI does sits on its own line instead of wrapping after a "·".
          hint: <>{filtering ? "Mostrando só as pendentes" : "Vencidas neste mês e ainda não lançadas"}<span className="stat-hint-action">{filtering ? "Ver todas" : "Ver só estas"}</span></>,
        }] : []),
      ]} />
      {filtering && <div className="toolbar"><span className="filter-chip" role="status">Só cobranças a lançar <button type="button" className="btn small ghost" onClick={() => setOnlyPending(false)}>Mostrar todas</button></span></div>}
      <DataTable rows={rows} columns={columns} rowKey={row => row.item.id} caption="Assinaturas e próximas cobranças" rowLabel={row => row.item.name}
        rowClassName={row => [row.pending ? "is-pending" : "", isRemoving(removing, "subscriptions", row.item.id) ? "is-removing" : ""].filter(Boolean).join(" ") || undefined}
        compactOnOverflow className="records-compact"
        compact={{
          leading: ({ item }) => <BrandBadge brand={item.brand} name={item.name} kind="service" size={28} decorative />,
          title: ({ item }) => item.name,
          meta: row => [
            row.pendingDate ? `Cobrança de ${formatDate(row.pendingDate).slice(0, 5)}`
              : row.next ? `Próxima ${formatDate(row.next).slice(0, 5)}` : row.missingDate ? <Badge tone="warning">Informe a próxima cobrança</Badge> : null,
            row.pending ? null : row.charged,
            row.item.card_name ?? row.item.category_name,
          ],
          amount: ({ item }) => <MonthlyInBase item={item} rates={rates} />,
          aside: row => row.pending ? <Badge tone="warning">Não lançada</Badge> : null,
          // R1-ASSIN-1: the pending charge is one tap away on phones too.
          detail: row => row.pending ? <div className="compact-cta">{chargeButton(row)}</div> : null,
          actions: menu,
        }} />
    </> : <EmptyState icon={Tv} title="Nenhuma assinatura recorrente" description="Cadastre serviços que realmente usa, como streaming, software ou academia." actionLabel={lockReason ? undefined : "Nova assinatura"} onAction={add} />}
  </>;
}
