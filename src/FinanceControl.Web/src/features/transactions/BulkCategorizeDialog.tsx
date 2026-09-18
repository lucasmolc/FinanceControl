import { useState } from "react";
import { api } from "../../api/client";
import { Dialog } from "../../components/Dialog";
import { Field } from "../../components/ui";
import { CategoryIcon } from "../../components/ui/CategoryIcon";
import { Select } from "../../components/ui/Select";
import { countLabel, labelFor, transactionKindLabels } from "../../lib/labels";
import type { FinanceState, Notify, Transaction } from "../../types";

export interface BulkCategorizeDialogProps {
  rows: Transaction[];
  state: FinanceState;
  onClose: () => void;
  /** After saving (data already refreshed by the caller through `refresh`). */
  onDone: () => void;
  refresh: () => Promise<void>;
  notify: Notify;
  notifyError?: (reason: unknown) => void;
}

const KIND_ORDER = ["expense", "income", "investment"] as const;
const NONE = "__none__";

const launches = (count: number) => countLabel(count, "lançamento", "lançamentos");

/**
 * CR-16: one category for many transactions. Only transactions of the category's kind change (an expense cannot go to an
 * income category); "Sem categoria" clears them all. The notice offers "Desfazer" (previous categories are restored).
 */
export function BulkCategorizeDialog({ rows, state, onClose, onDone, refresh, notify, notifyError }: BulkCategorizeDialogProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kinds = KIND_ORDER.filter(kind => rows.some(row => row.kind === kind));
  const options = [
    { value: NONE, label: "Sem categoria" },
    ...kinds.map(kind => ({
      label: transactionKindLabels[kind]!,
      options: state.categories.filter(category => category.kind === kind)
        .map(category => ({ value: String(category.id), label: category.name, icon: <CategoryIcon icon={category.icon} color={category.color} name={category.name} kind={category.kind} size="sm" /> })),
    })).filter(group => group.options.length > 0),
  ];
  const category = value && value !== NONE ? state.categories.find(entry => String(entry.id) === value) : undefined;
  const targets = value === NONE ? rows : category ? rows.filter(row => row.kind === category.kind) : [];
  const skipped = rows.length - targets.length;
  const nextId = value === NONE ? null : category?.id ?? null;
  const changed = targets.filter(row => row.category_id !== nextId);

  async function apply() {
    if (!value) { setError("Escolha a categoria."); return; }
    setBusy(true);
    setError(null);
    const done: Array<{ id: number; previous: number | null }> = [];
    let failed = 0;
    for (const row of changed) {
      try {
        await api.update("transactions", row.id, { category_id: nextId });
        done.push({ id: row.id, previous: row.category_id });
      } catch {
        failed += 1;
      }
    }
    await refresh();
    setBusy(false);
    const target = category?.name ?? "Sem categoria";
    if (done.length) {
      notify(`${launches(done.length)} em ${target}.`, {
        label: "Desfazer",
        run: async () => {
          for (const item of done) await api.update("transactions", item.id, { category_id: item.previous });
          await refresh();
          notify("Categorias restauradas.");
        },
      });
    }
    if (failed) {
      const message = `${launches(failed)} não ${failed === 1 ? "pôde" : "puderam"} ser alterado${failed === 1 ? "" : "s"}. Abra cada um para revisar.`;
      if (notifyError) notifyError(new Error(message));
      else notify(message);
    }
    onDone();
  }

  const summary = !value ? `${launches(rows.length)} selecionado${rows.length === 1 ? "" : "s"}.`
    : `${launches(changed.length)} ${changed.length === 1 ? "muda" : "mudam"} para ${category?.name ?? "Sem categoria"}${skipped ? `; ${launches(skipped)} de outro tipo ${skipped === 1 ? "fica" : "ficam"} como ${skipped === 1 ? "está" : "estão"}` : ""}.`;

  return <Dialog title={`Categorizar ${launches(rows.length)}`} onClose={onClose} busy={busy}
    footer={<>
      <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="btn primary" disabled={busy || (Boolean(value) && !changed.length)} onClick={() => void apply()}>{busy ? "Salvando…" : "Categorizar"}</button>
    </>}>
    <div className="stack">
      <Field label="Categoria" error={error ?? undefined} hint={kinds.length > 1 ? `A seleção tem ${kinds.map(kind => labelFor(transactionKindLabels, kind).toLowerCase()).join(" e ")}; cada lançamento só recebe categoria do próprio tipo.` : undefined}>
        <Select options={options} value={value} placeholder="Escolha a categoria" onChange={next => { setValue(next); setError(null); }} />
      </Field>
      <p className="muted" role="status">{summary}</p>
    </div>
  </Dialog>;
}
