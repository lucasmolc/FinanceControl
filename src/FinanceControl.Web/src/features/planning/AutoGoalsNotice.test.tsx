// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { emptyState } from "../../test/fixtures";
import type { Settings } from "../../types";
import { AutoGoalsNotice } from "./AutoGoalsNotice";
import { removedAutoGoals } from "./autoGoals";

vi.mock("../../api/client", async importOriginal => ({
  ...await importOriginal<typeof import("../../api/client")>(),
  api: { createEmergencyGoal: vi.fn(), createFreedomGoal: vi.fn() },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => {
  vi.mocked(api.createEmergencyGoal).mockResolvedValue({ ok: true, id: 9 });
  vi.mocked(api.createFreedomGoal).mockResolvedValue({ ok: true, id: 10 });
});

const settings = (overrides: Partial<Settings>): Settings => ({
  ...emptyState.settings, monthly_net_income_cents: 800_000, emergency_months_target: 6, ...overrides,
});

const show = (value: Settings) => {
  const props = { settings: value, refresh: vi.fn(async () => undefined), notify: vi.fn(), onError: vi.fn() };
  render(<AutoGoalsNotice {...props} />);
  return props;
};

describe("metas automáticas removidas", () => {
  it("não aparece quando as metas estão vinculadas", () => {
    show(settings({ emergency_goal_status: "linked", freedom_goal_status: "linked" }));
    expect(screen.queryByRole("region", { name: /Metas do planejamento/ })).toBeNull();
  });

  it("lista a reserva removida com o alvo calculado e recria vinculada", async () => {
    const props = show(settings({ emergency_goal_status: "removed", emergency_reserve_target_cents: 4_800_000 }));
    const row = screen.getByText("Reserva de emergência").closest("li")!;
    expect(row.textContent).toContain("Removida");
    expect(row.textContent).toContain("salário líquido × meses de reserva");

    fireEvent.click(screen.getByRole("button", { name: /Criar novamente/ }));
    await waitFor(() => expect(api.createEmergencyGoal).toHaveBeenCalled());
    await waitFor(() => expect(props.refresh).toHaveBeenCalled());
    expect(props.notify).toHaveBeenCalledWith("Reserva de emergência criada novamente com o cálculo automático.");
  });

  it("o número da liberdade só pode ser recriado com o plano aplicado", () => {
    show(settings({ freedom_goal_status: "removed", freedom_target_cents: 120_000_000 }));
    const button = screen.getByRole("button", { name: /Criar novamente/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain("Aplique o plano 70-20-10");

    cleanup();
    show(settings({ freedom_goal_status: "removed", freedom_target_cents: 120_000_000, plan_fixed_pct: 70, plan_fun_pct: 20, plan_invest_pct: 10 }));
    expect((screen.getByRole("button", { name: /Criar novamente/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("sem salário, a reserva não pode ser criada e a tela diz o que falta", () => {
    show(settings({ emergency_goal_status: "removed", monthly_net_income_cents: 0, emergency_reserve_target_cents: 0 }));
    expect(screen.getByText(/Informe o salário líquido e os meses de reserva/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Criar novamente/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("as duas metas removidas aparecem juntas", () => {
    expect(removedAutoGoals(settings({ emergency_goal_status: "removed", freedom_goal_status: "removed" })).map(goal => goal.id)).toEqual(["emergency", "freedom"]);
  });
});
