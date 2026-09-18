import { describe, expect, it } from "vitest";
import type { MarketIndicator } from "../../api/insights";
import { baseTotal, cdiReference, cdiShare, hasForeignCurrency, missingRatesNote, rateChangeLabel } from "./conversion";
import { impliedRate } from "./formModel";

const cdi: MarketIndicator = { code: "cdi", label: "CDI", value: 10.65, unit: "% a.a.", reference_date: null, source: "BCB", fetched_at: "2026-09-17T10:00:00", stale: false };

describe("MEL-26 · conversão para reais", () => {
  it("soma moedas diferentes em reais e aponta as sem cotação", () => {
    const rates = { USD: "5", BTC: "300000" };
    expect(baseTotal([{ minor: 10_000 }, { minor: 1_000, currency: "USD" }, { minor: 500_000, currency: "BTC" }], rates)).toEqual({ cents: 10_000 + 5_000 + 150_000, missing: [], converted: true });
    const partial = baseTotal([{ minor: 100, currency: "EUR" }, { minor: 200, currency: "BRL" }], rates);
    expect(partial).toEqual({ cents: 200, missing: ["EUR"], converted: true });
    expect(missingRatesNote(partial.missing)).toBe("Sem cotação para EUR; fica fora do total em reais.");
    expect(missingRatesNote(["EUR", "USD"])).toBe("Sem cotação para EUR e USD; ficam fora do total em reais.");
    expect(missingRatesNote([])).toBeNull();
    expect(hasForeignCurrency([{ currency: "BRL" }, { currency: undefined }])).toBe(false);
    expect(hasForeignCurrency([{ currency: "USD" }])).toBe(true);
  });

  it("mostra a variação do dia e a cotação implícita da transferência", () => {
    expect(rateChangeLabel(0.4)).toBe("+0,4% hoje");
    expect(rateChangeLabel(-1.25)).toBe("−1,25% hoje");
    expect(rateChangeLabel(null)).toBeNull();
    expect(impliedRate(52_000, "BRL", 10_000, "USD")).toBe("Cotação usada: 1 USD = 5,2 BRL");
    expect(impliedRate(100_000, "BRL", 500_000, "BTC")).toBe("Cotação usada: 1 BTC = 200.000 BRL");
    expect(impliedRate(null, "BRL", 1, "USD")).toBeNull();
  });
});

describe("MEL-31 · referência ao CDI", () => {
  it("entende \"110% do CDI\", \"CDI\" e ignora \"CDI + 2%\"", () => {
    expect(cdiShare("110% do CDI")).toBe(110);
    expect(cdiShare("102,5% CDI")).toBe(102.5);
    expect(cdiShare("CDI")).toBe(100);
    expect(cdiShare("CDI + 2%")).toBeNull();
    expect(cdiShare("IPCA + 6%")).toBeNull();
  });

  it("calcula a taxa anual de hoje quando há o indicador", () => {
    expect(cdiReference("110% do CDI", [cdi])).toBe("Rende 110% do CDI (≈ 11,72% ao ano hoje)");
    expect(cdiReference("110% do CDI", [])).toBeNull();
    expect(cdiReference(null, [cdi])).toBeNull();
  });
});
