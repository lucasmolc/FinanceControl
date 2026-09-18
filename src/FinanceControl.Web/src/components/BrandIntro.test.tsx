// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRAND_FADE_MS, BRAND_INTRO_MAX_MS, BRAND_INTRO_MIN_MS, BRAND_INTRO_MS, BRAND_LEAVE_MS, BRAND_MEET_MIN_MS, BRAND_SETTLE_DEADLINE_MS,
  BRAND_SETTLE_MS, PAGE_LOADER_DELAY_MS, PAGE_TRANSITION_MS, settleFlip,
} from "../lib/brandMotion";
import { BrandIntro } from "./BrandIntro";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); document.querySelectorAll(".brand-lockup").forEach(element => element.remove()); });

const overlay = () => document.querySelector<HTMLElement>("[data-brand-intro]")!;
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** Visible shell lockup to fly to (sidebar mark 30px at 20,20). */
function shellLockup() {
  const target = document.createElement("span");
  target.className = "brand-lockup";
  target.innerHTML = "<svg class=\"logo-mark\"></svg>";
  target.getBoundingClientRect = () => rect(20, 20, 140, 30);
  target.querySelector<SVGElement>(".logo-mark")!.getBoundingClientRect = () => rect(20, 20, 30, 30);
  document.body.appendChild(target);
  return target;
}

/** jsdom has no layout: gives the intro lockup and mark their centred geometry (64px mark at 400,300). */
function stubIntroGeometry() {
  document.querySelector<HTMLElement>(".brand-intro-lockup")!.getBoundingClientRect = () => rect(400, 300, 300, 64);
  document.querySelector<SVGElement>(".brand-intro-mark .logo-mark")!.getBoundingClientRect = () => rect(400, 300, 64, 64);
}

describe("MEL-48 · tempos da abertura (uma constante)", () => {
  it("abertura ~1,2 s com as fases em sequência (encontro 700 + voo 320 + saída 180), teto 1,8 s; troca de página ≤ 300 ms; mini-loader só depois de 400 ms", () => {
    expect(BRAND_INTRO_MS).toBe(1200);
    expect(BRAND_MEET_MIN_MS).toBe(700);
    expect(BRAND_INTRO_MIN_MS).toBe(BRAND_INTRO_MS);
    expect(BRAND_INTRO_MAX_MS).toBe(1800);
    expect(BRAND_MEET_MIN_MS + BRAND_SETTLE_MS + BRAND_LEAVE_MS).toBe(BRAND_INTRO_MIN_MS);
    expect(BRAND_SETTLE_DEADLINE_MS + BRAND_SETTLE_MS + BRAND_LEAVE_MS).toBe(BRAND_INTRO_MAX_MS);
    expect(PAGE_TRANSITION_MS).toBeLessThanOrEqual(300);
    expect(PAGE_LOADER_DELAY_MS).toBe(400);
  });

  it("FLIP leva a marca da abertura exatamente sobre a marca do shell", () => {
    // lockup 400,300 (h 64), mark 400,300 64×64 → sidebar mark 20,20 30×30
    const values = settleFlip(rect(400, 300, 300, 64), rect(400, 300, 64, 64), rect(20, 20, 30, 30))!;
    const scale = Number(values["--settle-scale" as keyof typeof values]);
    const dx = parseFloat(String(values["--settle-x" as keyof typeof values]));
    const dy = parseFloat(String(values["--settle-y" as keyof typeof values]));
    expect(scale).toBeCloseTo(30 / 64, 3);
    // mark left-centre (400, 332) scaled about the lockup origin (400, 332) then translated lands on (20, 35)
    expect(400 + dx).toBe(20);
    expect(332 + dy).toBe(35);
    expect(settleFlip(rect(0, 0, 10, 10), rect(0, 0, 0, 0), rect(0, 0, 10, 10))).toBeNull();
  });
});

describe("MEL-48 · BrandIntro", () => {
  it("com dados prontos: encontro, voo até a marca do shell e saída — termina em 1,2 s", () => {
    shellLockup();
    const onDone = vi.fn();
    render(<BrandIntro ready onDone={onDone} motion coarsePointer={false} />);
    stubIntroGeometry();
    expect(screen.getByRole("status").textContent).toContain("Carregando LMM Finance Control…");
    expect(overlay().className).toContain("is-motion");
    expect(overlay().dataset.phase).toBe("meet");
    expect(document.documentElement.dataset.introPhase).toBe("meet");
    advance(BRAND_MEET_MIN_MS - 1);
    expect(overlay().dataset.phase).toBe("meet");
    advance(1);
    expect(overlay().dataset.phase).toBe("settle");
    expect(document.querySelector<HTMLElement>(".brand-intro-lockup")!.style.getPropertyValue("--settle-scale")).toBe(String(Math.round((30 / 64) * 1000) / 1000));
    advance(BRAND_SETTLE_MS);
    expect(overlay().dataset.phase).toBe("leave");
    expect(document.documentElement.dataset.introPhase).toBe("leave");
    expect(onDone).not.toHaveBeenCalled();
    advance(BRAND_LEAVE_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("termina assim que os dados chegam depois do mínimo", () => {
    shellLockup();
    const onDone = vi.fn();
    const { rerender } = render(<BrandIntro ready={false} onDone={onDone} motion />);
    stubIntroGeometry();
    advance(700);
    expect(overlay().dataset.phase).toBe("meet");
    rerender(<BrandIntro ready onDone={onDone} motion />);
    expect(overlay().dataset.phase).toBe("settle");
    advance(BRAND_SETTLE_MS);
    advance(BRAND_LEAVE_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("dados tardios pulam o voo (só fade) e, depois do teto, a abertura vira um estado estático", () => {
    shellLockup();
    const onDone = vi.fn();
    const { rerender } = render(<BrandIntro ready={false} onDone={onDone} motion />);
    advance(BRAND_INTRO_MAX_MS);
    expect(overlay().className).toContain("is-static");
    expect(overlay().className).toContain("is-waiting");
    expect(overlay().textContent).toContain("Carregando…");
    rerender(<BrandIntro ready onDone={onDone} motion />);
    expect(overlay().dataset.phase).toBe("leave");
    expect(overlay().className).toContain("is-fade");
    advance(BRAND_FADE_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("sem alvo visível (setup, erro) sai com fade", () => {
    const onDone = vi.fn();
    render(<BrandIntro ready onDone={onDone} motion />);
    advance(BRAND_MEET_MIN_MS);
    expect(overlay().dataset.phase).toBe("leave");
    advance(BRAND_FADE_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("Esc ou clique pulam com o fade curto (R2-BR-2, sem corte seco); Enter não é capturado", () => {
    const onDone = vi.fn();
    render(<BrandIntro ready onDone={onDone} motion coarsePointer={false} />);
    expect(overlay().textContent).toContain("Esc para pular");
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(overlay().dataset.phase).toBe("leave");
    expect(overlay().className).toContain("is-fade");
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    advance(BRAND_FADE_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
    cleanup();

    const onClickDone = vi.fn();
    render(<BrandIntro ready onDone={onClickDone} motion />);
    fireEvent.click(overlay());
    advance(BRAND_FADE_MS);
    expect(onClickDone).toHaveBeenCalledTimes(1);
  });

  it("em tela de toque a dica é “Toque para pular”", () => {
    render(<BrandIntro ready={false} onDone={vi.fn()} motion coarsePointer />);
    expect(overlay().textContent).toContain("Toque para pular");
  });

  it("pular antes de carregar deixa o encontro terminar no centro (sem salto) e só troca a dica até ficar pronto", () => {
    const onDone = vi.fn();
    const { rerender } = render(<BrandIntro ready={false} onDone={onDone} motion />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDone).not.toHaveBeenCalled();
    expect(overlay().className).toContain("is-skipped");
    expect(overlay().className).toContain("is-waiting");
    expect(overlay().className).toContain("is-motion");
    expect(overlay().dataset.phase).toBe("meet");
    // Both hints live in one area and crossfade by class: no text swap, no jump.
    expect(overlay().querySelector(".hint-skip")).not.toBeNull();
    expect(overlay().querySelector(".hint-waiting")?.textContent).toBe("Carregando…");
    rerender(<BrandIntro ready onDone={onDone} motion />);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("com movimento reduzido não há espera artificial: fade assim que estiver pronto", () => {
    shellLockup();
    const onDone = vi.fn();
    const { rerender } = render(<BrandIntro ready={false} onDone={onDone} motion={false} />);
    expect(overlay().className).toContain("is-static");
    expect(overlay().className).not.toContain("is-motion");
    rerender(<BrandIntro ready onDone={onDone} motion={false} />);
    expect(overlay().dataset.phase).toBe("leave");
    expect(document.querySelector<HTMLElement>(".brand-intro-lockup")!.getAttribute("style")).toBeNull();
    advance(BRAND_FADE_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("remove o atributo de fase do <html> ao terminar", () => {
    const { unmount } = render(<BrandIntro ready={false} onDone={vi.fn()} motion />);
    expect(document.documentElement.dataset.introPhase).toBe("meet");
    unmount();
    expect(document.documentElement.dataset.introPhase).toBeUndefined();
  });
});
