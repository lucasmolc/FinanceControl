import { describe, expect, it } from "vitest";
import { brl, formatMoney, formatMoneyInput, formatRate, hiddenMoney, parseMoney, parseRate, toBaseCents } from "./money";

describe("parseMoney", () => {
  it.each([
    ["12,50", 1250],
    ["12.50", 1250],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["1.234", 123400],
    ["1234", 123400],
    ["R$ 1.234,56", 123456],
    ["-50,00", -5000],
    ["0,5", 50],
    ["0,01", 1],
    ["1.234.567,89", 123456789],
    ["  7  ", 700],
    ["−50,00", -5000],
  ])("converte %s em %i centavos", (text, cents) => {
    expect(parseMoney(text)).toBe(cents);
  });

  it.each(["abc", "10,5,3", "1,234.567", "12,345", "", "   ", "R$", "-", "1.2.3", "12,3a", "1..234", "12.345,6,7", "1,23,456.00"])("rejeita %j", text => {
    expect(parseMoney(text)).toBeNull();
  });

  it("não produz -0", () => {
    expect(Object.is(parseMoney("-0,00"), 0)).toBe(true);
  });
});

describe("formatMoneyInput", () => {
  it("agrupa milhares e mantém duas casas", () => {
    expect(formatMoneyInput(123456)).toBe("1.234,56");
    expect(formatMoneyInput(5)).toBe("0,05");
    expect(formatMoneyInput(-5000)).toBe("-50,00");
    expect(formatMoneyInput(123456789)).toBe("1.234.567,89");
  });

  it.each([0, 1, 99, 100, 123456, -123456, 300000, 100000000])("faz ida e volta com %i", cents => {
    expect(parseMoney(formatMoneyInput(cents))).toBe(cents);
  });
});

describe("brl", () => {
  it("formata em reais", () => {
    expect(brl(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
});

const plain = (text: string) => text.replace(/\s/g, " ");

describe("parseMoney com casas decimais por moeda (MEL-26)", () => {
  it.each([
    ["0,005", 8, 500_000],
    ["0.005", 8, 500_000],
    ["1,23456789", 8, 123_456_789],
    ["₿ 0,5", 8, 50_000_000],
    ["1.234", 8, 123_400_000],
    ["1.234.567", 8, 123_456_700_000_000],
    ["1.234", 0, 1234],
    ["1234", 0, 1234],
    ["¥ 12.000", 0, 12_000],
    ["US$ 10,50", 2, 1050],
    ["USD 10,50", 2, 1050],
    ["-US$ 3,00", 2, -300],
    ["€ -3,00", 2, -300],
  ])("converte %s com %i casas em %i", (text, decimals, minor) => {
    expect(parseMoney(text, decimals)).toBe(minor);
  });

  it.each([
    ["0,123456789", 8],
    ["12,5", 0],
    ["12.5", 0],
    ["1,234.5", 0],
    ["abc", 8],
    ["12,3a", 2],
    ["X 10", 2],
  ])("rejeita %j com %i casas", (text, decimals) => {
    expect(parseMoney(text, decimals)).toBeNull();
  });
});

describe("formatMoneyInput com casas decimais", () => {
  it("formata iene sem casas e cripto com casas significativas", () => {
    expect(formatMoneyInput(1234, 0)).toBe("1.234");
    expect(formatMoneyInput(500_000, 8)).toBe("0,005");
    expect(formatMoneyInput(100_000_000, 8)).toBe("1,00");
    expect(formatMoneyInput(123_456_789, 8)).toBe("1,23456789");
    expect(formatMoneyInput(-50_000_000, 8)).toBe("-0,50");
  });

  it.each([[0, 8], [1, 8], [500_000, 8], [123_456_789_012, 8], [1234, 0], [-99, 0], [123456, 2]])("faz ida e volta com %i (%i casas)", (minor, decimals) => {
    expect(parseMoney(formatMoneyInput(minor, decimals), decimals)).toBe(minor);
  });
});

describe("formatMoney", () => {
  it("formata cada moeda com o seu símbolo", () => {
    expect(plain(formatMoney(123456))).toBe("R$ 1.234,56");
    expect(plain(formatMoney(123456, "USD"))).toBe("US$ 1.234,56");
    expect(plain(formatMoney(99, "EUR"))).toBe("€ 0,99");
    expect(plain(formatMoney(1234, "JPY"))).toBe("¥ 1.234");
    expect(plain(formatMoney(500_000, "BTC"))).toBe("₿ 0,005");
    expect(plain(formatMoney(100_000_000, "ETH"))).toBe("Ξ 1,00");
    expect(plain(formatMoney(1050, "XYZ"))).toBe("XYZ 10,50");
  });

  it("usa sinais e formato compacto", () => {
    expect(plain(formatMoney(100, "USD", { signed: true }))).toBe("+US$ 1,00");
    expect(plain(formatMoney(-100, "USD", { signed: true }))).toBe("−US$ 1,00");
    expect(plain(formatMoney(0, "USD", { signed: true }))).toBe("US$ 0,00");
    expect(plain(formatMoney(-100, "BRL", { signed: true }))).toBe("−R$ 1,00");
    expect(plain(formatMoney(-250, "USD"))).toBe("-US$ 2,50");
    expect(plain(formatMoney(123_456_700, "BRL", { compact: true }))).toBe("R$ 1,2 mi");
    expect(plain(formatMoney(1_234_500, "USD", { compact: true }))).toBe("US$ 12,3 mil");
  });

  it("mascara valores no modo privado", () => {
    expect(plain(hiddenMoney())).toBe("R$ •••••");
    expect(plain(hiddenMoney("BTC"))).toBe("₿ •••••");
  });
});

describe("toBaseCents", () => {
  const rates = { USD: "5.1234", BTC: "350000", JPY: 0.0345, EUR: "abc", SOL: "0" };

  it("converte com arredondamento para longe do zero", () => {
    expect(toBaseCents(1000, "USD", rates)).toBe(5123); // 10,00 × 5,1234 = 51,234
    expect(toBaseCents(1001, "USD", rates)).toBe(5129); // 10,01 × 5,1234 = 51,285234 → 5.128,5234 centavos
    expect(toBaseCents(500_000, "BTC", rates)).toBe(175_000); // 0,005 × 350.000 = 1.750,00
    expect(toBaseCents(1000, "JPY", rates)).toBe(3450); // ¥1.000 × 0,0345 = 34,50
    expect(toBaseCents(-1000, "USD", rates)).toBe(-5123);
    expect(toBaseCents(1, "USD", { USD: "0.5" })).toBe(1); // 0,005 → 0,01 (meio para cima)
    expect(toBaseCents(-1, "USD", { USD: "0.5" })).toBe(-1);
  });

  it("mantém reais e devolve null sem cotação válida", () => {
    expect(toBaseCents(1234, "BRL", null)).toBe(1234);
    expect(toBaseCents(1000, "EUR", rates)).toBeNull();
    expect(toBaseCents(1000, "SOL", rates)).toBeNull();
    expect(toBaseCents(1000, "GBP", rates)).toBeNull();
    expect(toBaseCents(1000, "USD", null)).toBeNull();
  });
});

describe("parseRate / formatRate", () => {
  it.each([["5,1234", "5.1234"], ["5.1234", "5.1234"], ["350.000,50", "350000.5"], ["0,00012345", "0.00012345"], [" 5 ", "5"], ["5,10", "5.1"]])("normaliza %j", (text, rate) => {
    expect(parseRate(text)).toBe(rate);
  });

  it.each(["", "0", "0,00", "abc", "1,2,3", "0,123456789", "-5"])("rejeita %j", text => {
    expect(parseRate(text)).toBeNull();
  });

  it("exibe com vírgula", () => {
    expect(formatRate("5.1234")).toBe("5,1234");
    expect(formatRate(null)).toBe("");
  });
});
