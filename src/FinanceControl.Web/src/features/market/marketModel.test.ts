import { describe, expect, it } from "vitest";
import type { MarketRate } from "../../api/insights";
import { convertMinor, formatChange, formatIndicator, formatUnitRate, rateGroups, ratesMap, sourceLabel, unitRate } from "./marketModel";

const rate = (currency: string, rate_brl: string, extra: Partial<MarketRate> = {}): MarketRate => ({ currency, rate_brl, change_pct: 0.5, source: "AwesomeAPI", fetched_at: "2026-09-18T10:00:00Z", manual: false, stale: false, ...extra });

describe("marketModel", () => {
  it("separa moedas e cripto na ordem do catálogo, sem BRL, incluindo moedas sem cotação", () => {
    const groups = rateGroups([rate("BTC", "350000"), rate("USD", "5.2"), rate("BRL", "1")]);
    expect(groups.fiat.map(row => row.info.code)).toEqual(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "ARS"]);
    expect(groups.crypto.map(row => row.info.code)).toEqual(["BTC", "ETH", "SOL", "USDT"]);
    expect(groups.fiat[0]?.rate?.rate_brl).toBe("5.2");
    expect(groups.fiat[1]?.rate).toBeNull();
  });

  it("converte entre moedas passando pelo real", () => {
    const rates = ratesMap({ base: "BRL", auto_refresh: true, last_refresh_at: null, last_error: null, indicators: [], rates: [rate("USD", "5"), rate("EUR", "6"), rate("BTC", "400000"), rate("JPY", "0.04")] });
    expect(convertMinor(10000, "USD", "BRL", rates)).toBe(50000);
    expect(convertMinor(50000, "BRL", "USD", rates)).toBe(10000);
    expect(convertMinor(12000, "EUR", "USD", rates)).toBe(14400);
    expect(convertMinor(40000000, "BRL", "BTC", rates)).toBe(100000000);
    expect(convertMinor(500000, "BTC", "BRL", rates)).toBe(200000);
    expect(convertMinor(1000, "JPY", "BRL", rates)).toBe(4000);
    expect(convertMinor(100, "USD", "USD", rates)).toBe(100);
    expect(convertMinor(100, "GBP", "BRL", rates)).toBeNull();
    expect(convertMinor(100, "BRL", "GBP", rates)).toBeNull();
    expect(unitRate("USD", "EUR", rates)).toBeCloseTo(5 / 6);
    expect(unitRate("USD", "GBP", rates)).toBeNull();
  });

  it("formata cotações, variações, indicadores e fontes", () => {
    expect(formatUnitRate("5.1234")).toBe("R$ 5,1234");
    expect(formatUnitRate("352110")).toBe("R$ 352.110,00");
    expect(formatUnitRate("0.0123456")).toBe("R$ 0,012346");
    expect(formatUnitRate(null)).toBe("—");
    expect(formatChange(1.25)).toBe("+1,25%");
    expect(formatChange(-0.4)).toBe("−0,4%");
    expect(formatChange(0)).toBe("0%");
    expect(formatIndicator(10.5, "% a.a.")).toBe("10,5% a.a.");
    expect(sourceLabel("manual")).toBe("Manual");
    expect(sourceLabel("Banco Central (SGS)")).toBe("Banco Central (SGS)");
  });
});
