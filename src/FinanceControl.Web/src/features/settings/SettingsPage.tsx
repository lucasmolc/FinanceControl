import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { Calculator, Compass, Copy, Database, Download, FileJson, LockOpen, Pencil, SlidersHorizontal } from "lucide-react";
import { ApiError, api, errorMessage } from "../../api/client";
import { OFFLINE_REASON } from "../../api/insights";
import { ToastContext } from "../../components/toastContext";
import { useConfirm } from "../../components/useConfirm";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { Badge, Field, Money, MoneyInput } from "../../components/ui";
import { FileUpload } from "../../components/ui/FileUpload";
import { useAsyncList } from "../../hooks/useAsyncList";
import { useMoneyFormat } from "../../hooks/useMoneyFormat";
import { formatDate } from "../../lib/date";
import type { AboutInfo, Notify, PageProps, Settings } from "../../types";
import { monthTitle, monthTotals } from "../closing/closingModel";
import { planFigures, planFromSettings, planName } from "../plan/planModel";
import { AppearanceSection } from "./AppearanceSection";
import { PlanSection } from "./PlanSection";
import { MobileCollapse } from "./MobileCollapse";
import { MarketSection, ReserveSection } from "./SettingsSections";
import {
  activeSection, backupExportedText, backupRowCount, draftFrom, isPlanningDirty, limitAdvice, mapApiFields, monthsValue, optionalMoney, parseBackup, planningPayload, readFileText, RESERVE_NEEDS_INCOME, reserveFormula, SETTINGS_OPEN_SECTION, validatePlanning,
  type PlanningDraft, type PlanningErrors,
} from "./settingsModel";

type SettingsPageProps = PageProps & {
  onError: (message: string) => void;
  /** MEL-25: replay the guided tour on the Painel. */
  onReplayTour?: () => void;
  /** MEL-25: open the setup wizard in revisiting mode. */
  onRevisitSetup?: () => void;
};

function PlanningForm({ settings, refresh, onError, saved, setSaved, onEditPlan, offline = false }: { settings: Settings; refresh: () => Promise<void>; onError: (message: string) => void; saved: boolean; setSaved: (value: boolean) => void; onEditPlan?: () => void; offline?: boolean }) {
  const [draft, setDraft] = useState<PlanningDraft>(() => draftFrom(settings));
  const [errors, setErrors] = useState<PlanningErrors>({});
  const [busy, setBusy] = useState(false);
  const fmt = useMoneyFormat();
  const dirty = isPlanningDirty(draft, settings);
  const incomeCents = optionalMoney(draft.income);
  const months = monthsValue(draft.months);
  const reserve = reserveFormula(incomeCents, months, value => fmt(value));
  const advice = limitAdvice(draft);
  // Decision 1: with a plan the teto is fixos + lazer; say it where the teto is edited.
  const plan = planFromSettings(settings);
  // R3-CFG-1: with an active plan the teto belongs to the plan (read-only here; "Editar plano" changes it), so saving
  // Perfil can never silently diverge from the plan card.
  const planLimit = plan && settings.monthly_net_income_cents > 0 ? planFigures(settings.monthly_net_income_cents, plan).limitCents : null;
  const draftIncome = optionalMoney(draft.income);
  const limitHint = plan && planLimit !== null
    ? draftIncome !== null && draftIncome > 0 && draftIncome !== settings.monthly_net_income_cents
      ? `Definido pelo plano ${planName(plan)} (fixos + lazer). Com a nova renda, o plano passa a ${fmt(planFigures(draftIncome, plan).limitCents)} quando for aplicado de novo em Editar plano.`
      : settings.monthly_spending_limit_cents !== planLimit
      ? `Definido pelo plano ${planName(plan)}: fixos + lazer = ${fmt(planLimit)}. O teto salvo é outro; aplique o plano de novo em Editar plano para alinhar.`
      : `Definido pelo plano ${planName(plan)}: fixos + lazer. Para mudar, edite o plano.`
    : "Referência para o disponível no orçamento.";
  useUnsavedChanges(dirty);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (key: keyof PlanningDraft, value: string) => {
    setDraft(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
    setSaved(false);
  };

  const discard = () => { setDraft(draftFrom(settings)); setErrors({}); };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty || busy || offline) return;
    const nextErrors = validatePlanning(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    try {
      await api.settings(planningPayload(draft));
      setSaved(true);
      await refresh();
    } catch (reason) {
      const fieldErrors = reason instanceof ApiError ? mapApiFields(reason.fields) : {};
      if (Object.keys(fieldErrors).length) setErrors(fieldErrors);
      else onError(errorMessage(reason, "Não foi possível salvar as configurações."));
    } finally {
      setBusy(false);
    }
  }

  return <section className="card settings-planning" aria-labelledby="planning-title">
    <div className="settings-heading card-header">
      <div><h2 id="planning-title" tabIndex={-1}>Perfil e planejamento</h2><p className="muted">Atualize sua renda, o teto de gastos do mês e a reserva a qualquer momento. O painel usa esses valores como referência.</p></div>
      {dirty && <Badge tone="warning">Alterações não salvas</Badge>}
    </div>
    <form className="stack" noValidate onSubmit={event => void save(event)}>
      <Field label="Nome" optional hint="Quando preenchido, aparece na saudação do painel." error={errors.name}>
        <input maxLength={120} autoComplete="name" placeholder="Como você prefere ser chamado" value={draft.name} onChange={event => update("name", event.target.value)} />
      </Field>
      <div className="form-grid">
        <Field label="Renda líquida mensal" optional hint="Valor que entra por mês, já descontado." error={errors.income}>
          <MoneyInput value={draft.income} onChange={text => update("income", text)} />
        </Field>
        {planLimit !== null
          ? <div className="settings-plan-limit">
            <Field label="Teto de gastos do mês" hint={limitHint} error={errors.limit}>
              <input type="text" readOnly value={fmt(settings.monthly_spending_limit_cents)} />
            </Field>
            {onEditPlan && <button type="button" className="btn small ghost" disabled={offline} title={offline ? OFFLINE_REASON : undefined} onClick={onEditPlan}><Pencil size={14} aria-hidden="true" />Editar plano</button>}
          </div>
          : <Field label="Teto de gastos do mês" optional hint={advice ?? limitHint} error={errors.limit}>
            <MoneyInput value={draft.limit} onChange={text => update("limit", text)} />
          </Field>}
      </div>
      <Field label="Meses de reserva" hint="Quantos meses de salário líquido a reserva de emergência deve cobrir (1 a 120)." error={errors.months}>
        <input type="number" inputMode="numeric" min="1" max="120" step="1" required value={draft.months} onChange={event => update("months", event.target.value)} />
      </Field>
      <div className={`reserve-calculation${reserve ? "" : " is-empty"}`}>
        <span className="reserve-icon" aria-hidden="true"><Calculator size={20} /></span>
        <div>
          <span className="label">Meta estimada da reserva</span>
          <strong>{reserve ? <Money cents={reserve.targetCents} /> : "—"}</strong>
          <small>{reserve ? reserve.text : incomeCents === null || months === null ? "Corrija os campos destacados para calcular." : RESERVE_NEEDS_INCOME}</small>
        </div>
      </div>
      <div className="settings-actions">
        <button className="btn primary" type="submit" disabled={!dirty || busy || offline} title={offline ? OFFLINE_REASON : undefined} aria-busy={busy || undefined}>{busy ? "Salvando…" : "Salvar configurações"}</button>
        {dirty && <button className="btn ghost" type="button" disabled={busy} onClick={discard}>Descartar alterações</button>}
        {/* R2-CFG-3: a disabled Save always says why (nothing changed, or no server) instead of only a title. */}
        <span className={`save-confirmation${offline || !(saved && !dirty) ? " is-hint" : ""}`} role="status">{offline ? "Sem conexão com o servidor local: salvar fica pausado até ele voltar." : saved && !dirty ? "Configurações salvas." : !dirty ? "Sem alterações para salvar." : ""}</span>
      </div>
    </form>
  </section>;
}

const BACKUP_TYPES = ["application/json", ".json"];

function BackupSection({ refresh, notify, onError, offline = false }: { refresh: () => Promise<void>; notify: Notify; onError: (reason: unknown) => void; offline?: boolean }) {
  const confirm = useConfirm();
  const toastApi = useContext(ToastContext);
  const [safetyCopy, setSafetyCopy] = useState<string | null>(null);
  const [about, setAbout] = useState<AboutInfo | null>(null);
  const [aboutError, setAboutError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);

  useEffect(() => {
    let active = true;
    api.about()
      .then(info => { if (active) setAbout(info); })
      .catch(() => { if (active) setAboutError(true); });
    return () => { active = false; };
  }, []);

  async function restoreFrom(file: File) {
    // Start from an empty picker afterwards (the same file can be chosen again).
    setUploadKey(value => value + 1);
    let document;
    try { document = parseBackup(await readFileText(file)); }
    catch (reason) { onError(reason); return; }

    const rows = backupRowCount(document);
    // R4-CFG-2: say when the copy was made, so an old file is not restored by mistake.
    const exported = backupExportedText(document);
    const confirmed = await confirm({
      title: "Restaurar cópia de segurança?",
      message: `Todos os dados atuais serão substituídos pelo conteúdo de "${file.name}" (${rows} ${rows === 1 ? "registro" : "registros"}${exported ? `, ${exported}` : ""}). Antes da troca, o aplicativo salva automaticamente uma cópia do banco atual na pasta de backups, para que você possa voltar atrás.`,
      confirmLabel: "Substituir dados",
      cancelLabel: "Cancelar",
      tone: "danger",
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await api.restoreBackup(document);
      await refresh();
      setSafetyCopy(result.safety_copy);
      // R1-CFG-7: short message (file name, not the whole path), a "Copiar caminho" action and a long timer (pauses on hover/focus).
      const message = `Cópia restaurada. Os dados anteriores foram salvos em ${fileName(result.safety_copy)}.`;
      const action = { label: "Copiar caminho", run: () => copyPath(result.safety_copy, "Caminho da cópia automática copiado.") };
      if (toastApi) toastApi.toast({ message, tone: "success", duration: 20_000, action });
      else notify(message, action);
    } catch (reason) {
      onError(new Error(errorMessage(reason, "Não foi possível restaurar a cópia de segurança.")));
    } finally {
      setBusy(false);
    }
  }

  async function copyPath(path: string, done = "Caminho do banco copiado.") {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard");
      await navigator.clipboard.writeText(path);
      notify(done);
    } catch {
      onError(new Error(`Não foi possível copiar. O caminho é ${path}`));
    }
  }

  return <section className="card settings-data" aria-labelledby="backup-title" aria-busy={busy || undefined}>
    <div className="card-header"><div><h2 id="backup-title" tabIndex={-1}>Cópia de segurança</h2><p className="muted">Seus dados ficam só neste computador. Guarde uma cópia antes de atualizações ou para ter uma garantia independente.</p></div></div>
    <MobileCollapse section="copia" summary="Exportar, restaurar e local do banco" open={busy || safetyCopy !== null}>
    <div className="stack">
      <a className="btn row" href={api.backupUrl} download><span>Exportar dados (JSON)</span><FileJson size={16} aria-hidden="true" /></a>
      <p className="local-data-note">Arquivo legível com todos os registros; é o formato usado para restaurar.</p>
      <a className="btn row" href={api.databaseBackupUrl} download><span>Baixar cópia do banco (.db)</span><Download size={16} aria-hidden="true" /></a>
      <p className="local-data-note">Cópia exata do banco SQLite, para guardar ou abrir em outra ferramenta.</p>
      <FileUpload key={uploadKey} readAs="file" accept={BACKUP_TYPES} acceptLabel="JSON" maxBytes={50 * 1024 * 1024} preview={false} disabled={busy || offline}
        label="Arquivo da cópia de segurança (JSON)"
        hint={offline ? `${OFFLINE_REASON} Restaurar fica disponível quando a conexão voltar.` : busy ? "Restaurando…" : "Restaurar: substitui todos os dados atuais pelo conteúdo de um arquivo JSON exportado aqui. Uma cópia automática é feita antes."}
        onFile={file => void restoreFrom(file)} />
      {safetyCopy && <div className="local-data-note safety-copy" role="note">
        <p>Cópia automática feita antes da última restauração:</p>
        <p className="database-file"><code title={safetyCopy}>{fileName(safetyCopy)}</code>
          <button type="button" className="btn small ghost" onClick={() => void copyPath(safetyCopy, "Caminho da cópia automática copiado.")}><Copy size={14} aria-hidden="true" />Copiar caminho</button></p>
      </div>}
      <div className="local-data-note database-location">
        <p className="row"><Database size={16} aria-hidden="true" /><span>Banco de dados local</span></p>
        {about
          ? <>
            <p className="database-file"><code title={about.database_path}>{fileName(about.database_path)}</code>
              <button type="button" className="btn small ghost" onClick={() => void copyPath(about.database_path)}><Copy size={14} aria-hidden="true" />Copiar caminho</button></p>
            <details className="database-path"><summary>Ver caminho completo</summary><code>{about.database_path}</code></details>
            <small>Versão do esquema: {about.schema_version}</small>
          </>
          : <small role="status">{aboutError ? "Não foi possível obter o local do banco." : "Carregando local do banco…"}</small>}
      </div>
    </div>
    </MobileCollapse>
  </section>;
}

/** MEL-22: closed months with notes and "Reabrir". */
function ClosingsSection({ version, onReopenMonth, offline = false }: { version: number; onReopenMonth?: (month: string) => Promise<boolean>; offline?: boolean }) {
  const closings = useAsyncList(() => api.closings(), `closings:${version}`);
  const [busyMonth, setBusyMonth] = useState<string | null>(null);
  const rows = [...closings.items].sort((left, right) => right.month.localeCompare(left.month));

  async function reopen(month: string) {
    if (!onReopenMonth) return;
    setBusyMonth(month);
    try { await onReopenMonth(month); } finally { setBusyMonth(null); }
  }

  return <section className="card settings-closings" aria-labelledby="closings-title">
    <div className="card-header"><div><h2 id="closings-title" tabIndex={-1}>Fechamentos</h2><p className="muted">Meses fechados ficam travados para edição. Reabra um mês para corrigir algo.</p></div></div>
    {closings.error && !rows.length ? <div className="stack" role="alert">
      <p className="muted">{closings.error}</p>
      <div><button type="button" className="btn small" onClick={() => void closings.reload()}>Tentar novamente</button></div>
    </div> : !rows.length ? <p className="muted" role="status">{closings.loading ? "Carregando fechamentos…" : "Nenhum mês fechado ainda. Feche um mês pelo Painel ou por Lançamentos."}</p>
      // R2-CFG-2: the list is one line until opened (the page stays short).
      : <details className="settings-disclosure">
        <summary>{rows.length === 1 ? "1 mês fechado" : `${rows.length} meses fechados`}<span className="muted"> · o mais recente: {monthTitle(rows[0]!.month).toLowerCase()}</span></summary>
        <ul className="list" aria-label="Meses fechados">{rows.map(item => {
        const totals = item.summary ? monthTotals(item.summary) : null;
        return <li className="list-item" key={item.month}>
          <div className="list-main">
            <b>{monthTitle(item.month)}</b>
            <small className="muted">Fechado em {formatDate(item.closed_at)}{item.notes ? ` · ${item.notes}` : ""}</small>
          </div>
          <div className="list-amount">{totals ? <span>Resultado <Money cents={totals.resultCents} signed /></span> : <span className="muted">—</span>}</div>
          {onReopenMonth && <button type="button" className="btn small ghost" disabled={busyMonth !== null || offline} title={offline ? OFFLINE_REASON : undefined} aria-label={`Reabrir ${monthTitle(item.month).toLowerCase()}`} onClick={() => void reopen(item.month)}>
            <LockOpen size={14} aria-hidden="true" />{busyMonth === item.month ? "Reabrindo…" : "Reabrir"}
          </button>}
        </li>;
      })}</ul>
      </details>}
  </section>;
}

/** MEL-25: replay the tour or revisit the initial planning. */
function HelpSection({ onReplayTour, onRevisitSetup }: { onReplayTour?: () => void; onRevisitSetup?: () => void }) {
  if (!onReplayTour && !onRevisitSetup) return null;
  return <section className="card settings-help" aria-labelledby="help-title">
    <div className="card-header"><div><h2 id="help-title" tabIndex={-1}>Ajuda</h2><p className="muted">Reveja a apresentação do painel ou refaça o planejamento inicial quando quiser.</p></div></div>
    <MobileCollapse section="ajuda" summary="Rever o tour ou o planejamento inicial">
      <div className="stack">
        {onReplayTour && <button type="button" className="btn row" onClick={onReplayTour}><span>Rever tour guiado</span><Compass size={16} aria-hidden="true" /></button>}
        {onRevisitSetup && <button type="button" className="btn row" onClick={onRevisitSetup}><span>Revisar planejamento inicial</span><SlidersHorizontal size={16} aria-hidden="true" /></button>}
      </div>
    </MobileCollapse>
  </section>;
}

/** "C:\…\Data\finance.db" → "finance.db". */
const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

const SECTIONS = [
  { id: "perfil", heading: "planning-title", label: "Perfil" },
  { id: "plano", heading: "plan-title", label: "Plano 70-20-10" },
  { id: "reserva", heading: "reserve-title", label: "Reserva" },
  { id: "aparencia", heading: "appearance-title", label: "Aparência" },
  { id: "mercado", heading: "market-title", label: "Mercado" },
  { id: "copia", heading: "backup-title", label: "Cópia de segurança" },
  { id: "fechamentos", heading: "closings-title", label: "Fechamentos" },
  { id: "ajuda", heading: "help-title", label: "Ajuda" },
] as const;

/** After a click the smooth scroll runs for a while: keep the clicked item active meanwhile. */
const CLICK_PIN_MS = 900;

/**
 * CR-22: section index — sticky side list on desktop, scrollable pills on phones; highlights the section on screen.
 * R1-CFG-4: positions are read on scroll (any scroll container) instead of guessing from intersection entries, and a
 * click activates its item immediately and pins it while the smooth scroll runs.
 */
function SettingsIndex({ ids }: { ids: readonly string[] }) {
  const [active, setActive] = useState<string>(ids[0] ?? "");
  const items = SECTIONS.filter(item => ids.includes(item.id));
  const listRef = useRef<HTMLUListElement>(null);
  const pinnedUntil = useRef(0);
  const key = ids.join("|");

  useEffect(() => {
    const list = key.split("|");
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (Date.now() < pinnedUntil.current) return;
      const tops = list.flatMap(id => {
        const element = document.getElementById(`settings-${id}`);
        return element ? [{ id, top: element.getBoundingClientRect().top }] : [];
      });
      const scroller = document.scrollingElement ?? document.documentElement;
      const atBottom = scroller.scrollHeight - scroller.scrollTop - window.innerHeight < 4 && scroller.scrollTop > 0;
      const next = activeSection(tops, window.innerHeight, atBottom);
      if (next) setActive(next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => { if (frame) cancelAnimationFrame(frame); document.removeEventListener("scroll", schedule, { capture: true }); window.removeEventListener("resize", schedule); };
  }, [key]);

  // R4-CFG-1: on phones the pills scroll sideways — fade the edge that has more pills behind it.
  const [overflow, setOverflow] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      const left = list.scrollLeft > 4;
      const right = list.scrollWidth - list.clientWidth - list.scrollLeft > 4;
      setOverflow(current => current.left === left && current.right === right ? current : { left, right });
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { list.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [key]);

  // Keep the active pill in view in the horizontal (phone) index.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>(`[data-section="${active}"]`)?.parentElement;
    if (list && current && list.scrollWidth > list.clientWidth) {
      // R4-CFG-1: scroll only when the pill is (partly) hidden, leaving part of the next pill visible as a cue.
      const start = current.offsetLeft - list.offsetLeft;
      const end = start + current.offsetWidth;
      if (start < list.scrollLeft) list.scrollTo?.({ left: Math.max(0, start - 16) });
      else if (end > list.scrollLeft + list.clientWidth) list.scrollTo?.({ left: end - list.clientWidth + 48 });
    }
  }, [active]);

  const go = (id: string, heading: string) => {
    setActive(id);
    pinnedUntil.current = Date.now() + CLICK_PIN_MS;
    window.dispatchEvent(new CustomEvent(SETTINGS_OPEN_SECTION, { detail: id }));
    const reduce = document.documentElement.dataset.motion === "off" || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    document.getElementById(`settings-${id}`)?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
    document.getElementById(heading)?.focus({ preventScroll: true });
  };

  return <nav className="settings-index" aria-label="Seções das configurações">
    <ul ref={listRef} className={[overflow.left ? "has-more-left" : "", overflow.right ? "has-more-right" : ""].filter(Boolean).join(" ") || undefined}>
      {items.map(item => <li key={item.id}>
        <button type="button" data-section={item.id} aria-current={active === item.id ? "true" : undefined} onClick={() => go(item.id, item.heading)}>{item.label}</button>
      </li>)}
    </ul>
  </nav>;
}

export function SettingsPage({ state, version, refresh, notify, notifyError, onError, onReopenMonth, onReplayTour, onRevisitSetup, navigate, offline = false }: SettingsPageProps) {
  const settings = state.settings;
  const [saved, setSaved] = useState(false);
  const baselineKey = [settings.display_name, settings.monthly_net_income_cents, settings.monthly_spending_limit_cents, settings.emergency_months_target].join("|");
  /** Action failures → error toast (MEL-28). */
  const fail = (reason: unknown) => { if (notifyError) notifyError(reason); else onError(errorMessage(reason)); };
  const hasHelp = Boolean(onReplayTour || onRevisitSetup);
  const ids = SECTIONS.map(item => item.id as string).filter(id => id !== "ajuda" || hasHelp);
  // R3-CFG-1: "Editar plano" from the Teto field opens the plan editor and brings it into view.
  const [planEditRequest, setPlanEditRequest] = useState(0);
  const editPlan = () => {
    setPlanEditRequest(value => value + 1);
    const reduce = document.documentElement.dataset.motion === "off" || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    document.getElementById("settings-plano")?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
    document.getElementById("plan-title")?.focus({ preventScroll: true });
  };

  return <div className="settings-layout">
    <SettingsIndex ids={ids} />
    <div className="settings-content">
      <div id="settings-perfil" className="settings-anchor"><PlanningForm key={baselineKey} settings={settings} refresh={refresh} onError={onError} saved={saved} setSaved={setSaved} onEditPlan={editPlan} offline={offline} /></div>
      <div id="settings-plano" className="settings-anchor"><PlanSection state={state} refresh={refresh} notify={notify} onError={fail} navigate={navigate} offline={offline} editRequest={planEditRequest} /></div>
      <div id="settings-reserva" className="settings-anchor"><ReserveSection state={state} refresh={refresh} notify={notify} onError={fail} navigate={navigate} offline={offline} /></div>
      <div id="settings-aparencia" className="settings-anchor"><AppearanceSection onError={fail} /></div>
      <div id="settings-mercado" className="settings-anchor"><MarketSection state={state} refresh={refresh} notify={notify} onError={fail} navigate={navigate} offline={offline} /></div>
      <div id="settings-copia" className="settings-anchor"><BackupSection refresh={refresh} notify={notify} onError={fail} offline={offline} /></div>
      <div id="settings-fechamentos" className="settings-anchor"><ClosingsSection version={version} onReopenMonth={onReopenMonth} offline={offline} /></div>
      {hasHelp && <div id="settings-ajuda" className="settings-anchor"><HelpSection onReplayTour={onReplayTour} onRevisitSetup={onRevisitSetup} /></div>}
    </div>
  </div>;
}
