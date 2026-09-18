import { describe, expect, it } from "vitest";
import { formatSignedPercent, investmentResult, toneBySign, withdrawalPreview } from "./wealthMetrics";

describe("wealthMetrics", () => {
  it("tones results by sign (zero stays neutral)", () => {
    expect(toneBySign(1)).toBe("positive");
    expect(toneBySign(-1)).toBe("negative");
    expect(toneBySign(0)).toBeUndefined();
  });

  it("computes investment result and return", () => {
    expect(investmentResult(100_000, 112_500)).toEqual({ resultCents: 12_500, returnPercent: 12.5, tone: "positive" });
    expect(investmentResult(100_000, 95_000)).toEqual({ resultCents: -5_000, returnPercent: -5, tone: "negative" });
    expect(investmentResult(100_000, 100_000)).toEqual({ resultCents: 0, returnPercent: 0, tone: undefined });
    expect(investmentResult(0, 5_000).returnPercent).toBeNull();
  });

  it("formats signed percentages in pt-BR", () => {
    expect(formatSignedPercent(12.5)).toBe("+12,5%");
    expect(formatSignedPercent(-3)).toBe("−3,0%");
    expect(formatSignedPercent(0.01)).toBe("0,0%");
    expect(formatSignedPercent(null)).toBe("—");
  });

  it("previews a withdrawal by average cost (MEL-03)", () => {
    // 10.000 aplicados valendo 12.000: resgatar 6.000 (metade) reduz o aplicado pela metade.
    expect(withdrawalPreview(1_000_000, 1_200_000, 600_000)).toEqual({ investedCents: 500_000, currentCents: 600_000 });
    expect(withdrawalPreview(1_000_000, 1_200_000, 1_200_000)).toEqual({ investedCents: 0, currentCents: 0 });
    expect(withdrawalPreview(1_000_000, 1_200_000, 1_200_001)).toBeNull();
    expect(withdrawalPreview(1_000_000, 1_200_000, 0)).toBeNull();
  });
});
