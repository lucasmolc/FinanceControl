import type { BadgeTone } from "../../components/ui/Badge";
import { countLabel } from "../../lib/labels";
import type { FinanceState, ImportLine, ImportPreview } from "../../types";

/** Destino da importação: a fatura de um cartão ou o extrato de uma conta. */
export type ImportTarget = { kind: "card"; id: number } | { kind: "account"; id: number };

export const targetValue = (target: ImportTarget): string => `${target.kind}:${target.id}`;

export function parseTarget(value: string): ImportTarget | null {
  const [kind, id] = value.split(":");
  const parsed = Number(id);
  return (kind === "card" || kind === "account") && Number.isInteger(parsed) && parsed > 0 ? { kind, id: parsed } : null;
}

/** Opções de destino: cartões ativos (fatura) e contas ativas (extrato). */
export function targetGroups(state: FinanceState) {
  return [
    { label: "Faturas de cartão", options: state.cards.map(card => ({ value: targetValue({ kind: "card", id: card.id }), label: card.name })) },
    { label: "Extratos de conta", options: state.bank_accounts.map(account => ({ value: targetValue({ kind: "account", id: account.id }), label: account.name })) },
  ].filter(group => group.options.length > 0);
}

export const ACCEPTED_TYPES = ["text/csv", "text/plain", "text/tab-separated-values", "application/x-ofx", "application/vnd.intu.qfx", "application/octet-stream", ""];
export const ACCEPTED_LABEL = "CSV, TXT, OFX ou QIF";
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Conteúdo do arquivo em base64 (o servidor descobre a codificação: UTF-8 ou ISO-8859-1). */
export function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export interface StatusInfo { label: string; tone: BadgeTone; hint: string; selectable: boolean; }

/** Como cada situação é apresentada e se a linha pode entrar. */
export const STATUS: Record<string, StatusInfo> = {
  novo: { label: "Novo", tone: "positive", hint: "Ainda não existe aqui.", selectable: true },
  duplicado: { label: "Pode repetir", tone: "warning", hint: "Já existe um lançamento parecido, como a cobrança de uma assinatura.", selectable: true },
  importado: { label: "Já importado", tone: "neutral", hint: "Esta mesma linha já veio em uma importação anterior.", selectable: false },
  pagamento: { label: "Pagamento da fatura", tone: "info", hint: "O pagamento é registrado na tela de faturas; importá-lo contaria duas vezes.", selectable: true },
  mes_fechado: { label: "Mês fechado", tone: "negative", hint: "Reabra o mês para poder importar.", selectable: false },
};

export const statusOf = (line: ImportLine): StatusInfo =>
  STATUS[line.status] ?? { label: line.status, tone: "neutral", hint: "", selectable: false };

export const isSelectable = (line: ImportLine): boolean => statusOf(line).selectable;

/** Seleção inicial: só o que é novo (repetidos e pagamento de fatura entram apenas se o usuário marcar). */
export const defaultSelection = (preview: ImportPreview): string[] =>
  preview.lines.filter(line => line.status === "novo").map(line => line.fingerprint);

export const linesLabel = (count: number) => countLabel(count, "lançamento", "lançamentos");

/** Resumo do arquivo lido, em uma frase. */
export function previewSummary(preview: ImportPreview): string {
  const parts = [`${linesLabel(preview.totals.lines)} no arquivo`];
  if (preview.totals.new > 0) parts.push(`${preview.totals.new} novo${preview.totals.new === 1 ? "" : "s"}`);
  if (preview.totals.duplicate > 0) parts.push(`${preview.totals.duplicate} que pode${preview.totals.duplicate === 1 ? "" : "m"} repetir`);
  if (preview.totals.imported > 0) parts.push(`${preview.totals.imported} já importado${preview.totals.imported === 1 ? "" : "s"}`);
  if (preview.totals.payment > 0) parts.push(`${preview.totals.payment} pagamento de fatura`);
  if (preview.totals.closed_month > 0) parts.push(`${preview.totals.closed_month} em mês fechado`);
  return `${parts.join(" · ")}.`;
}

/** Meses de gasto cobertos pelo arquivo, em ordem (AAAA-MM). */
export const monthsOf = (lines: ImportLine[]): string[] =>
  [...new Set(lines.map(line => line.date.slice(0, 7)))].sort();

/** Faturas em que as linhas caem, em ordem (AAAA-MM); vazio fora de cartão. */
export const invoiceMonthsOf = (lines: ImportLine[]): string[] =>
  [...new Set(lines.map(line => line.invoice_month).filter((month): month is string => month !== null))].sort();
