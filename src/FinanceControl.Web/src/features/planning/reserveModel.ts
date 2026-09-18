import { ApiError } from "../../api/client";
import type { ConfirmOptions } from "../../components/confirmContext";
import type { Settings } from "../../types";

// MEL-43: emergency reserve goal kept in sync with the salary (monthly_net_income_cents × emergency_months_target).

export const AUTO_RESERVE_TARGET_ERROR = "Esta meta acompanha o salário. Confirme para desligar o cálculo automático.";

export const AUTO_RESERVE_CONFIRM: ConfirmOptions = {
  title: "Desligar o cálculo automático da reserva?",
  message: "O valor-alvo desta meta acompanha o salário líquido × meses de reserva. Ao definir outro valor, ele deixa de ser atualizado quando o salário ou os meses mudarem.",
  confirmLabel: "Desligar e salvar",
  cancelLabel: "Manter automático",
  tone: "primary",
};

/** True when `goalId` is the settings-linked reserve goal and its target is still automatic. */
export const isAutoReserveGoal = (settings: Settings, goalId: number | undefined): boolean =>
  goalId !== undefined && settings.emergency_goal_id === goalId && settings.emergency_goal_auto !== false;

/** Reserve target from the settings (server value when present, else income × months; 0 without income). */
export function reserveTargetCents(settings: Settings): number {
  if (typeof settings.emergency_reserve_target_cents === "number") return settings.emergency_reserve_target_cents;
  const income = settings.monthly_net_income_cents;
  const months = settings.emergency_months_target;
  return income > 0 && months >= 1 ? income * months : 0;
}

/** The server refused a target change on the linked reserve goal (client did not know it was linked). */
export const isAutoReserveError = (reason: unknown): boolean =>
  reason instanceof ApiError && reason.status === 400 && /acompanha o sal[áa]rio/i.test(reason.fields.target_cents ?? "");
