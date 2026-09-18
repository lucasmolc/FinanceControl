import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage, isConnectivityError } from "../../api/client";
import { connectivityStatus, subscribeConnectivity } from "../../api/connectivity";
import { ConfirmContext } from "../../components/confirmContext";
import { Dialog } from "../../components/Dialog";
import { formatMonthLabel } from "../../lib/date";
import type { FinanceState, FormState, ModalKind } from "../../types";
import { OFFLINE_REASON } from "./offline";
import { recordForms } from "./registry";
import type { FormContext, FormErrors, RecordFormDefinition, SavedOptions, SavedUndo } from "./types";

export interface RecordModalProps {
  kind: ModalKind;
  mode: "create" | "edit";
  initial: FormState;
  id?: number;
  state: FinanceState;
  month: string;
  onClose: () => void;
  /**
   * Called after a successful save with the definition's success message (and an undo, when the flow offers one). The dialog
   * stays busy until it settles. `options.keepOpen` ("Salvar e lançar outro", CR-15) asks the host to refresh without closing.
   */
  onSaved: (message: string, undo?: SavedUndo, options?: SavedOptions) => void | Promise<void>;
  /** R1 decision 4: the local server is unreachable — saving is disabled (the form keeps what was typed). */
  offline?: boolean;
  /**
   * R3-REC-2: the host's "Reabrir mês" (confirm + reopen + refresh); resolves true when reopened. Without it the form
   * confirms and reopens by itself.
   */
  onReopenMonth?: (month: string) => Promise<boolean>;
}

/**
 * R1-REC-3: the phone footer shows the short label ("Salvar e outro") by hiding the other words with CSS, so the visible
 * text is always part of the accessible name.
 */
function saveLabelWords(label: string, short: string) {
  const keep = short.split(" ");
  const words = label.split(" ");
  // R3-REC-3: one inline wrapper, so the button's flex gap is not added between the words (it doubled the spaces).
  return <span className="btn-label">{words.map((word, index) => <span key={index} className={keep.includes(word) ? undefined : "label-drop"}>{index > 0 ? " " : ""}{word}</span>)}</span>;
}

const SAVE_FAILED = "Não foi possível salvar. Revise os dados e tente novamente.";
/** R4-REC-1: the banner's wording, plus what happens to what was typed. */
const SAVE_OFFLINE = "Sem conexão com o servidor local. Seus dados continuam aqui; salve quando ele voltar.";
const RECONNECTED = "Conexão restabelecida. Tente salvar de novo.";

/** Keys the form fills by itself (suggested brand, market rate, "touched" flags): they never make the form "dirty". */
const DERIVED_KEY = /(^brand$|^exchange_rate$|_touched$|_autofix$)/;

/** R3-REC-1: true when something the user typed or chose differs from what the form opened with. */
function isDirty(form: FormState, baseline: FormState): boolean {
  const keys = new Set([...Object.keys(form), ...Object.keys(baseline)]);
  const norm = (value: FormState[string]) => (value === undefined || value === null ? "" : String(value));
  for (const key of keys) {
    if (DERIVED_KEY.test(key) || norm(form[key]) === norm(baseline[key])) continue;
    // R4-REC-2: a date the form moved by itself ("Usar 01/10/2026" out of a closed month) is not a user change.
    if (form[`${key}_autofix`] !== undefined && norm(form[key]) === norm(form[`${key}_autofix`])) continue;
    return true;
  }
  return false;
}

async function submitDefinition(definition: RecordFormDefinition, form: FormState, ctx: FormContext): Promise<SavedUndo | undefined> {
  if (definition.submit) return (await definition.submit(form, ctx)) ?? undefined;
  if (!definition.module) throw new Error("Formulário sem destino de gravação.");
  const payload = definition.toPayload ? definition.toPayload(form, ctx) : { ...form };
  if (ctx.mode === "edit") {
    if (ctx.id === undefined) throw new Error("Registro sem identificador para edição.");
    await api.update(definition.module, ctx.id, payload);
  } else {
    await api.create(definition.module, payload);
  }
  return undefined;
}

/** Splits API field errors into rendered form fields and form-level messages. */
function mapApiErrors(error: ApiError, definition: RecordFormDefinition, hasField: (key: string) => boolean): { fields: FormErrors; general: string[] } {
  const fields: FormErrors = {};
  const general: string[] = [];
  for (const [apiField, message] of Object.entries(error.fields)) {
    const key = definition.apiFieldMap?.[apiField] ?? apiField;
    if (hasField(key) && !fields[key]) fields[key] = message;
    else general.push(message);
  }
  return { fields, general };
}

export function RecordModal({ kind, mode, initial, id, state, month, onClose, onSaved, offline = false, onReopenMonth }: RecordModalProps) {
  const definition = recordForms[kind];
  const confirm = useContext(ConfirmContext) ?? undefined;
  const [closedMonths, setClosedMonths] = useState<string[] | undefined>(undefined);
  const usesClosedMonths = Boolean(definition.usesClosedMonths);
  /** R3-REC-2: reopens a closed month from inside the form (the host's flow when given) and forgets it as closed. */
  const reopenMonth = useCallback(async (target: string): Promise<boolean> => {
    let reopened = false;
    if (onReopenMonth) reopened = await onReopenMonth(target);
    else if (confirm && await confirm({
      title: `Reabrir ${formatMonthLabel(target)}?`,
      message: "Lançamentos, contas e movimentações deste mês voltam a poder ser alterados. Você pode fechar o mês de novo depois.",
      confirmLabel: "Reabrir mês", cancelLabel: "Cancelar", tone: "primary",
    })) {
      try { await api.reopenMonth(target); reopened = true; } catch (reason) { setFormError(errorMessage(reason, "Não foi possível reabrir o mês.")); }
    }
    if (reopened) setClosedMonths(current => current?.filter(item => item !== target));
    return reopened;
  }, [confirm, onReopenMonth]);
  const ctx = useMemo<FormContext>(() => ({ state, month, mode, id, confirm, closedMonths, reopenMonth }), [state, month, mode, id, confirm, closedMonths, reopenMonth]);

  // MEL-44: closed months for movement forms (failures just skip the client-side guard; the API still blocks).
  useEffect(() => {
    if (!usesClosedMonths) return;
    let active = true;
    Promise.resolve()
      .then(() => api.closings())
      .then(closings => { if (active && Array.isArray(closings)) setClosedMonths(closings.map(item => item.month)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [usesClosedMonths]);
  const [form, setForm] = useState<FormState>(() => mode === "create" && definition.defaults ? definition.defaults({ state, month, mode, id }, initial) : { ...initial });
  /** R3-REC-1: what the form opened with (or restarted with after "Salvar e lançar outro"). */
  const [baseline, setBaseline] = useState<FormState>(form);
  const closingRef = useRef(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** CR-15: confirmation kept inside the dialog after "Salvar e lançar outro". */
  const [savedNote, setSavedNote] = useState<string | null>(null);
  /** R4-REC-1: the last save failed for lack of connection — its error is replaced by a note once the server answers. */
  const [connectionLost, setConnectionLost] = useState(false);
  const [reconnectNote, setReconnectNote] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const formId = useId();
  const Fields = definition.Fields;

  const set = (key: string, value: FormState[string]) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFormError(null);
    setSavedNote(null);
    setReconnectNote(null);
  };

  useEffect(() => {
    if (!connectionLost) return;
    const recover = () => { setConnectionLost(false); setFormError(null); setReconnectNote(RECONNECTED); };
    if (connectivityStatus() === "online" && !offline) { recover(); return; }
    return subscribeConnectivity(status => { if (status === "online") recover(); });
  }, [connectionLost, offline]);

  useEffect(() => {
    if (!Object.keys(errors).length) return;
    const frame = window.requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [errors]);

  const hasField = (key: string) => Boolean(bodyRef.current?.querySelector(`[name="${key}"]`));

  const saveAndNew = mode === "create" ? definition.saveAndNew : undefined;

  async function save(event: Pick<FormEvent, "preventDefault">, again = false) {
    event.preventDefault();
    if (busy || offline || definition.submitDisabledReason?.(ctx, form)) return;
    const nextErrors = definition.validate(form, ctx);
    setErrors(nextErrors);
    setFormError(null);
    setReconnectNote(null);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    let undo: SavedUndo | undefined;
    try {
      undo = await submitDefinition(definition, form, ctx);
    } catch (reason) {
      setBusy(false);
      if (reason instanceof ApiError && Object.keys(reason.fields).length) {
        const mapped = mapApiErrors(reason, definition, hasField);
        setErrors(mapped.fields);
        setFormError(mapped.general.length ? mapped.general.join(" ") : null);
      } else if (isConnectivityError(reason)) {
        setFormError(SAVE_OFFLINE);
        setConnectionLost(true);
      } else {
        setFormError(errorMessage(reason, SAVE_FAILED));
      }
      return;
    }
    const message = definition.successMessage(ctx, form);
    if (again && saveAndNew) {
      // The host refreshes and keeps the dialog open; the form starts over with what repeats (date, payment method…).
      try { await onSaved(message, undo, { keepOpen: true }); }
      finally { setBusy(false); }
      const next = saveAndNew.next(form, ctx);
      setForm(next);
      setBaseline(next);
      setErrors({});
      setSavedNote(saveAndNew.message ?? `${message} Pronto para o próximo.`);
      window.requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
      return;
    }
    // Stay busy while the app refreshes and closes the dialog, so the save cannot be repeated.
    try { await (undo ? onSaved(message, undo) : onSaved(message)); }
    finally { setBusy(false); }
  }

  /**
   * R3-REC-1: Esc, ✕, the scrim and Cancelar ask before throwing away what was typed ("Descartar" / "Continuar editando").
   * Without a confirm host (isolated renders) the dialog just closes.
   */
  const requestClose = async () => {
    if (busy || closingRef.current) return;
    if (!confirm || !isDirty(form, baseline)) { onClose(); return; }
    closingRef.current = true;
    try {
      const discard = await confirm({
        title: "Descartar o que foi preenchido?",
        message: "As informações digitadas neste formulário ainda não foram salvas e serão perdidas.",
        confirmLabel: "Descartar",
        cancelLabel: "Continuar editando",
        tone: "danger",
      });
      if (discard) onClose();
    } finally {
      closingRef.current = false;
    }
  };
  const close = () => void requestClose();

  const submitLabel = definition.submitLabel?.(ctx, form) ?? "Salvar";
  const disabledReason = offline ? OFFLINE_REASON : definition.submitDisabledReason?.(ctx, form);

  return <Dialog
    title={definition.title(ctx, form)}
    onClose={close}
    busy={busy}
    size={definition.size}
    footer={<>
      {offline && <small className="record-offline" role="status">{OFFLINE_REASON}</small>}
      <button type="button" className="btn ghost record-cancel" disabled={busy} onClick={close}>Cancelar</button>
      {saveAndNew && <button type="button" className="btn save-and-new" disabled={busy || Boolean(disabledReason)} title={disabledReason} onClick={event => void save(event, true)}>
        {saveLabelWords(saveAndNew.label, saveAndNew.shortLabel ?? "Salvar e outro")}
      </button>}
      <button type="submit" form={formId} className="btn primary" disabled={busy || Boolean(disabledReason)} title={disabledReason}>{busy ? "Salvando…" : submitLabel}</button>
    </>}
  >
    <form id={formId} className="stack" noValidate aria-busy={busy} onSubmit={event => void save(event)}>
      <div ref={bodyRef} className="stack">
        {formError && <div className="form-error" role="alert"><b>Não foi possível salvar.</b> <span>{formError}</span></div>}
        {reconnectNote && <p className="form-saved" role="status">{reconnectNote}</p>}
        {saveAndNew && <p className="form-saved" role="status" aria-live="polite">{savedNote}</p>}
        <Fields form={form} set={set} errors={errors} ctx={ctx} />
      </div>
    </form>
  </Dialog>;
}
