import { describe, expect, it } from "vitest";
import type { FormState } from "../../types";
import { closedInstallmentMonths, installmentAmount, installmentDate, installmentPlan, installmentSummary, installmentTotal, repeatMode } from "./installments";

const form = (overrides: Partial<FormState> = {}): FormState => ({
  repeat: "installments", amount_basis: "installment", amount: "100,00", date: "2026-09-17",
  installment_number: "6", installment_count: "10", ...overrides,
});

const money = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

describe("parcelamento", () => {
  it("multiplica o valor da parcela para chegar ao total", () => {
    expect(installmentTotal(100_00, 10)).toBe(1_000_00);
  });

  it("divide o total com o resto nas primeiras parcelas e fecha a soma", () => {
    // Mesma regra do servidor (InstallmentRules.AmountOf): 100,00 em 3x = 33,34 + 33,33 + 33,33.
    expect([1, 2, 3].map(number => installmentAmount(100_00, 3, number))).toEqual([33_34, 33_33, 33_33]);
    expect([1, 2, 3].reduce((total, number) => total + installmentAmount(100_00, 3, number), 0)).toBe(100_00);
  });

  it("desloca a data mês a mês, limitando o dia ao tamanho do mês", () => {
    expect(installmentDate("2026-09-17", 6, 1)).toBe("2026-04-17");
    expect(installmentDate("2026-09-17", 6, 10)).toBe("2027-01-17");
    expect(installmentDate("2026-01-31", 1, 2)).toBe("2026-02-28");
    expect(installmentDate("2026-01-31", 1, 3)).toBe("2026-03-31");
    expect(installmentDate("2028-01-31", 1, 2)).toBe("2028-02-29");
  });

  it("monta o plano a partir do valor da parcela", () => {
    const plan = installmentPlan(form())!;
    expect(plan).toMatchObject({ count: 10, number: 6, totalCents: 1_000_00, perInstallmentCents: 100_00, firstDate: "2026-04-17", lastDate: "2027-01-17" });
    expect(installmentSummary(plan, money)).toBe("10x de R$ 100,00 · total R$ 1000,00 · de abril de 2026 a janeiro de 2027");
  });

  it("monta o plano a partir do valor total da compra", () => {
    const plan = installmentPlan(form({ amount_basis: "total", amount: "1.000,00", installment_number: "1", installment_count: "3" }))!;
    expect(plan.totalCents).toBe(1_000_00);
    expect(plan.perInstallmentCents).toBe(333_34);
  });

  it("não monta plano com números fora do limite, parcela maior que o total ou total sem um centavo por parcela", () => {
    expect(installmentPlan(form({ installment_count: "1" }))).toBeNull();
    expect(installmentPlan(form({ installment_count: "73" }))).toBeNull();
    expect(installmentPlan(form({ installment_number: "11", installment_count: "10" }))).toBeNull();
    expect(installmentPlan(form({ amount_basis: "total", amount: "0,09", installment_count: "10", installment_number: "1" }))).toBeNull();
  });

  it("sem repetição não há plano", () => {
    expect(repeatMode({})).toBe("none");
    expect(installmentPlan(form({ repeat: "none" }))).toBeNull();
    expect(installmentPlan(form({ repeat: "forever" }))).toBeNull();
  });

  it("lista os meses fechados que a série alcançaria", () => {
    const plan = installmentPlan(form())!;
    expect(closedInstallmentMonths(plan, "2026-09-17", ["2026-05", "2026-12", "2025-01"])).toEqual(["2026-05", "2026-12"]);
    expect(closedInstallmentMonths(plan, "2026-09-17", [])).toEqual([]);
    expect(closedInstallmentMonths(plan, "2026-09-17", undefined)).toEqual([]);
  });
});
