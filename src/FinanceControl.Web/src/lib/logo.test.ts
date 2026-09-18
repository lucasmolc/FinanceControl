// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { autoDebitMessage } from "./autoDebit";
import { isValidLogoData } from "./logo";

describe("logo (MEL-33)", () => {
  it("valida o data URL aceito pela API", () => {
    expect(isValidLogoData("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isValidLogoData("data:image/gif;base64,R0lGOD")).toBe(false);
    expect(isValidLogoData("data:image/png;base64," + "A".repeat(200_000))).toBe(false);
    expect(isValidLogoData(null)).toBe(false);
  });
});

describe("débito automático (MEL-29)", () => {
  it("usa singular e plural", () => {
    expect(autoDebitMessage(1)).toBe("1 débito automático lançado.");
    expect(autoDebitMessage(3)).toBe("3 débitos automáticos lançados.");
  });
});
