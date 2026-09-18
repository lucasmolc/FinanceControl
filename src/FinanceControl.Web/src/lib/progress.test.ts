import { describe, expect, it } from "vitest";
import { formatProgress, progressRatio } from "./progress";

describe("formatProgress", () => {
  it("usa uma casa abaixo de 10% e inteiros acima, sem arredondar para cima", () => {
    expect(formatProgress(2_805_000, 165_000_000)).toBe("1,7%");
    expect(formatProgress(99, 100)).toBe("99%");
    expect(formatProgress(999, 1000)).toBe("99%");
    expect(formatProgress(1, 100_000)).toBe("<0,1%");
  });
  it("trata alvo zero, negativo e atingido", () => {
    expect(formatProgress(0, 100)).toBe("0%");
    expect(formatProgress(10, 0)).toBe("0%");
    expect(formatProgress(150, 100)).toBe("100%");
    expect(progressRatio(-5, 100)).toBe(0);
  });
});
