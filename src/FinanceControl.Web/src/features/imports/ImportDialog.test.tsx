// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { emptyState } from "../../test/fixtures";
import type { FinanceState, ImportLine, ImportPreview } from "../../types";
import { ImportDialog } from "./ImportDialog";

vi.mock("../../api/client", async importOriginal => ({
  ...await importOriginal<typeof import("../../api/client")>(),
  api: { importPreview: vi.fn(), importCommit: vi.fn() },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const state: FinanceState = {
  ...emptyState,
  cards: [{ id: 7, name: "Cartão principal", closing_day: 3, due_day: 10, real_limit_cents: 0, personal_limit_cents: 0, active: true }],
  bank_accounts: [{ id: 2, name: "Conta corrente", institution: "Banco", account_type: "checking", current_balance_cents: 0, color_label: null, active: true }],
  categories: [{ id: 5, name: "Alimentação", kind: "expense", monthly_budget_cents: 0, active: true }],
};

const line = (overrides: Partial<ImportLine>): ImportLine => ({
  fingerprint: "a1", date: "2026-09-04", description: "IFD*IFOOD CLUB", kind: "expense", amount_cents: 7_95, currency: "BRL",
  card_id: 7, card_name: "Cartão principal", account_id: null, invoice_month: "2026-10",
  installment_number: null, installment_count: null, purchase_date: null, notes: null, status: "novo",
  duplicate_of: null, duplicate_date: null, ...overrides,
});

const preview: ImportPreview = {
  format: "csv", target_kind: "card", target_id: 7, target_name: "Cartão principal", currency: "BRL", positive_is_expense: true,
  lines: [
    line({}),
    line({ fingerprint: "b2", description: "CEA BHB 617 ECPC (3/3)", amount_cents: 159_99, installment_number: 3, installment_count: 3, purchase_date: "2026-07-04" }),
    line({ fingerprint: "c3", description: "Streaming", amount_cents: 18_88, status: "duplicado", duplicate_of: "Netflix", duplicate_date: "2026-09-06" }),
    line({ fingerprint: "d4", description: "Pagamento de fatura", kind: "income", amount_cents: 5_195_80, status: "pagamento" }),
    line({ fingerprint: "e5", description: "Compra antiga", status: "importado" }),
  ],
  totals: { lines: 5, new: 2, duplicate: 1, imported: 1, payment: 1, closed_month: 0, expense_cents: 186_82, income_cents: 5_195_80 },
};

function open(overrides: Partial<React.ComponentProps<typeof ImportDialog>> = {}) {
  const props = { state, onClose: vi.fn(), onDone: vi.fn(), refresh: vi.fn(async () => undefined), notify: vi.fn(), ...overrides };
  render(<ImportDialog {...props} />);
  return props;
}

/** Sends a file through the hidden input of the FileUpload. */
async function sendFile(name = "Fatura2026-10-10.csv") {
  const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
  const file = new File(["Data;Estabelecimento;Valor\n04/09/2026;IFD;R$ 7,95\n"], name, { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(api.importPreview).toHaveBeenCalled());
}

beforeEach(() => {
  vi.mocked(api.importPreview).mockResolvedValue(preview);
  vi.mocked(api.importCommit).mockResolvedValue({ created: 2, skipped: 3, ids: [1, 2] });
});

describe("importar fatura", () => {
  it("lê o arquivo escolhido e mostra o que entraria, sem gravar nada", async () => {
    open();
    await sendFile();

    expect(api.importPreview).toHaveBeenCalledWith(expect.objectContaining({ card_id: 7, file_name: "Fatura2026-10-10.csv" }));
    expect(api.importCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("5 lançamentos no arquivo");
    // O gasto fica no mês da compra e a fatura é a de outubro.
    expect(screen.getByRole("table").textContent).toContain("Fatura de outubro de 2026");
  });

  it("mostra a parcela e a data da compra original", async () => {
    open();
    await sendFile();
    const row = screen.getByText("CEA BHB 617 ECPC (3/3)").closest("tr")!;
    expect(row.textContent).toContain("Parcela 3/3");
    expect(row.textContent).toContain("compra em 04/07/2026");
    expect(row.textContent).toContain("04/09/2026");
  });

  it("marca só as linhas novas e explica o que já existe", async () => {
    open();
    await sendFile();
    const checkboxes = screen.getAllByRole("checkbox");
    // O primeiro é o "selecionar todos"; as linhas novas vêm marcadas.
    expect(checkboxes.slice(1).map(box => (box as HTMLInputElement).checked)).toEqual([true, true, false, false, false]);
    // A linha já importada não pode ser escolhida.
    expect((checkboxes[5] as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Streaming").closest("tr")!.textContent).toContain("Já existe: Netflix em 06/09/2026");
    expect(screen.getByRole("button", { name: "Importar 2 lançamentos" })).toBeTruthy();
  });

  it("grava apenas as linhas marcadas, com a categoria escolhida", async () => {
    const props = open();
    await sendFile();
    // Marca também a linha que pode repetir.
    fireEvent.click(screen.getAllByRole("checkbox")[3]!);
    fireEvent.click(screen.getByRole("button", { name: "Importar 3 lançamentos" }));

    await waitFor(() => expect(api.importCommit).toHaveBeenCalled());
    expect(vi.mocked(api.importCommit).mock.calls[0]![0].fingerprints).toEqual(["a1", "b2", "c3"]);
    await waitFor(() => expect(props.onDone).toHaveBeenCalled());
    expect(props.notify).toHaveBeenCalledWith(expect.stringContaining("2 lançamentos importados"));
  });

  it("mostra o erro do servidor sem fechar a conferência", async () => {
    vi.mocked(api.importCommit).mockRejectedValue(new Error("falhou"));
    const props = open({ notifyError: vi.fn() });
    await sendFile();
    fireEvent.click(screen.getByRole("button", { name: "Importar 2 lançamentos" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(props.onDone).not.toHaveBeenCalled();
  });

  it("oferece cartões e contas como destino", () => {
    open();
    const combobox = screen.getByLabelText("Destino");
    fireEvent.click(combobox);
    const list = document.getElementById(combobox.getAttribute("aria-controls")!)!;
    expect(within(list).getAllByRole("option").map(option => option.textContent)).toEqual(["Cartão principal", "Conta corrente"]);
  });
});
