import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Plus, Search } from "lucide-react";
import { api, errorMessage } from "./api/client";
import { serverReachable } from "./api/connectivity";
import { buildAppCommands } from "./components/appCommands";
import { AppShell } from "./components/AppShell";
import { BrandIntro } from "./components/BrandIntro";
import { PageErrorBoundary } from "./components/PageErrorBoundary";
import { PageLoader } from "./components/PageLoader";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { HideValuesToggle } from "./components/HideValuesToggle";
import { OfflineBanner } from "./components/OfflineBanner";
import { hasOpenLayer } from "./components/layerStack";
import { ToastProvider } from "./components/Toast";
import { CommandPalette, useCommandPaletteHotkey, type Command } from "./components/ui/CommandPalette";
import { recoverLostFocus } from "./components/focus";
import { navItem } from "./components/navigation";
import { UnsavedChangesContext, type UnsavedChangesRegistry } from "./components/unsavedChanges";
import { Badge, MonthSwitcher } from "./components/ui";
import { useConfirm } from "./components/useConfirm";
import { useFinanceData } from "./hooks/useFinanceData";
import { useHashRoute } from "./hooks/useHashRoute";
import { preferencesWritePending, usePreferences } from "./hooks/usePreferences";
import { useServerStatus } from "./hooks/useServerStatus";
import { useToast } from "./hooks/useToast";
import { autoDebitMessage } from "./lib/autoDebit";
import { currentMonth, formatMonthLabel } from "./lib/date";
import { setPreferences } from "./lib/preferencesStore";
import { viewTransitionRunning } from "./lib/viewTransition";
import { ReassignDialog } from "./features/catalog/ReassignDialog";
import { exactLinkCounts, linksMessage, reassignTargets, totalLinks, type ReassignChoice, type ReassignModule } from "./features/catalog/reassign";
import { isMonthClosed, monthCloseInitial } from "./features/closing/closingModel";
import { RecordModal } from "./features/records/RecordModal";
import { recordForms } from "./features/records/registry";
import type { SavedUndo } from "./features/records/types";
import { SetupWizard } from "./features/setup/SetupWizard";
import { GuidedTour } from "./features/tour/GuidedTour";
import type { ChecklistItem, FormState, ModalKind, NoticeAction, PageId, PageProps, RecordModule, RemovingRecord } from "./types";

const APP_NAME = "LMM Finance Control";
/** CR-17: the palette shortcut shown on the search button ("⌘ K" on Apple keyboards). */
/** CR-17: with a query, at most 3 pages so records and actions stay in view. */
const PALETTE_GROUP_LIMITS = { "Ir para": 3 };
/** R2-CMD-1: without a query each group shows 5 options plus "Mostrar todos (N)". */
const PALETTE_EMPTY_GROUP_LIMIT = 5;
const PALETTE_SHORTCUT = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘ K" : "Ctrl K";

interface ModalState { kind: ModalKind; mode: "create" | "edit"; initial: FormState; id?: number; }

interface ReassignRequest { module: ReassignModule; label: string; linksMessage: string; targets: [string, string][]; resolve: (choice: ReassignChoice | null) => void; }

const isReassignModule = (module: RecordModule): module is ReassignModule => module === "categories" || module === "cards";

/**
 * Dev-only component gallery (MEL-42, `#/componentes`). Loaded lazily through import.meta.glob behind
 * `import.meta.env.DEV`, so production builds never include it.
 */
const galleryModules = import.meta.env.DEV
  ? import.meta.glob<{ ComponentsPage: ComponentType<PageProps> }>("./features/gallery/ComponentsPage.tsx")
  : {};
const galleryLoader = Object.values(galleryModules)[0];
const ComponentsPage = galleryLoader ? lazy(async () => ({ default: (await galleryLoader()).ComponentsPage })) : null;

/**
 * Pages are code-split (main chunk < 500 kB): each route loads its chunk on first visit; the content crossfades and a
 * brand mini-loader appears only when the chunk takes longer than PAGE_LOADER_DELAY_MS (MEL-48). Chunks of the same
 * feature file are shared (e.g. the catalog pages).
 */
/** R1-BR-5 QA hook, dev builds only: `?slow-chunks` in the URL delays every page chunk so the PageLoader can be reviewed. */
const SLOW_CHUNKS_MS = import.meta.env.DEV && typeof window !== "undefined" && /[?&]slow-chunks\b/.test(window.location.search) ? 1500 : 0;
const chunk = <T,>(load: () => Promise<T>): (() => Promise<T>) => (SLOW_CHUNKS_MS
  ? () => new Promise<void>(resolve => window.setTimeout(resolve, SLOW_CHUNKS_MS)).then(load)
  : load);
const catalogPages = () => import("./features/catalog/CatalogPages");
const planningPages = () => import("./features/planning/PlanningPages");
const wealthPages = () => import("./features/wealth/WealthPages");
const DashboardPage = lazy(chunk(async () => ({ default: (await import("./features/dashboard/DashboardPage")).DashboardPage })));
const TransactionsPage = lazy(chunk(async () => ({ default: (await import("./features/transactions/TransactionsPage")).TransactionsPage })));
const BillsPage = lazy(chunk(async () => ({ default: (await planningPages()).BillsPage })));
const GoalsPage = lazy(chunk(async () => ({ default: (await planningPages()).GoalsPage })));
const InvestmentsPage = lazy(chunk(async () => ({ default: (await wealthPages()).InvestmentsPage })));
const AccountsPage = lazy(chunk(async () => ({ default: (await wealthPages()).AccountsPage })));
const CardsPage = lazy(chunk(async () => ({ default: (await catalogPages()).CardsPage })));
const CategoriesPage = lazy(chunk(async () => ({ default: (await catalogPages()).CategoriesPage })));
const SubscriptionsPage = lazy(chunk(async () => ({ default: (await catalogPages()).SubscriptionsPage })));
const SettingsPage = lazy(chunk(async () => ({ default: (await import("./features/settings/SettingsPage")).SettingsPage })));
const ReportsPage = lazy(chunk(async () => ({ default: (await import("./features/reports/ReportsPage")).ReportsPage })));
const ProjectionsPage = lazy(chunk(async () => ({ default: (await import("./features/projections/ProjectionsPage")).ProjectionsPage })));
const MarketPage = lazy(chunk(async () => ({ default: (await import("./features/market/MarketPage")).MarketPage })));

/** Rendered after the page content inside its Suspense boundary: reports that the page mounted (lazy chunk loaded). */
function PageReady({ id, onReady }: { id: number; onReady: (id: number) => void }) {
  useEffect(() => { onReady(id); }, [id, onReady]);
  return null;
}

/**
 * Route content wrapper, remounted per page. R1-BR-3 / decision 6: exactly one entrance per navigation — `.page-enter`
 * only when the page change did not run inside a View Transition (whose snapshot already crossfades).
 */
function PageFrame({ children }: { children: ReactNode }) {
  const [enter] = useState(() => !viewTransitionRunning());
  return <div className={enter ? "page-enter page-content" : "page-content"}>{children}</div>;
}

const focusPageHeading = () => {
  const heading = document.querySelector<HTMLElement>(".topbar-title h1") ?? document.querySelector<HTMLElement>("main h1, main h2");
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
};

function FinanceApp() {
  const confirm = useConfirm();
  const dirtyPages = useRef(new Set<symbol>());
  const unsavedRegistry = useMemo<UnsavedChangesRegistry>(() => ({
    set: (token, dirty) => { if (dirty) dirtyPages.current.add(token); else dirtyPages.current.delete(token); },
  }), []);
  const confirmLeave = useCallback(() => confirm({
    title: "Descartar alterações não salvas?",
    message: "As alterações feitas nesta página ainda não foram salvas e serão perdidas.",
    confirmLabel: "Descartar",
    cancelLabel: "Continuar editando",
    tone: "danger",
  }), [confirm]);
  const routeGuard = useMemo(() => ({ isBlocked: () => dirtyPages.current.size > 0, confirmLeave }), [confirmLeave]);
  const [page, navigate, routeParams] = useHashRoute(routeGuard);
  const [month, setMonth] = useState(currentMonth);
  const { state, checklist, summary, dataMonth, version, error, loading, refreshing, refresh, setError } = useFinanceData(month);
  const { toast } = useToast();
  // R1 decision 4: one global offline state; the current page refetches as soon as the server answers again.
  const server = useServerStatus(useCallback(() => { void refresh(); }, [refresh]));
  // MEL-48: brand opening only on app load and after the setup (id of the running opening, null when none).
  const [intro, setIntro] = useState<number | null>(0);
  const [readyId, setReadyId] = useState<number | null>(null);
  // R2-SET-2 / R2-BR-1: what the setup asked to open next (the record form) waits for the brand opening to leave, so
  // no layer mounts — and takes the focus — under the overlay ("brand, then app").
  const afterIntro = useRef<(() => void) | null>(null);
  const introRunning = intro !== null;
  const markPageReady = useCallback((id: number) => setReadyId(id), []);
  // Page change: the content crossfades (view transition) and the new page title takes the focus (CR-28 keeps the ring off).
  const shownPage = useRef(page);
  useEffect(() => {
    if (shownPage.current === page) return;
    shownPage.current = page;
    const frame = window.requestAnimationFrame(focusPageHeading);
    return () => window.cancelAnimationFrame(frame);
  }, [page]);
  const [tour, setTour] = useState(false);
  /** R1-SET-6 (FE-Insights): leaving setup through "Registrar primeiro lançamento" skips the tour auto-start this session. */
  const [tourDeferred, setTourDeferred] = useState(false);
  const [revisitSetup, setRevisitSetup] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const { preferences, update: updatePreferences } = usePreferences();
  const [busyBillId, setBusyBillId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<RemovingRecord | null>(null);
  const [reassign, setReassign] = useState<ReassignRequest | null>(null);
  const current = navItem(page);

  useEffect(() => { document.title = `${current.label} · ${APP_NAME}`; }, [current.label]);

  // MEL-30: the server preferences win over the localStorage cache once the state arrives.
  const serverPreferences = state?.settings.ui_preferences;
  // R1-CFG-9: skipped while a local change is still being saved (the server copy would be older).
  useEffect(() => { if (serverPreferences && !preferencesWritePending()) setPreferences(serverPreferences); }, [serverPreferences]);

  // MEL-28: after the first load, refresh failures become error toasts (the full-page error is only for the first load).
  // R1-PAINEL-3: when another month could not be loaded, the month that is on screen stays selected (a month label never
  // shows another month's numbers). While offline the global banner speaks for the network errors.
  const hasState = state !== null;
  useEffect(() => {
    if (!error || !hasState) return;
    setError(null);
    if (dataMonth && dataMonth !== month) {
      setMonth(dataMonth);
      toast({ message: `Não foi possível abrir ${formatMonthLabel(month)}${serverReachable() ? `: ${error.replace(/\.$/, "")}` : " sem conexão com o servidor local"}. Continuamos em ${formatMonthLabel(dataMonth)}.`, tone: "error" });
      return;
    }
    if (serverReachable()) toast({ message: error, tone: "error" });
  }, [error, hasState, dataMonth, month, setError, toast]);

  // MEL-29: run due auto-debits once per app load; new expenses refresh the data and show a toast.
  const autoDebitsRan = useRef(false);
  useEffect(() => {
    if (autoDebitsRan.current) return;
    autoDebitsRan.current = true;
    void (async () => {
      try {
        const result = await api.runAutoDebits();
        const created = result?.created?.length ?? 0;
        if (!created) return;
        await refresh();
        toast({ message: autoDebitMessage(created), tone: "info" });
      } catch {
        // Older server or offline: the hosted service also runs them; nothing to show.
      }
    })();
  }, [refresh, toast]);

  // R2-TOUR-2: the tour auto-starts only once the brand opening is gone (its popover and keys never live under it).
  useEffect(() => {
    if (introRunning || !state?.settings.setup_completed || state.settings.tour_completed || tourDeferred) return;
    const timer = window.setTimeout(() => setTour(true), 500);
    return () => window.clearTimeout(timer);
  }, [introRunning, state?.settings.setup_completed, state?.settings.tour_completed, tourDeferred]);

  /** Action failures → error toast (MEL-28). */
  const report = useCallback((reason: unknown) => {
    toast({ message: errorMessage(reason), tone: "error" });
  }, [toast]);

  const reportMessage = useCallback((message: string) => { toast({ message, tone: "error" }); }, [toast]);

  /** Wraps a toast action so it reports failures and cannot run twice. */
  const undoable = useCallback((label: string, run: () => void | Promise<void>): NoticeAction => {
    let done = false;
    return {
      label,
      run: async () => {
        if (done) return;
        done = true;
        try { await run(); } catch (reason) { report(reason); }
      },
    };
  }, [report]);

  /** Success toast (MEL-28); every action (including the ones pages pass, e.g. "Desfazer" an estorno) is guarded by `undoable`. */
  const notify = useCallback((message: string, action?: NoticeAction) => {
    toast({ message, tone: "success", action: action && undoable(action.label, action.run) });
  }, [toast, undoable]);

  const openModal = useCallback((kind: ModalKind, initial: FormState = {}) => {
    setModal({ kind, mode: "create", initial });
  }, []);

  const openEdit = useCallback((kind: ModalKind, record: object) => {
    const definition = recordForms[kind];
    const id = (record as { id?: unknown }).id;
    if (!definition.fromRecord || typeof id !== "number") return;
    setModal({ kind, mode: "edit", initial: definition.fromRecord(record), id });
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  /**
   * Removal of a category/card with links: exact counts (MEL-41) + "Mover vínculos para" (MEL-09).
   * Resolves to null when there are no links (plain confirmation instead).
   */
  const askReassign = useCallback(async (module: ReassignModule, id: number, label: string): Promise<Promise<ReassignChoice | null> | null> => {
    if (!state) return null;
    const counts = await exactLinkCounts(state, module, id);
    if (!totalLinks(counts)) return null;
    return new Promise(resolve => setReassign({
      module, label, linksMessage: linksMessage(module, counts), targets: reassignTargets(state, module, id),
      resolve: choice => { setReassign(null); resolve(choice); },
    }));
  }, [state]);

  const onRemove = useCallback((module: RecordModule, id: number, label: string) => {
    void (async () => {
      let choice: ReassignChoice = { move: false };
      const reassignPrompt = isReassignModule(module) ? await askReassign(module, id, label) : null;
      if (reassignPrompt) {
        const answer = await reassignPrompt;
        if (!answer) return;
        choice = answer;
      } else {
        const confirmed = await confirm({
          title: `Remover "${label}"?`,
          message: "O registro sai das listas e dos totais, mas continua guardado no histórico. Você poderá desfazer em seguida.",
          confirmLabel: "Remover",
          cancelLabel: "Cancelar",
          tone: "danger",
        });
        if (!confirmed) return;
      }
      setRemoving({ module, id });
      try {
        if (choice.move) {
          if (module === "cards") await api.reassignCard(id, choice.targetId);
          else await api.reassignCategory(id, choice.targetId);
        }
        await api.remove(module, id);
        await refresh();
        const movedTo = choice.move ? choice.targetName : null;
        notify(`"${label}" foi removido.${movedTo ? ` Vínculos movidos para ${movedTo}.` : ""}`, undoable("Desfazer", async () => {
          await api.restore(module, id);
          await refresh();
          notify(movedTo ? `Remoção desfeita. Os vínculos movidos continuam em ${movedTo}.` : "Remoção desfeita.");
        }));
      } catch (reason) {
        report(reason);
      } finally {
        setRemoving(null);
        window.requestAnimationFrame(recoverLostFocus);
      }
    })();
  }, [askReassign, confirm, notify, refresh, report, undoable]);

  const toggleBill = useCallback(async (item: ChecklistItem) => {
    setBusyBillId(item.id);
    try {
      if (!item.paid) {
        await api.setChecklist({ bill_id: item.id, month, paid: true, register_transaction: true });
        await refresh();
        notify("Conta paga e lançada como despesa.", undoable("Desfazer", async () => {
          await api.setChecklist({ bill_id: item.id, month, paid: false });
          await refresh();
          notify("Pagamento desfeito.");
        }));
      } else {
        await api.setChecklist({ bill_id: item.id, month, paid: false });
        await refresh();
        notify(item.transaction_id ? "Pagamento reaberto; o lançamento vinculado foi removido." : "Pagamento reaberto.");
      }
    } catch (reason) {
      report(reason);
    } finally {
      setBusyBillId(null);
    }
  }, [month, notify, refresh, report, undoable]);

  /** MEL-22: closing dialog with the month totals. */
  const onCloseMonth = useCallback(() => {
    setModal({ kind: "month-close", mode: "create", initial: monthCloseInitial(month, summary) });
  }, [month, summary]);

  /** MEL-22: confirm + reopen; resolves true when the month was reopened. */
  const onReopenMonth = useCallback(async (target: string): Promise<boolean> => {
    const confirmed = await confirm({
      title: `Reabrir ${formatMonthLabel(target)}?`,
      message: "Lançamentos, contas e movimentações deste mês voltam a poder ser alterados. Você pode fechar o mês de novo depois.",
      confirmLabel: "Reabrir mês",
      cancelLabel: "Cancelar",
      tone: "primary",
    });
    if (!confirmed) return false;
    try {
      await api.reopenMonth(target);
      await refresh();
      notify(`${formatMonthLabel(target)} foi reaberto.`);
      return true;
    } catch (reason) {
      report(reason);
      return false;
    }
  }, [confirm, notify, refresh, report]);

  // MEL-42: Ctrl/Cmd+K command palette (only once the app is set up).
  // R2-BR-1: shortcuts wait for the brand opening too (a palette or form opened under the overlay would be invisible).
  const appReady = Boolean(state?.settings.setup_completed) && !introRunning;
  useCommandPaletteHotkey(() => setPaletteOpen(open => !open), appReady);
  const toggleHideValues = useCallback(() => {
    updatePreferences({ hide_values: !preferences.hide_values }).catch(report);
  }, [preferences.hide_values, report, updatePreferences]);

  /** R1-SH-4: the core action from anywhere — sidebar, phone topbar, palette and the N key. */
  const quickAdd = useCallback(() => openModal("transaction", {}), [openModal]);
  useEffect(() => {
    if (!appReady) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "n" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog']") || hasOpenLayer()) return;
      event.preventDefault();
      quickAdd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appReady, quickAdd]);

  /** MEL-25: replay the guided tour; it runs as soon as the Painel is on screen. */
  const replayTour = useCallback(() => {
    navigate("dashboard");
    setTour(true);
  }, [navigate]);

  /** R1-CMD-1: opens Configurações on one of its sections (the page is lazy: waits for the section to mount). */
  const openSettingsSection = useCallback((section: string) => {
    navigate("settings");
    const started = Date.now();
    const find = () => {
      const target = document.getElementById(`settings-${section}`);
      if (target) {
        target.scrollIntoView({ block: "start" });
        const heading = target.querySelector<HTMLElement>("h2");
        if (heading) { if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
      } else if (Date.now() - started < 3000) window.requestAnimationFrame(find);
    };
    window.requestAnimationFrame(find);
  }, [navigate]);

  // R3-CMD-3: pages visited in this session, most recent first (the palette's "Recentes").
  const [recentPages, setRecentPages] = useState<PageId[]>([]);
  useEffect(() => { setRecentPages(current => [page, ...current.filter(id => id !== page)].slice(0, 6)); }, [page]);

  const commands = useMemo(() => (state ? buildAppCommands({
    state, page, navigate, openModal, openEdit, refresh: () => void refresh(), hideValues: preferences.hide_values, toggleHideValues, query: paletteQuery,
    theme: preferences.theme, density: preferences.density,
    setTheme: theme => { updatePreferences({ theme }).catch(report); },
    setDensity: density => { updatePreferences({ density }).catch(report); },
    // R3-CMD-1: "Fechar o mês" is found from any page and targets the selected month.
    closeMonth: !isMonthClosed(summary, month) ? () => setModal({ kind: "month-close", mode: "create", initial: monthCloseInitial(month, summary) }) : undefined,
    replayTour, openSettingsSection, monthLabel: formatMonthLabel(month), recentPages,
  }) : []), [state, page, navigate, openModal, openEdit, refresh, preferences.hide_values, preferences.theme, preferences.density, toggleHideValues, paletteQuery,
    updatePreferences, report, summary, month, replayTour, openSettingsSection, recentPages]);

  /** R2-CMD-2: a query that finds nothing can still become a record ("Criar lançamento “padaria”"). */
  const paletteFallback = useCallback((query: string): Command[] => [{
    id: "create-from-query", label: `Criar lançamento “${query}”`, group: "Criar", icon: Plus,
    run: () => openModal("transaction", { description: query }),
  }], [openModal]);

  async function completeTour() {
    setTour(false);
    try { await api.settings({ tour_completed: true }); await refresh(); } catch (reason) { report(reason); }
  }

  /** Refreshes before closing so the dialog restores focus against the updated page (MEL-08). */
  async function modalSaved(message: string, undo?: SavedUndo, options?: { keepOpen?: boolean }) {
    await refresh();
    // CR-15: "Salvar e lançar outro" keeps the dialog open for the next record.
    if (!options?.keepOpen) setModal(null);
    notify(message, undo && undoable("Desfazer", async () => {
      await undo.run();
      await refresh();
      notify(undo.message);
    }));
  }

  // MEL-48: the brand opening replaces the loading state; the shell renders (and the first page loads) underneath.
  // It always sits at the same place in the tree (last child of the root fragment) so it is never remounted when the
  // data arrives — a remount restarted the choreography mid-flight.
  const introReady = intro !== null && !loading && (!state?.settings.setup_completed || readyId === intro);
  const introDone = () => {
    setIntro(null);
    const next = afterIntro.current;
    afterIntro.current = null;
    next?.();
  };
  const introOverlay = intro !== null && <BrandIntro key={intro} ready={introReady} onDone={introDone} />;
  const withIntro = (body: ReactNode) => <>{body}{introOverlay}</>;

  if (loading) return withIntro(null);
  if (!state) return withIntro(
    <div className="center-state" role="alert"><p>{error || "Não foi possível carregar a aplicação."}</p><button type="button" className="btn" onClick={() => void refresh()}>Tentar novamente</button></div>,
  );
  if (!state.settings.setup_completed) return withIntro(
    <SetupWizard onDone={next => {
      if (next === "record") { setTourDeferred(true); afterIntro.current = () => openModal("transaction"); }
      setIntro(current => (current ?? 0) + 1);
      void refresh();
    }} onSkip={() => void refresh()} onError={reportMessage} />,
  );

  const pageProps: PageProps = { state, month, checklist, summary, version, openModal, openEdit, onRemove, notify, refresh, removing, onCloseMonth, onReopenMonth, routeParams, navigate, notifyError: report, offline: server.offline };
  const closed = isMonthClosed(summary, month);

  const content = (() => {
    switch (page) {
      case "dashboard": return <DashboardPage {...pageProps} onPlanSetup={() => setRevisitSetup(true)} onToggleBill={item => void toggleBill(item)} busyBillId={busyBillId} />;
      case "transactions": return <TransactionsPage {...pageProps} />;
      case "bills": return <BillsPage {...pageProps} />;
      case "goals": return <GoalsPage {...pageProps} />;
      case "investments": return <InvestmentsPage {...pageProps} />;
      case "cards": return <CardsPage {...pageProps} />;
      case "accounts": return <AccountsPage {...pageProps} />;
      case "categories": return <CategoriesPage {...pageProps} />;
      case "subscriptions": return <SubscriptionsPage {...pageProps} />;
      case "settings": return <SettingsPage {...pageProps} onError={reportMessage} onReplayTour={replayTour} onRevisitSetup={() => setRevisitSetup(true)} />;
      case "reports": return <ReportsPage {...pageProps} />;
      case "projections": return <ProjectionsPage {...pageProps} />;
      case "market": return <MarketPage {...pageProps} />;
      case "components": return ComponentsPage
        ? <ComponentsPage {...pageProps} />
        : <p className="muted">A galeria de componentes ainda não está disponível.</p>;
    }
  })();

  return withIntro(<UnsavedChangesContext.Provider value={unsavedRegistry}>
    <GuidedTour run={tour && page === "dashboard"} onDone={() => void completeTour()} />
    <AppShell page={page} name={state.settings.display_name} onNavigate={navigate} busy={refreshing} onQuickAdd={quickAdd} quickAddShortcut="N"
      banner={server.offline ? <OfflineBanner checking={server.checking} onRetry={server.retry} /> : undefined} actions={current.monthAware ? <>
      <MonthSwitcher month={month} onChange={setMonth} />
      {closed && <Badge tone="warning">Mês fechado</Badge>}
    </> : undefined} tools={<>
      <button type="button" className="icon-btn command-palette-trigger" aria-label="Buscar e comandos" aria-keyshortcuts="Control+K Meta+K" title={`Buscar e comandos (${PALETTE_SHORTCUT})`} onClick={() => setPaletteOpen(true)}>
        <Search size={18} aria-hidden="true" /><kbd className="kbd" aria-hidden="true">{PALETTE_SHORTCUT}</kbd>
      </button>
      <HideValuesToggle />
    </>}>
      <PageFrame key={page}>
        <PageErrorBoundary label={current.label}>
          <Suspense fallback={<PageLoader label={current.label} />}>
            {content}
            <PageReady id={intro ?? -1} onReady={markPageReady} />
          </Suspense>
        </PageErrorBoundary>
      </PageFrame>
    </AppShell>
    <CommandPalette open={paletteOpen} onClose={() => { setPaletteOpen(false); setPaletteQuery(""); }} commands={commands} onQueryChange={setPaletteQuery} groupLimits={PALETTE_GROUP_LIMITS}
      emptyQueryGroupLimit={PALETTE_EMPTY_GROUP_LIMIT} fallback={paletteFallback}
      emptyMessage={query => <>Nada encontrado para “{query}”. Tente “lançamento”, “meta”, “tema” ou “backup”.</>} />
    {modal && <RecordModal key={`${modal.kind}:${modal.mode}:${modal.id ?? "new"}`} kind={modal.kind} mode={modal.mode} initial={modal.initial} id={modal.id} state={state} month={month} onClose={closeModal} onSaved={modalSaved} offline={server.offline} onReopenMonth={onReopenMonth} />}
    {revisitSetup && <SetupWizard revisiting initialSettings={state.settings} onDone={() => { setRevisitSetup(false); notify("Planejamento mensal atualizado."); void refresh(); }} onSkip={() => setRevisitSetup(false)} onError={reportMessage} />}
    {reassign && <ReassignDialog module={reassign.module} label={reassign.label} linksMessage={reassign.linksMessage} targets={reassign.targets} onResolve={reassign.resolve} />}
  </UnsavedChangesContext.Provider>);
}

export function App() {
  return <ToastProvider><ConfirmProvider><FinanceApp /></ConfirmProvider></ToastProvider>;
}
