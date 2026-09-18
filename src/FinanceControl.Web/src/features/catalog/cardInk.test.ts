import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../components/ui/shared/color";
import { AA, cardInk, cardSamples, inkRatio, INK_DARK, INK_LIGHT, mixHex, cardColor } from "./cardInk";

describe("MEL-35 · tinta do cartão visual", () => {
  it("usa tinta branca em cores escuras e escura em cores claras, sem mexer na cor", () => {
    expect(cardInk("#0b2a4a")).toMatchObject({ contrast: "light", surface: "#0b2a4a", adjusted: false });
    expect(cardInk("#820ad1").contrast).toBe("light");
    expect(cardInk("#f2c94c")).toMatchObject({ contrast: "dark", surface: "#f2c94c", adjusted: false });
    expect(cardInk(null).contrast).toBe("light");
  });

  it("ajusta cores de luminosidade média para passar AA no cartão inteiro", () => {
    const gray = cardInk("#8a8a8a");
    expect(gray.adjusted).toBe(true);
    expect(gray.ratio).toBeGreaterThanOrEqual(AA);
    const ink = gray.contrast === "light" ? INK_LIGHT : INK_DARK;
    for (const sample of cardSamples(gray.surface)) expect(contrastRatio(ink, sample)).toBeGreaterThanOrEqual(AA);
  });

  it("qualquer cor escolhida resulta em texto AA (tinta cheia e suave)", () => {
    for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
      const hex = `#${[r, g, b].map(value => value.toString(16).padStart(2, "0")).join("")}`;
      const result = cardInk(hex);
      expect(inkRatio(result.surface, result.contrast === "light" ? INK_LIGHT : INK_DARK)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("mistura como color-mix em sRGB", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#ff0000", "#000000", 0.22)).toBe("#c70000");
  });

  it("CR-21 · sem cor escolhida, usa a cor do emissor", () => {
    expect(cardColor(null, "nubank")).toBe("#820ad1");
    expect(cardColor("#123456", "nubank")).toBe("#123456");
    expect(cardColor(null, null)).toBeNull();
  });
});
