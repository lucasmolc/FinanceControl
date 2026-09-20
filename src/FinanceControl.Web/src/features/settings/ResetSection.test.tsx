// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { emptyState } from "../../test/fixtures";
import type { FinanceState } from "../../types";
import { ResetSection } from "./ResetSection";
import { resetInventory } from "./resetModel";

vi.mock("../../api/client", async importOriginal => ({
  ...await importOriginal<typeof import("../../api/client")>(),
  api: { resetAccount: vi.fn() },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => vi.mocked(api.resetAccount).mockResolvedValue({ ok: true, safety_copy: "C:/dados/backups/antes-de-zerar-20260920-101500.db" }));

const state: FinanceState = {
  ...emptyState,
  transactions: [{ id: 1, date: "2026-09-01", description: "Compra", category_id: null, category_name: null, kind: "expense", amount_cents: 100, payment_method: "card", account_id: null, account_name: null }],
  cards: [{ id: 1, name: "Cartão", closing_day: 3, due_day: 10, real_limit_cents: 0, personal_limit_cents: 0, active: true }],
  categories: [{ id: 1, name: "Alimentação", kind: "expense", monthly_budget_cents: 0, active: true }],
};

function open(overrides = {}) {
  const props = { state, refresh: vi.fn(async () => undefined), notify: vi.fn(), onError: vi.fn(), ...overrides };
  render(<ResetSection {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /Zerar a conta/ }));
  return { props, dialog: screen.getByRole("alertdialog", { name: "Zerar a conta" }) };
}

describe("zerar a conta", () => {
  it("lista o que será apagado", () => {
    expect(resetInventory(state)).toEqual(["1 lançamento", "1 cartão", "1 categoria"]);
    const { dialog } = open();
    expect(within(dialog).getByRole("list").textContent).toContain("1 lançamento");
    expect(dialog.textContent).toContain("seu usuário e sua senha");
  });

  it("só libera a confirmação com a marcação e o texto exato", async () => {
    const { dialog } = open();
    const confirm = within(dialog).getByRole("button", { name: "Apagar tudo e recomeçar" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    const field = within(dialog).getByLabelText("Digite APAGAR TUDO para confirmar");
    fireEvent.change(field, { target: { value: "apagar tudo" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(field, { target: { value: "APAGAR TUDO" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    expect(api.resetAccount).not.toHaveBeenCalled();
  });

  it("apaga, recarrega o estado e diz onde ficou a cópia", async () => {
    const { props, dialog } = open();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.change(within(dialog).getByLabelText("Digite APAGAR TUDO para confirmar"), { target: { value: "APAGAR TUDO" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apagar tudo e recomeçar" }));

    await waitFor(() => expect(api.resetAccount).toHaveBeenCalledWith({ confirmation: "APAGAR TUDO" }));
    // O refresh traz o estado sem setup concluído, e o app reabre o primeiro acesso sozinho.
    await waitFor(() => expect(props.refresh).toHaveBeenCalled());
    expect(props.notify).toHaveBeenCalledWith(expect.stringContaining("antes-de-zerar-20260920-101500.db"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("offline, a ação fica indisponível", () => {
    render(<ResetSection state={state} refresh={vi.fn(async () => undefined)} notify={vi.fn()} onError={vi.fn()} offline />);
    expect((screen.getByRole("button", { name: /Zerar a conta/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
