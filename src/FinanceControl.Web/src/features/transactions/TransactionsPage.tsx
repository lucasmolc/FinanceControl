import { useContext, useMemo, useState, useSyncExternalStore } from "react";
import { ListChecks, Plus, ReceiptText, SearchX, Tags, Trash2 } from "lucide-react";
import { api, isConnectivityError } from "../../api/client";
import { EmptyState, LinkedName, Money, PageHeader, RowActions, Skeleton, StatStrip } from "../../components/ui";
import { BrandBadge } from "../../components/ui/BrandBadge";
import { CategoryIcon } from "../../components/ui/CategoryIcon";
import { Button } from "../../components/ui/Button";
import { DataTable, RowMenu, type DataTableColumn, type SortState } from "../../components/ui/DataTable";
import { recordMenuItems } from "../../components/ui/DataTable/menuItems";
import { SearchInput } from "../../components/ui/SearchInput";
import { Segmented } from "../../components/ui/Segmented";
import { Select } from "../../components/ui/Select";
import { ConfirmContext } from "../../components/confirmContext";
import { useMonthTransactions } from "../../hooks/useMonthTransactions";
import { formatDate, formatMonthLabel } from "../../lib/date";
import { countLabel, labelFor, paymentMethodLabels, transactionKindLabels } from "../../lib/labels";
import { isRemoving } from "../../lib/removing";
import { getPreferences, subscribePreferences } from "../../lib/preferencesStore";
import type { FinanceState, PageProps, Transaction } from "../../types";
import { MonthCloseBar } from "../closing/MonthCloseBar";
import { isMonthClosed, MONTH_CLOSED } from "../closing/closingModel";
import { BulkCategorizeDialog } from "./BulkCategorizeDialog";
import { OFFLINE_REASON } from "../records/offline";
import { accountOrMethod, baseAmount, shortMethod, dayLabel, dayNet, shortDayLabel, SORT_OPTIONS, sortFromOption, sortOption, filtersFromParams, isForeign, kindFilters, matchesTransaction, signedBase, transactionTotals, UNCATEGORIZED, type KindFilter } from "./transactionsModel";

/**
 * Amount in the transaction currency; BRL equivalent below for other currencies (MEL-26). Investments stay neutral with
 * their label under the value, so every amount lines up on the right edge.
 */
function Amount({ item }: { item: Transaction }) {
  const foreign = isForeign(item);
  const main = item.kind === "income" ? <Money cents={item.amount_cents} currency={item.currency} signed />
    // R1-LANC-1: an investment leaves the month balance like an expense, so it carries the same "−" as the day total.
    : <Money cents={-item.amount_cents} currency={item.currency} signed tone="neutral" />;
  const note = item.kind === "investment" ? labelFor(transactionKindLabels, item.kind) : null;
  if (!foreign && !note) return main;
  return <span className="amount-stack">{main}{foreign && <small className="muted">≈ <Money cents={baseAmount(item)} /></small>}{note && <small className="muted">{note}</small>}</span>;
}

/** Day header (CR-16): weekday and date, count (only when more than one, R1-LANC-3) and the net of the day. Phones get "Qui, 17/09". */
function DayHeader({ date, items }: { date: string; items: Transaction[] }) {
  const net = dayNet(items);
  return <>
    <span className="ui-group-title"><span className="day-long">{dayLabel(date)}</span><span className="day-short">{shortDayLabel(date)}</span></span>
    {items.length > 1 && <span className="ui-group-meta">{transactionsLabel(items.length)}</span>}
    <span className="ui-group-total"><span className="sr-only">Saldo do dia: </span><Money cents={net} signed tone={net < 0 ? "neutral" : "auto"} /></span>
  </>;
}

/** True while the "Compacto" density is on (the preferences store keeps it in sync with <html data-density>). */
function useCompactDensity(): boolean {
  return useSyncExternalStore(subscribePreferences, () => getPreferences().density === "compacto", () => getPreferences().density === "compacto");
}

/** Brand (service/merchant) or category glyph before the description (MEL-39). */
function DescriptionIcon({ item, state }: { item: Transaction; state: FinanceState }) {
  if (item.brand) return <BrandBadge brand={item.brand} name={item.description} kind="service" size="sm" decorative />;
  const category = item.category_id !== null ? state.categories.find(entry => entry.id === item.category_id) : undefined;
  return <CategoryIcon icon={category?.icon} color={category?.color} name={item.category_name ?? item.description} kind={item.kind} size="sm" />;
}

/** Account or card with its brand badge, then the payment method. */
function AccountCell({ item, state }: { item: Transaction; state: FinanceState }) {
  const account = item.account_id !== null ? state.bank_accounts.find(entry => entry.id === item.account_id) : undefined;
  const card = item.card_id ? state.cards.find(entry => entry.id === item.card_id) : undefined;
  const label = accountOrMethod(item);
  const method = item.account_name || item.card_name ? labelFor(paymentMethodLabels, item.payment_method) : null;
  const badge = account ? <BrandBadge brand={account.brand} name={account.institution} logo={account.logo_data} kind="bank" size="sm" decorative />
    : card ? <BrandBadge brand={card.brand} name={card.name} kind="bank" size="sm" decorative /> : null;
  // R1-LANC-2: one line with an ellipsis (full text in the tooltip). R2-LANC-1: between 621 and 1199 px the cell shows
  // only the logo and a short method ("Crédito", "Pix"), so neither the account nor the method is cut.
  const short = shortMethod(item.payment_method) || label;
  return <span className="account-cell" title={method ? `${label} · ${method}` : label}>
    {badge}
    <span className="account-cell-text account-cell-long">{label}{method && <small className="muted"> · {method}</small>}</span>
    <span className="account-cell-text account-cell-short" aria-hidden="true">{short}</span>
  </span>;
}

const transactionsLabel = (count: number) => countLabel(count, "lançamento", "lançamentos");

/** Toolbar orders, plus the current header sort when it is not one of them (e.g. "Categoria"). */
function sortChoices(sort: SortState | null) {
  const current = sortOption(sort);
  if (SORT_OPTIONS.some(option => option.value === current) || !sort) return SORT_OPTIONS;
  return [...SORT_OPTIONS, { value: current, label: "Ordem da coluna escolhida" }];
}

export function TransactionsPage({ state, month, summary, version, openModal, openEdit, onRemove, removing, onCloseMonth, onReopenMonth, routeParams, navigate, notify, notifyError, refresh, offline }: PageProps) {
  const { items, loading, error, reload, loadedKey } = useMonthTransactions(month, version);
  // R3 decision 1: a connectivity failure is announced only by the global banner (no retry block here).
  const disconnected = Boolean(offline) || (error !== null && isConnectivityError(error));
  // R3-LANC-1 / decision 2: totals only from data of this month (a failed first load is "—", never R$ 0,00).
  const hasData = loadedKey?.startsWith(`${month}:`) ?? false;
  // Removal always confirms; outside a ConfirmProvider (isolated renders) nothing is removed.
  const confirm = useContext(ConfirmContext);
  const [selected, setSelected] = useState<Array<string | number>>([]);
  const [categorizing, setCategorizing] = useState<Transaction[] | null>(null);
  // R1-LANC-4: grouped by day the date column is hidden, so the order lives in the toolbar.
  const [sort, setSort] = useState<SortState | null>({ column: "date", direction: "desc" });
  const [bulkBusy, setBulkBusy] = useState(false);
  // A new month starts without a selection.
  const [selectionMonth, setSelectionMonth] = useState(month);
  if (selectionMonth !== month) { setSelectionMonth(month); setSelected([]); }
  const initial = filtersFromParams(routeParams);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<KindFilter>(initial.kind);
  const [category, setCategory] = useState(initial.category);
  // Drill-down (MEL-38): a new hash query (e.g. from the Visão geral donut) replaces the filters.
  const paramsKey = JSON.stringify(routeParams ?? {});
  const [appliedKey, setAppliedKey] = useState(paramsKey);
  if (paramsKey !== appliedKey) {
    setAppliedKey(paramsKey);
    const next = filtersFromParams(routeParams);
    setKind(next.kind);
    setCategory(next.category);
  }
  /** Keeps the hash query in sync so the filtered view can be revisited (query-only changes never ask to leave). */
  const syncRoute = (nextKind: KindFilter, nextCategory: string) => {
    if (!navigate) return;
    const params: Record<string, string> = {};
    if (nextCategory) params.categoria = nextCategory;
    if (nextKind !== "all") params.tipo = nextKind;
    const key = JSON.stringify(params);
    setAppliedKey(key);
    navigate("transactions", params);
  };
  const chooseKind = (value: string) => { const next = value as KindFilter; setKind(next); setSelected([]); syncRoute(next, category); };
  const chooseCategory = (value: string) => { setCategory(value); setSelected([]); syncRoute(kind, value); };

  const add = () => openModal("transaction");
  const totals = transactionTotals(items);
  const visible = items.filter(item => matchesTransaction(item, search, kind, category));
  const filtering = search.trim() !== "" || kind !== "all" || category !== "";
  const clearFilters = () => { setSearch(""); setKind("all"); setCategory(""); setSelected([]); syncRoute("all", ""); };
  const monthLabel = formatMonthLabel(month);
  // Also true right after a month change: rows of the previous month are hidden (MEL-07).
  const firstLoad = loading && !items.length;
  const activeCategories = new Set(state.categories.map(entry => entry.id));
  // MEL-22: while the month is closed its transactions cannot be added, edited or removed.
  const closedReason = isMonthClosed(summary, month) ? MONTH_CLOSED : undefined;
  // R1 decision 4: nothing can be saved while the local server is unreachable.
  const lockedReason = disconnected ? OFFLINE_REASON : closedReason;

  const categoryOptions = useMemo(() => {
    const byKind = (entryKind: string) => state.categories.filter(entry => entry.kind === entryKind)
      .map(entry => ({ value: String(entry.id), label: entry.name, icon: <CategoryIcon icon={entry.icon} color={entry.color} name={entry.name} kind={entry.kind} size="sm" /> }));
    return [
      { value: UNCATEGORIZED, label: "Sem categoria" },
      { label: "Despesas", options: byKind("expense") },
      { label: "Receitas", options: byKind("income") },
      { label: "Investimentos", options: byKind("investment") },
    ].filter(entry => !("options" in entry) || (entry.options?.length ?? 0) > 0);
  }, [state.categories]);
  const removedCategory = category && category !== UNCATEGORIZED && !activeCategories.has(Number(category))
    ? items.find(item => String(item.category_id) === category)?.category_name ?? "Categoria removida" : undefined;

  /** CR-16: removes the selected transactions (one soft delete each), with a single "Desfazer". */
  async function removeMany(rows: Transaction[], clear: () => void) {
    const count = rows.length;
    const confirmed = confirm !== null && await confirm({
      title: count === 1 ? `Remover "${rows[0]!.description}"?` : `Remover ${transactionsLabel(count)}?`,
      message: "Eles saem das listas e dos totais, mas continuam guardados no histórico. Você poderá desfazer em seguida.",
      confirmLabel: count === 1 ? "Remover" : `Remover ${count}`,
      cancelLabel: "Cancelar",
      tone: "danger",
    });
    if (!confirmed) return;
    setBulkBusy(true);
    const removed: number[] = [];
    let failed = 0;
    for (const row of rows) {
      try { await api.remove("transactions", row.id); removed.push(row.id); } catch { failed += 1; }
    }
    clear();
    try { await refresh(); } finally { setBulkBusy(false); }
    if (removed.length) {
      notify(removed.length === 1 ? "1 lançamento removido." : `${removed.length} lançamentos removidos.`, {
        label: "Desfazer",
        run: async () => {
          for (const id of removed) await api.restore("transactions", id);
          await refresh();
          notify("Remoção desfeita.");
        },
      });
    }
    if (failed) {
      const message = `${transactionsLabel(failed)} não ${failed === 1 ? "pôde" : "puderam"} ser removido${failed === 1 ? "" : "s"}.`;
      if (notifyError) notifyError(new Error(message)); else notify(message);
    }
  }

  const bulkActions = (rows: Transaction[], clear: () => void) => <>
    <Button size="sm" icon={Tags} disabled={bulkBusy || Boolean(lockedReason)} title={lockedReason} onClick={() => setCategorizing(rows)}>Categorizar</Button>
    <Button size="sm" variant="danger" icon={Trash2} loading={bulkBusy} disabled={Boolean(lockedReason)} title={lockedReason} onClick={() => void removeMany(rows, clear)}>Remover</Button>
  </>;

  const menu = (item: Transaction) => <RowMenu label={item.description} removing={isRemoving(removing, "transactions", item.id)}
    items={recordMenuItems({ disabledReason: lockedReason, onEdit: () => openEdit("transaction", item), onRemove: () => onRemove("transactions", item.id, item.description) })} />;
  const categoryName = (item: Transaction) => item.category_name ?? "Sem categoria";
  // Rows are grouped by day only while the list is ordered by date (the DataTable `groups.columns` rule).
  const groupedByDay = sort?.column === "date";
  // R4-LANC-1: in the compact density a day with a single transaction costs no header row — its date sits in the Data
  // column ("17/09"); only days with 2+ transactions keep the header with the day total.
  const compactDensity = useCompactDensity();
  const uncategorizedView = category === UNCATEGORIZED && visible.length > 0 && !lockedReason;

  const columns: DataTableColumn<Transaction>[] = [
    { id: "date", header: "Data", cell: item => compactDensity ? formatDate(item.date).slice(0, 5) : formatDate(item.date), sortValue: item => item.date, width: compactDensity ? "5rem" : "7.5rem" },
    { id: "description", header: "Descrição", className: "col-description", cell: item => <span className="description-cell" title={item.notes ? `${item.description} · ${item.notes}` : item.description}><DescriptionIcon item={item} state={state} /><span className="description-text"><b>{item.description}</b>{item.notes && <small className="muted description-notes">{item.notes}</small>}<small className="muted description-category">{categoryName(item)}</small></span></span>, sortValue: item => item.description.toLocaleLowerCase("pt-BR") },
    { id: "category", header: "Categoria", className: "col-category", cell: item => <LinkedName name={item.category_name} removed={item.category_id !== null && !activeCategories.has(item.category_id)} fallback="Sem categoria" />, sortValue: item => item.category_name ?? "" },
    { id: "account", header: "Conta/Forma", cell: item => <AccountCell item={item} state={state} />, sortValue: item => accountOrMethod(item) },
    { id: "amount", header: "Valor", align: "right", cell: item => <Amount item={item} />, sortValue: signedBase },
    { id: "actions", header: "", actions: true, cell: item => <RowActions label={item.description} removing={isRemoving(removing, "transactions", item.id)} disabledReason={lockedReason} onEdit={() => openEdit("transaction", item)} onRemove={() => onRemove("transactions", item.id, item.description)} /> },
  ];

  return <>
    {/* R3-LANC-3: one line under the page title — the count with the month (no second description line). */}
    <PageHeader title={items.length ? `${transactionsLabel(items.length)} em ${monthLabel}` : `Movimentos de ${monthLabel}`} description={loading && !firstLoad ? "Atualizando…" : undefined} >
      {/* R2-LANC-3: the sidebar already has the green "Novo lançamento"; the page repeats it as a secondary button. */}
      <Button icon={Plus} disabled={Boolean(lockedReason)} title={lockedReason} onClick={add}>Novo lançamento</Button>
    </PageHeader>
    <MonthCloseBar month={month} summary={summary} onCloseMonth={onCloseMonth} onReopenMonth={onReopenMonth} disabledReason={disconnected ? OFFLINE_REASON : undefined} />

    {/* R3-LANC-2: offline, the global banner owns the message and the retry; the page only says what is missing. */}
    {disconnected && !hasData && <p className="page-offline-note" role="status">Sem dados enquanto o servidor estiver fora. Os lançamentos de {monthLabel} aparecem quando ele voltar.</p>}
    {error && !disconnected && <div className="error-banner" role="alert">
      <span>{error}</span>
      <div className="banner-actions"><button type="button" className="btn small ghost banner-action" onClick={() => void reload()}>Tentar novamente</button></div>
    </div>}

    {!hasData ? <StatStrip label={`Totais de ${monthLabel}`} items={["Receitas", "Despesas", "Investimentos", "Saldo do mês"].map(label => ({ label, value: <span aria-label="indisponível">—</span> }))} />
    : <StatStrip label={`Totais de ${monthLabel}`} items={[
      { label: "Receitas", value: <Money cents={totals.income} signed={totals.income > 0} tone={totals.income > 0 ? "positive" : "neutral"} /> },
      { label: "Despesas", value: <Money cents={-totals.expense} signed={totals.expense > 0} tone="neutral" /> },
      // R2-LANC-2: an investment leaves the month balance, so the KPI carries the same "−" as its rows and day totals.
      { label: "Investimentos", value: <Money cents={-totals.investment} signed={totals.investment > 0} tone="neutral" />, hint: "Aportes do mês" },
      { label: "Saldo do mês", value: <Money cents={totals.balance} signed />, tone: totals.balance < 0 ? "negative" : totals.balance > 0 ? "positive" : undefined, hint: items.some(isForeign) ? "Em reais, com a cotação de cada lançamento" : "Receitas − despesas − investimentos" },
    ]} />}

    {(items.length > 0 || filtering) && <div className="toolbar transactions-toolbar">
      <SearchInput className="transactions-search" aria-label="Buscar lançamentos" placeholder="Descrição, categoria ou observação" value={search} onChange={setSearch} />
      <Segmented aria-label="Filtrar por tipo" size="sm" value={kind} onChange={chooseKind} options={kindFilters.map(filter => ({ value: filter.value, label: filter.label }))} />
      <Select className="transactions-category" aria-label="Filtrar por categoria" size="sm" value={category} onChange={chooseCategory} emptyLabel="Todas as categorias" missingLabel={removedCategory} options={categoryOptions} />
      <Select className="transactions-sort" aria-label="Ordenar lançamentos" size="sm" value={sortOption(sort)} onChange={next => setSort(sortFromOption(next))} options={sortChoices(sort)} />
      {filtering && <span className="muted" role="status">{visible.length} de {transactionsLabel(items.length)}</span>}
    </div>}

    {firstLoad && <Skeleton label="Carregando lançamentos…" lines={4} />}

    {uncategorizedView && <div className="bulk-hint" role="note">
      <ListChecks size={16} aria-hidden="true" />
      <span>{transactionsLabel(visible.length)} sem categoria. Selecione e use <b>Categorizar</b> para organizar de uma vez.</span>
      {selected.length < visible.length && <button type="button" className="btn small ghost" onClick={() => setSelected(visible.map(item => item.id))}>Selecionar todos</button>}
    </div>}

    {visible.length > 0 && <DataTable className={loading ? "is-switching" : undefined} rows={visible} columns={columns} rowKey={item => item.id} caption={`Lançamentos de ${monthLabel}`}
      sort={sort} onSortChange={setSort} loading={loading} rowLabel={item => item.description}
      selectable selected={selected} onSelectionChange={setSelected} bulkActions={bulkActions}
      groups={compactDensity
        ? { key: item => item.date, header: (date, rows) => <DayHeader date={date} items={rows} />, columns: ["date"], minRows: 2 }
        : { key: item => item.date, header: (date, rows) => <DayHeader date={date} items={rows} />, columns: ["date"], hideColumns: ["date"] }}
      compact={{
        leading: item => <DescriptionIcon item={item} state={state} />,
        title: item => item.description,
        // R2-LANC-4: the day header above already says "Qui, 17/09"; the date only returns when rows are not grouped by day.
        meta: item => [groupedByDay && !compactDensity ? null : formatDate(item.date).slice(0, 5), categoryName(item), accountOrMethod(item)],
        amount: item => <Amount item={item} />,
        actions: menu,
      }}
      rowClassName={item => (isRemoving(removing, "transactions", item.id) ? "is-removing" : undefined)} />}

    {categorizing && <BulkCategorizeDialog rows={categorizing} state={state} refresh={refresh} notify={notify} notifyError={notifyError}
      onClose={() => setCategorizing(null)} onDone={() => { setCategorizing(null); setSelected([]); }} />}

    {!loading && !error && !items.length && <EmptyState icon={ReceiptText} title="Nenhum lançamento neste mês" description={closedReason ? `${monthLabel} está fechado e não tem lançamentos.` : `Registre uma receita, despesa ou aporte de ${monthLabel} para acompanhar o mês.`} actionLabel={lockedReason ? undefined : "Novo lançamento"} onAction={add} />}
    {items.length > 0 && !visible.length && <EmptyState compact icon={SearchX} title="Nenhum lançamento encontrado" description="Nenhum lançamento do mês corresponde à busca ou aos filtros escolhidos." actionLabel="Limpar filtros" onAction={clearFilters} />}
  </>;
}
