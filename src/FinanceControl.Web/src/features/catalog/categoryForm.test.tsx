// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { emptyState } from "../../test/fixtures";
import { hiddenValue, pick } from "../../test/formControls";
import type { Category, FormState } from "../../types";
import { RecordModal } from "../records/RecordModal";
import { recordForms } from "../records/registry";

vi.mock("../../api/client", async importOriginal => ({ ...await importOriginal<typeof import("../../api/client")>(), api: { create: vi.fn(), update: vi.fn() } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderCategory(options: { mode: "create" | "edit"; initial: FormState; id?: number }) {
  const onSaved = vi.fn();
  render(<RecordModal kind="category" mode={options.mode} initial={options.initial} id={options.id} state={emptyState} month="2026-09" onClose={vi.fn()} onSaved={onSaved} />);
  return screen.getByRole("dialog");
}

describe("MEL-45 · balde do plano no formulário de categoria", () => {
  it("carrega o balde salvo e envia o escolhido", async () => {
    vi.mocked(api.update).mockResolvedValue({ ok: true });
    const category: Category = { id: 7, name: "Cinema", kind: "expense", monthly_budget_cents: 0, active: true, bucket: "lazer" };
    const dialog = renderCategory({ mode: "edit", id: 7, initial: recordForms.category.fromRecord!(category) });
    expect(hiddenValue(dialog, "bucket")).toBe("lazer");
    pick(dialog, /Balde do plano/, "Gastos fixos");
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith("categories", 7, expect.objectContaining({ bucket: "fixo" })));
  });

  it("sem balde envia null, e categorias de receita não entram no plano", async () => {
    vi.mocked(api.create).mockResolvedValue({ ok: true, id: 1 });
    const dialog = renderCategory({ mode: "create", initial: {} });
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Mercado" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("categories", expect.objectContaining({ bucket: null })));

    pick(dialog, "Tipo", "Receita");
    expect(within(dialog).queryByLabelText(/Balde do plano/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.create).toHaveBeenLastCalledWith("categories", expect.objectContaining({ kind: "income", bucket: null })));
  });
});
