import { api } from "../../api/client";
import type { Settings } from "../../types";
import { reserveTargetCents } from "./reserveModel";

/** Uma meta que o app mantém sozinho a partir do planejamento. */
export interface AutoGoal {
  id: "emergency" | "freedom";
  name: string;
  /** Como o alvo é calculado, em uma linha. */
  formula: string;
  targetCents: number;
  /** Só pode ser criada quando o planejamento tem o que ela precisa. */
  canCreate: boolean;
  /** O que falta preencher, quando não dá para criar. */
  missing: string;
  create: () => Promise<{ id?: number | null } | void>;
}

/**
 * Metas automáticas do planejamento (reserva de emergência e número da liberdade) que foram removidas. Elas não
 * voltam sozinhas, então a tela de Metas oferece recriá-las com o cálculo automático e o vínculo de volta.
 */
export function removedAutoGoals(settings: Settings): AutoGoal[] {
  const goals: AutoGoal[] = [];
  const reserve = reserveTargetCents(settings);
  if ((settings.emergency_goal_status ?? "none") === "removed") {
    goals.push({
      id: "emergency",
      name: "Reserva de emergência",
      formula: "salário líquido × meses de reserva",
      targetCents: reserve,
      canCreate: reserve > 0,
      missing: "Informe o salário líquido e os meses de reserva em Configurações para calcular o alvo.",
      create: () => api.createEmergencyGoal(),
    });
  }
  if ((settings.freedom_goal_status ?? "none") === "removed") {
    const hasPlan = settings.plan_fixed_pct !== null && settings.plan_fixed_pct !== undefined;
    goals.push({
      id: "freedom",
      name: "Número da liberdade",
      formula: `salário líquido × ${settings.freedom_multiplier ?? 150}`,
      targetCents: settings.freedom_target_cents ?? 0,
      canCreate: hasPlan && (settings.freedom_target_cents ?? 0) > 0,
      missing: hasPlan
        ? "Informe o salário líquido em Configurações para calcular o alvo."
        : "Aplique o plano 70-20-10 em Configurações para vincular o número da liberdade.",
      create: () => api.createFreedomGoal(),
    });
  }
  return goals;
}
