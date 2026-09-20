import { useState } from "react";
import { api } from "../../api/client";
import { Dialog } from "../../components/Dialog";
import { Field } from "../../components/ui";
import { BrandBadge } from "../../components/ui/BrandBadge";
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
const KEEP = "";

const launches = (count: number) => countLabel(count, "lançamento", "lançamentos");

/** Campos alterados em um lançamento, guardados para o "Desfazer". */
interface Change { id: number; previous: Record<string, number | null>; }

/**
 * CR-16: uma categoria para vários lançamentos. Só muda os do tipo da categoria (uma despesa não vai para uma
 * categoria de receita); "Sem categoria" limpa todos. v1.4: também define o cartão, que é o ajuste mais comum depois
 * de importar uma fatura com cartões adicionais. O aviso oferece "Desfazer" (os valores anteriores voltam).
 */
export function BulkCategorizeDialog({ rows, state, onClose, onDone, refresh, notify, notifyError }: BulkCategorizeDialogProps) {
  const [value, setValue] = useState("");
  const [cardValue, setCardValue] = useState(KEEP);
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
  const cardOptions = [
    { value: KEEP, label: "Não alterar" },
    ...state.cards.map(card => ({
      value: String(card.id),
      label: card.last_digits ? `${card.name} · final ${card.last_digits}` : card.name,
      icon: <BrandBadge brand={card.brand} name={card.name} kind="bank" size="sm" decorative />,
    })),
  ];

  const category = value && value !== NONE ? state.categories.find(entry => String(entry.id) === value) : undefined;
  const targets = value === NONE ? rows : category ? rows.filter(row => row.kind === category.kind) : [];
  const skipped = rows.length - targets.length;
  const nextId = value === NONE ? null : category?.id ?? null;
  const categoryChanges = value ? targets.filter(row => row.category_id !== nextId) : [];

  // O cartão só se aplica a compras no cartão (uma despesa em Pix não entra em fatura).
  const cardRows = rows.filter(row => row.payment_method === "card");
  const nextCardId = cardValue === KEEP ? null : Number(cardValue);
  const cardChanges = cardValue === KEEP ? [] : cardRows.filter(row => row.card_id !== nextCardId);
  const card = state.cards.find(item => String(item.id) === cardValue);
  const changedIds = new Set([...categoryChanges, ...cardChanges].map(row => row.id));

  async function apply() {
    if (!value && cardValue === KEEP) { setError("Escolha a categoria ou o cartão."); return; }
    setBusy(true);
    setError(null);
    const categoryIds = new Set(categoryChanges.map(row => row.id));
    const cardIds = new Set(cardChanges.map(row => row.id));
    const done: Change[] = [];
    let failed = 0;
    for (const row of rows.filter(item => changedIds.has(item.id))) {
      const payload: Record<string, number | null> = {};
      const previous: Record<string, number | null> = {};
      if (categoryIds.has(row.id)) { payload.category_id = nextId; previous.category_id = row.category_id; }
      if (cardIds.has(row.id)) { payload.card_id = nextCardId; previous.card_id = row.card_id ?? null; }
      try {
        await api.update("transactions", row.id, payload);
        done.push({ id: row.id, previous });
      } catch {
        failed += 1;
      }
    }
    await refresh();
    setBusy(false);
    if (done.length) {
      const target = [value ? `em ${category?.name ?? "Sem categoria"}` : null, card ? `no cartão ${card.name}` : null].filter(Boolean).join(" e ");
      notify(`${launches(done.length)} ${target}.`, {
        label: "Desfazer",
        run: async () => {
          for (const item of done) await api.update("transactions", item.id, item.previous);
          await refresh();
          notify("Alteração desfeita.");
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

  const parts: string[] = [];
  if (value) parts.push(`${launches(categoryChanges.length)} ${categoryChanges.length === 1 ? "muda" : "mudam"} para ${category?.name ?? "Sem categoria"}${skipped ? `; ${launches(skipped)} de outro tipo ${skipped === 1 ? "fica" : "ficam"} como ${skipped === 1 ? "está" : "estão"}` : ""}`);
  if (cardValue !== KEEP) parts.push(`${launches(cardChanges.length)} ${cardChanges.length === 1 ? "passa" : "passam"} para ${card?.name ?? "o cartão escolhido"}`);
  const summary = parts.length === 0 ? `${launches(rows.length)} selecionado${rows.length === 1 ? "" : "s"}.` : `${parts.join(". ")}.`;

  return <Dialog title={`Categorizar ${launches(rows.length)}`} onClose={onClose} busy={busy}
    footer={<>
      <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="btn primary" disabled={busy || changedIds.size === 0} onClick={() => void apply()}>{busy ? "Salvando…" : "Aplicar"}</button>
    </>}>
    <div className="stack">
      <Field label="Categoria" error={error ?? undefined} hint={kinds.length > 1 ? `A seleção tem ${kinds.map(kind => labelFor(transactionKindLabels, kind).toLowerCase()).join(" e ")}; cada lançamento só recebe categoria do próprio tipo.` : undefined}>
        <Select options={options} value={value} placeholder="Escolha a categoria" onChange={next => { setValue(next); setError(null); }} />
      </Field>
      {cardRows.length > 0 && state.cards.length > 0 && <Field label="Cartão"
        hint={`Vale para ${launches(cardRows.length)} pago${cardRows.length === 1 ? "" : "s"} no cartão — útil para acertar de qual cartão foi cada compra da fatura importada.`}>
        <Select options={cardOptions} value={cardValue} onChange={next => { setCardValue(next); setError(null); }} />
      </Field>}
      <p className="muted" role="status">{summary}</p>
    </div>
  </Dialog>;
}
