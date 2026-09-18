/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND_FADE_MS, BRAND_INTRO_MAX_MS, BRAND_INTRO_MS, BRAND_LEAVE_MS, BRAND_MEET_MIN_MS, BRAND_SETTLE_MS, PAGE_LOADER_DELAY_MS } from "./brandMotion";

// Vitest stubs stylesheets, so motion.css is read from disk.
const motion = readFileSync(new URL("../styles/motion.css", import.meta.url), "utf8");
const brand = motion.slice(motion.indexOf("/* ---------- Brand opening"), motion.indexOf("/* ---------- Page change"));

const ms = (value: string) => (value.endsWith("ms") ? Number(value.slice(0, -2)) : Number(value.slice(0, -1)) * 1000);

/** `animation: <name> <duration> <easing…> <delay>` declarations of the meet phase (every rule before the settle block). */
function meetAnimations(): { selector: string; name: string; end: number }[] {
  const meet = brand.slice(0, brand.indexOf("/* settle:"));
  const rules = [...meet.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  return rules.flatMap(([, selector = "", body = ""]) => {
    const match = /animation:\s*([\w-]+)\s+([\d.]+m?s)(?:\s+[^;]*?)?\s+([\d.]+m?s)\s+\w+;/.exec(body);
    if (!match || selector.includes("@keyframes") || /^\s*(from|to|\d+%)/.test(selector)) return [];
    const [, name = "", duration = "0ms", delay = "0ms"] = match;
    return [{ selector: selector.trim(), name, end: ms(duration) + ms(delay) }];
  });
}

describe("R1-BR-1 · fases da abertura em sequência", () => {
  it("todas as animações do encontro terminam até BRAND_MEET_MIN_MS (o voo só começa com a marca montada)", () => {
    const animations = meetAnimations();
    // mark, word, axis, trend, coin, halo, hint
    expect(animations.map(item => item.name)).toEqual(expect.arrayContaining(["brand-meet-left", "brand-meet-right", "brand-stroke-draw", "coin-pop", "brand-halo"]));
    for (const animation of animations) expect(animation.end, animation.selector).toBeLessThanOrEqual(BRAND_MEET_MIN_MS);
    // The coin is the last beat of the meet: it lands right at the settle (no idle gap, no overlap).
    expect(Math.max(...animations.map(item => item.end))).toBe(BRAND_MEET_MIN_MS);
  });

  it("os tokens CSS espelham as constantes", () => {
    const token = (name: string) => ms(new RegExp(`--motion-brand-${name}:\\s*([\\d.]+m?s)`).exec(brand)?.[1] ?? "NaNms");
    expect(token("meet")).toBe(BRAND_MEET_MIN_MS);
    expect(token("settle")).toBe(BRAND_SETTLE_MS);
    expect(token("leave")).toBe(BRAND_LEAVE_MS);
    expect(token("intro")).toBe(BRAND_INTRO_MS);
    expect(token("max")).toBe(BRAND_INTRO_MAX_MS);
    expect(token("fade")).toBe(BRAND_FADE_MS);
    expect(ms(/--motion-page-loader-delay:\s*([\d.]+m?s)/.exec(brand)?.[1] ?? "NaNms")).toBe(PAGE_LOADER_DELAY_MS);
  });

  it("as entradas da página ficam pausadas sob a abertura (R1-BR-2)", () => {
    expect(brand).toMatch(/html\[data-intro-phase="meet"\] \.page-content \*[\s\S]*animation-play-state: paused/);
  });

  it("os keyframes da marca são definidos uma única vez", () => {
    for (const name of ["brand-meet-left", "brand-meet-right", "coin-pop", "brand-halo", "brand-settle"]) {
      expect(motion.split(`@keyframes ${name} `).length - 1, name).toBe(1);
    }
  });
});
