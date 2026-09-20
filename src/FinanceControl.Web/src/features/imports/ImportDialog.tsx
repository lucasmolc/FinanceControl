import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { Dialog } from "../../components/Dialog";
import { Field, Money } from "../../components/ui";
import { Badge } from "../../components/ui/Badge";
import { Checkbox } from "../../components/ui/Checkbox";
import { FileUpload } from "../../components/ui/FileUpload";
import { Select } from "../../components/ui/Select";
import { formatDate, formatMonthLabel } from "../../lib/date";
import type { FinanceState, ImportLine, ImportPreview, Notify } from "../../types";
import { CategoryIcon } from "../../components/ui/CategoryIcon";
import {
  ACCEPTED_LABEL, ACCEPTED_TYPES, defaultSelection, invoiceMonthsOf, isSelectable, linesLabel, MAX_IMPORT_BYTES,
  monthsOf, parseTarget, previewSummary, readBase64, statusOf, targetGroups, targetValue, type ImportTarget,
} from "./importModel";

export interface ImportDialogProps {
  state: FinanceState;
  onClose: () => void;
  /** After importing (data already refreshed through `refresh`). */
  onDone: () => void;
  refresh: () => Promise<void>;
  notify: Notify;
  notifyError?: (reason: unknown) => void;
  /** Destino já escolhido (abrindo a partir de um cartão ou de uma conta). */
  target?: ImportTarget;
}

const NO_CATEGORY = "";

/** Uma linha lida do arquivo, com o que precisa ser conferido antes de virar lançamento. */
function LineRow({ line, checked, onToggle }: { line: ImportLine; checked: boolean; onToggle: (next: boolean) => void }) {
  const status = statusOf(line);
  const selectable = isSelectable(line);
  const installment = line.installment_number !== null && line.installment_count !== null
    ? `${line.installment_number}/${line.installment_count}` : null;
  return <tr className={selectable ? undefined : "is-disabled"}>
    <td className="import-check">
      <Checkbox checked={checked} disabled={!selectable} onChange={onToggle}
        aria-label={`Importar ${line.description} de ${formatDate(line.date)}`} />
    </td>
    <td className="import-date">
      {formatDate(line.date)}
      {line.purchase_date && <small className="muted"> compra em {formatDate(line.purchase_date)}</small>}
    </td>
    <td className="import-description">
      <span className="description-text">
        <b>{line.description}</b>
        {installment && <small className="muted">Parcela {installment}</small>}
        {line.duplicate_of && <small className="muted">Já existe: {line.duplicate_of} em {formatDate(line.duplicate_date ?? line.date)}</small>}
      </span>
    </td>
    <td className="import-status"><Badge tone={status.tone} size="sm" title={status.hint}>{status.label}</Badge></td>
    <td className="import-target">{line.card_name ?? "—"}{line.invoice_month && <small className="muted">Fatura de {formatMonthLabel(line.invoice_month)}</small>}</td>
    <td className="import-amount">
      <Money cents={line.kind === "income" ? line.amount_cents : -line.amount_cents} currency={line.currency} signed tone={line.kind === "income" ? "auto" : "neutral"} />
    </td>
  </tr>;
}

/**
 * Importação de fatura ou extrato (v1.4): escolhe o destino, lê o arquivo e mostra o que entraria antes de gravar.
 * A data de cada linha é a do gasto — uma compra de setembro continua em setembro mesmo vindo na fatura de outubro,
 * e a coluna "Fatura" mostra em qual cobrança ela cai. Nada é gravado até "Importar".
 */
export function ImportDialog({ state, onClose, onDone, refresh, notify, notifyError, target: initialTarget }: ImportDialogProps) {
  const groups = targetGroups(state);
  const [target, setTarget] = useState(initialTarget ? targetValue(initialTarget) : groups[0]?.options[0]?.value ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState(NO_CATEGORY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = parseTarget(target);
  const selectedSet = new Set(selected);
  const selectable = preview?.lines.filter(isSelectable) ?? [];
  const allSelected = selectable.length > 0 && selectable.every(line => selectedSet.has(line.fingerprint));
  const categoryOptions = [
    { value: NO_CATEGORY, label: "Sem categoria (definir depois)" },
    ...state.categories.filter(item => item.kind === "expense").map(item => ({
      value: String(item.id), label: item.name,
      icon: <CategoryIcon icon={item.icon} color={item.color} name={item.name} kind={item.kind} size="sm" />,
    })),
  ];

  /** O arquivo vai por parâmetro: `file` no estado ainda não valeu quando a leitura começa. */
  const body = async (source: File, fingerprints?: string[]) => ({
    ...(chosen?.kind === "card" ? { card_id: chosen.id } : { account_id: chosen?.id }),
    file_name: source.name,
    content_base64: await readBase64(source),
    category_id: category === NO_CATEGORY ? null : Number(category),
    ...(fingerprints ? { fingerprints } : {}),
  });

  async function load(next: File) {
    if (!chosen) { setError("Escolha o cartão ou a conta que recebe os lançamentos."); return; }
    setFile(next);
    setBusy(true);
    setError(null);
    try {
      const result = await api.importPreview(await body(next));
      setPreview(result);
      setSelected(defaultSelection(result));
    } catch (reason) {
      setPreview(null);
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview || !file || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.importCommit(await body(file, selected));
      await refresh();
      notify(`${linesLabel(result.created)} importado${result.created === 1 ? "" : "s"}. Ajuste a categoria e o cartão na tela de lançamentos.`);
      onDone();
    } catch (reason) {
      setError(errorMessage(reason));
      if (notifyError) notifyError(reason);
    } finally {
      setBusy(false);
    }
  }

  const changeTarget = (next: string) => {
    setTarget(next);
    // Outro destino muda a leitura (moeda, cartões e o que já existe), então a conferência recomeça.
    setPreview(null);
    setSelected([]);
    setError(null);
    if (file) void load(file);
  };

  const toggle = (fingerprint: string, next: boolean) =>
    setSelected(current => (next ? [...current, fingerprint] : current.filter(item => item !== fingerprint)));
  const toggleAll = (next: boolean) => setSelected(next ? selectable.map(line => line.fingerprint) : []);

  const months = preview ? monthsOf(preview.lines) : [];
  const invoices = preview ? invoiceMonthsOf(preview.lines) : [];

  return <Dialog title="Importar fatura ou extrato" onClose={onClose} busy={busy} size="lg"
    footer={<>
      <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="btn primary" disabled={busy || selected.length === 0} onClick={() => void commit()}>
        {busy ? "Importando…" : selected.length > 0 ? `Importar ${linesLabel(selected.length)}` : "Importar"}
      </button>
    </>}>
    <div className="stack import-dialog">
      <Field label="Destino" hint="Fatura de cartão ou extrato de conta. É ele que define a moeda e onde procurar repetidos.">
        <Select options={groups} value={target} onChange={changeTarget} placeholder="Escolha o cartão ou a conta" />
      </Field>

      <FileUpload readAs="file" accept={ACCEPTED_TYPES} acceptLabel={ACCEPTED_LABEL} maxBytes={MAX_IMPORT_BYTES} preview={false}
        disabled={busy || !chosen} label="Arquivo da fatura ou do extrato"
        hint={busy ? "Lendo o arquivo…" : "Baixe a fatura ou o extrato no site do banco. Nada é gravado até você confirmar."}
        onFile={next => void load(next)} onError={setError} />

      {error && <p className="field-error" role="alert">{error}</p>}

      {preview && <>
        <p className="muted" role="status">{previewSummary(preview)}</p>
        {months.length > 0 && <p className="muted">
          {months.length === 1 ? `Gastos de ${formatMonthLabel(months[0]!)}` : `Gastos de ${formatMonthLabel(months[0]!)} a ${formatMonthLabel(months[months.length - 1]!)}`}
          {invoices.length > 0 && ` · ${invoices.length === 1 ? `fatura de ${formatMonthLabel(invoices[0]!)}` : `faturas de ${formatMonthLabel(invoices[0]!)} a ${formatMonthLabel(invoices[invoices.length - 1]!)}`}`}.
          {" "}Cada lançamento fica no mês da compra, mesmo quando a fatura vence no mês seguinte.
        </p>}

        <Field label="Categoria dos importados" hint="Vale para todos. Você também pode deixar sem categoria e organizar em lote na tela de lançamentos.">
          <Select options={categoryOptions} value={category} onChange={setCategory} />
        </Field>

        {preview.lines.length > 0 && <div className="table-wrap import-table">
          <table>
            <caption className="sr-only">Lançamentos lidos do arquivo</caption>
            <thead>
              <tr>
                <th scope="col" className="import-check">
                  <Checkbox checked={allSelected} indeterminate={!allSelected && selected.length > 0} disabled={selectable.length === 0}
                    onChange={toggleAll} aria-label="Selecionar todos os lançamentos" />
                </th>
                <th scope="col">Data</th>
                <th scope="col">Descrição</th>
                <th scope="col">Situação</th>
                <th scope="col">Cartão</th>
                <th scope="col" className="import-amount">Valor</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map(line => <LineRow key={line.fingerprint} line={line} checked={selectedSet.has(line.fingerprint)}
                onToggle={next => toggle(line.fingerprint, next)} />)}
            </tbody>
          </table>
        </div>}
      </>}

      {!preview && !busy && <p className="muted import-empty">
        <FileSpreadsheet size={16} aria-hidden="true" /> Aceitamos os formatos que os bancos exportam: {ACCEPTED_LABEL}.
      </p>}
    </div>
  </Dialog>;
}
