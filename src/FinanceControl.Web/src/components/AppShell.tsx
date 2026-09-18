import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import type { PageId } from "../types";
import { hasOpenLayer } from "./layerStack";
import { Logo } from "./Logo";
import { mobilePrimary, navGroups, navItem, visibleNavigation, type NavItem } from "./navigation";

interface AppShellProps {
  page: PageId;
  name: string;
  onNavigate: (page: PageId) => void;
  /** Rendered in `.topbar-actions` (e.g. the MonthSwitcher). */
  actions?: ReactNode;
  /** Always-visible topbar tools after `actions` (hide-values toggle, command palette button). */
  tools?: ReactNode;
  /** True while data refreshes: `aria-busy` on `main` (MEL-07). */
  busy?: boolean;
  /** R1-SH-4: opens the new-transaction form ("Novo lançamento" in the sidebar, "+" on the phone topbar). */
  onQuickAdd?: () => void;
  /** Key hint shown next to the quick-add button (e.g. "N"). */
  quickAddShortcut?: string;
  /** Global status line at the top of the content (R1 decision 4: offline banner). */
  banner?: ReactNode;
  children: ReactNode;
}

const MAIN_ID = "conteudo";
/** Position of the centre "+" among the dock's page links (Visão geral, Extrato | + | A pagar, Mais). */
const DOCK_ADD_INDEX = 2;

/**
 * R1-SH-5: "Pular para o conteúdo" before the 14-link sidebar. The app routes by hash, so the link focuses `main`
 * itself instead of changing the location.
 */
function SkipLink() {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const main = document.getElementById(MAIN_ID);
    const heading = main?.querySelector<HTMLElement>("h1");
    const target = heading ?? main;
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus();
  };
  return <a className="skip-link" href={`#${MAIN_ID}`} onClick={onClick}>Pular para o conteúdo</a>;
}

/** A plain click goes through the app navigation (unsaved-changes guard); modified clicks keep the browser behaviour. */
const isPlainClick = (event: MouseEvent<HTMLAnchorElement>) =>
  !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * R2-SH-3: navigation entries are real links (`href` = hash route), so middle-click / Ctrl-click open a page in a new
 * tab and the address is discoverable; a plain click is handled by the app.
 */
function NavLink({ item, page, short = false, onNavigate }: { item: NavItem; page: PageId; short?: boolean; onNavigate: (page: PageId) => void }) {
  const Icon = item.icon;
  const active = page === item.id;
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    onNavigate(item.id);
  };
  return <a href={item.route} aria-current={active ? "page" : undefined} className={active ? "nav-link active" : "nav-link"} onClick={onClick}>
    <Icon size={short ? 18 : 17} aria-hidden="true" />{short ? <span>{item.shortLabel}</span> : <span>{item.label}</span>}
  </a>;
}

const HOME_LABEL = "LMM Finance — ir para a Visão geral";

/**
 * MEL-49: the brand lockup is a link to the Visão geral. A plain click goes through the app navigation (so the
 * unsaved-changes guard still asks); modified clicks keep the browser behaviour (new tab/window).
 */
function BrandHome({ onNavigate, className }: { onNavigate: (page: PageId) => void; className: string }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    onNavigate("dashboard");
  };
  return <a className={className} href={navItem("dashboard").route} aria-label={HOME_LABEL} onClick={onClick}><Logo /></a>;
}

/** CR-12: true once the page scrolled under the sticky topbar (solid band + hairline). */
function useScrolled(threshold = 4): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);
  return scrolled;
}

function SidebarGroup({ label, items, footer, page, onNavigate }: { label: string; items: PageId[]; footer?: boolean; page: PageId; onNavigate: (page: PageId) => void }) {
  const labelId = useId();
  return <div className={`nav-group${footer ? " nav-group-footer" : ""}`} role="group" aria-labelledby={labelId}>
    <span className={`nav-group-label${footer ? " sr-only" : ""}`} id={labelId}>{label}</span>
    {items.map(id => <NavLink key={id} item={navItem(id)} page={page} onNavigate={onNavigate} />)}
  </div>;
}

export function AppShell({ page, name, onNavigate, actions, tools, busy = false, onQuickAdd, quickAddShortcut, banner, children }: AppShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const current = navItem(page);
  const trimmedName = name.trim();
  const title = page === "dashboard" ? (trimmedName ? `Olá, ${trimmedName}` : "Olá!") : current.label;
  const primaryNavigation = mobilePrimary.map(navItem);
  const secondaryNavigation = visibleNavigation.filter(item => !mobilePrimary.includes(item.id));
  const activeSecondary = secondaryNavigation.find(item => item.id === page);
  const scrolled = useScrolled();

  /** Closes the "Mais" panel and returns focus to its toggle (MEL-01). */
  const closeMore = () => {
    setMoreOpen(false);
    moreButtonRef.current?.focus();
  };

  useEffect(() => {
    if (!moreOpen) return;
    // Focus the first area when the panel opens (MEL-01).
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const close = () => { setMoreOpen(false); moreButtonRef.current?.focus(); };
    // A modal layer (palette, dialog) opened over the panel takes Escape first (MEL-46).
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !hasOpenLayer()) close(); };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreRef.current?.contains(event.target)) close();
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [moreOpen]);

  const navigate = (nextPage: PageId) => { setMoreOpen(false); onNavigate(nextPage); };
  const navigateFromMore = (nextPage: PageId) => { closeMore(); onNavigate(nextPage); };

  return <>
    <SkipLink />
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><BrandHome className="brand-home" onNavigate={navigate} /></div>
        {onQuickAdd && <button type="button" className="btn primary quick-add" onClick={onQuickAdd} aria-keyshortcuts={quickAddShortcut}>
          <Plus size={16} aria-hidden="true" /><span>Novo lançamento</span>{quickAddShortcut && <kbd className="kbd" aria-hidden="true">{quickAddShortcut}</kbd>}
        </button>}
        <nav className="nav tour-nav" aria-label="Navegação principal">
          {navGroups.map(group => <SidebarGroup key={group.label} label={group.label} items={group.items} footer={group.footer} page={page} onNavigate={navigate} />)}
        </nav>
      </aside>
      <main className="main" id={MAIN_ID} aria-busy={busy || undefined}>
        <header className={scrolled ? "topbar is-scrolled" : "topbar"}>
          {/* Lockup shown on phones (where the brand intro settles); hidden on desktop by CSS. */}
          <div className="topbar-brand"><BrandHome className="brand-home" onNavigate={navigate} /></div>
          <div className="topbar-title"><h1>{title}</h1><p className="muted">{current.subtitle}</p></div>
          {(actions || tools || onQuickAdd) && <div className="topbar-actions">
            {actions}
            {/* R1-SH-1: on phones the tools sit on the logo row (right-aligned), not on a row of their own. */}
            {(tools || onQuickAdd) && <div className="topbar-tools">
              {tools}
              {onQuickAdd && <button type="button" className="icon-btn quick-add-icon" aria-label="Novo lançamento" title="Novo lançamento" onClick={onQuickAdd}><Plus size={20} aria-hidden="true" /></button>}
            </div>}
          </div>}
        </header>
        {banner}
        {children}
      </main>
    </div>
    {moreOpen && <div className="mobile-more-scrim" aria-hidden="true" />}
    {/* R2-SH-2: the create action sits in the dock's centre, in the thumb zone (the topbar "+" stays on tablets). */}
    <nav className="mobile-nav" aria-label="Navegação móvel" data-mobile-nav>
      {primaryNavigation.slice(0, DOCK_ADD_INDEX).map(item => <NavLink key={item.id} item={item} page={page} short onNavigate={navigate} />)}
      {onQuickAdd && <button type="button" className="mobile-nav-add quick-add-icon" aria-label="Novo lançamento" onClick={onQuickAdd}>
        <span className="mobile-nav-add-disc" aria-hidden="true"><Plus size={22} /></span>
      </button>}
      {primaryNavigation.slice(DOCK_ADD_INDEX).map(item => <NavLink key={item.id} item={item} page={page} short onNavigate={navigate} />)}
      <div className="mobile-more" ref={moreRef}>
        {/* Toggle first, panel after it: natural Tab order; the panel is positioned above by CSS. */}
        <button ref={moreButtonRef} type="button" aria-expanded={moreOpen} aria-controls="mobile-more-panel"
          aria-label={activeSecondary ? `Mais · ${activeSecondary.shortLabel}` : undefined}
          className={activeSecondary || moreOpen ? "active" : ""} onClick={() => (moreOpen ? closeMore() : setMoreOpen(true))}>
          <MoreHorizontal size={19} aria-hidden="true" /><span>Mais</span>
        </button>
        {/* R1-SH-2: opaque sheet with a heading, full page names in one column, over a scrim that closes it. */}
        {moreOpen && <div ref={panelRef} id="mobile-more-panel" className="mobile-more-panel" role="group" aria-labelledby="mobile-more-title">
          <p className="mobile-more-title" id="mobile-more-title">Mais páginas</p>
          {secondaryNavigation.map(item => <NavLink key={item.id} item={item} page={page} onNavigate={navigateFromMore} />)}
        </div>}
      </div>
    </nav>
  </>;
}
