import { describe, expect, it } from "vitest";
import { accountTypeLabels, goalEntryKindLabels, goalTypeLabels, labelFor, monthlyEquivalentCents, optionsOf, paymentMethodLabels, subscriptionFrequencyLabels } from "./labels";

describe("rótulos", () => {
  it("traduz códigos conhecidos", () => {
    expect(labelFor(goalTypeLabels, "custom")).toBe("Objetivo livre");
    expect(labelFor(paymentMethodLabels, "card")).toBe("Cartão de crédito");
    expect(labelFor(accountTypeLabels, "checking")).toBe("Conta corrente");
    expect(labelFor(subscriptionFrequencyLabels, "monthly")).toBe("Mensal");
  });

  it("mostra o valor bruto quando desconhecido e o fallback quando vazio", () => {
    expect(labelFor(goalTypeLabels, "legado")).toBe("legado");
    expect(labelFor(goalTypeLabels, null)).toBe("—");
    expect(labelFor(goalTypeLabels, "", "Sem tipo")).toBe("Sem tipo");
    expect(labelFor(goalTypeLabels, "toString")).toBe("toString");
  });

  it("gera opções na ordem declarada", () => {
    expect(optionsOf(subscriptionFrequencyLabels)).toEqual([["monthly", "Mensal"], ["yearly", "Anual"], ["weekly", "Semanal"]]);
    expect(optionsOf(subscriptionFrequencyLabels, ["weekly"])).toEqual([["weekly", "Semanal"]]);
  });
});

describe("monthlyEquivalentCents", () => {
  it("normaliza a periodicidade para o mês", () => {
    expect(monthlyEquivalentCents(3990, "monthly")).toBe(3990);
    expect(monthlyEquivalentCents(12000, "yearly")).toBe(1000);
    expect(monthlyEquivalentCents(1000, "yearly")).toBe(83);
    expect(monthlyEquivalentCents(1000, "weekly")).toBe(4333);
    expect(monthlyEquivalentCents(1000, "desconhecida")).toBe(1000);
  });

  it("rotula aporte e resgate de metas (MEL-04)", () => {
    expect(labelFor(goalEntryKindLabels, "contribution")).toBe("Aporte");
    expect(labelFor(goalEntryKindLabels, "withdrawal")).toBe("Resgate");
    expect(optionsOf(goalEntryKindLabels)).toEqual([["contribution", "Aporte"], ["withdrawal", "Resgate"]]);
  });
});
