import { describe, expect, it } from "vitest";
import { currencies, currencyGroups, currencyLabel, currencyOf, isBaseCurrency } from "./currencies";

describe("catálogo de moedas", () => {
  it("espelha as 13 moedas da API", () => {
    expect(currencies.map(currency => currency.code)).toEqual(["BRL", "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "ARS", "BTC", "ETH", "SOL", "USDT"]);
    expect(currencyOf("JPY").decimals).toBe(0);
    expect(currencyOf("BTC").decimals).toBe(8);
    expect(currencyOf("USDT").decimals).toBe(2);
  });

  it("resolve códigos em branco, minúsculos e desconhecidos", () => {
    expect(currencyOf(null).code).toBe("BRL");
    expect(currencyOf("usd").symbol).toBe("US$");
    expect(currencyOf("XYZ")).toEqual({ code: "XYZ", name: "XYZ", symbol: "XYZ", decimals: 2, kind: "fiat" });
    expect(isBaseCurrency(undefined)).toBe(true);
    expect(isBaseCurrency("USD")).toBe(false);
  });

  it("rotula e agrupa para seletores", () => {
    expect(currencyLabel("EUR")).toBe("EUR · Euro");
    expect(currencyLabel("XYZ")).toBe("XYZ");
    const [fiat, crypto] = currencyGroups();
    expect(fiat?.label).toBe("Moedas");
    expect(fiat?.options).toHaveLength(9);
    expect(crypto?.options.map(([code]) => code)).toEqual(["BTC", "ETH", "SOL", "USDT"]);
  });
});
