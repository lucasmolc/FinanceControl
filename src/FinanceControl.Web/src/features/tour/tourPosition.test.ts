import { describe, expect, it } from "vitest";
import { phoneTargetTop, tourPosition } from "./tourPosition";

const viewport = { width: 1440, height: 900 };
const popover = { width: 400, height: 220 };

describe("CR-07 · posição do popover do tour", () => {
  it("fica logo abaixo do alvo, com a seta no centro dele", () => {
    const position = tourPosition({ top: 80, left: 300, width: 200, height: 60 }, popover, viewport);
    expect(position.placement).toBe("below");
    expect(position.top).toBe(80 + 60 + 14);
    expect(position.left).toBe(200);
    expect(position.arrow).toBe(200);
  });

  it("vira para cima quando não cabe embaixo", () => {
    const position = tourPosition({ top: 700, left: 1300, width: 120, height: 60 }, popover, viewport);
    expect(position.placement).toBe("above");
    expect(position.top).toBe(700 - 14 - 220);
    expect(position.left).toBe(1440 - 12 - 400);
    expect(position.arrow).toBe(1360 - 1028);
  });

  it("encosta no rodapé (acima da doca) quando o alvo é maior que a tela", () => {
    const position = tourPosition({ top: 20, left: 0, width: 375, height: 1400 }, { width: 351, height: 240 }, { width: 375, height: 812 }, 104);
    expect(position).toEqual({ placement: "docked", top: 812 - 104 - 12 - 240, left: 12, arrow: null });
  });

  it("fica ao lado de alvos altos, como a barra lateral", () => {
    const position = tourPosition({ top: 0, left: 0, width: 256, height: 900 }, popover, viewport);
    expect(position.placement).toBe("right");
    expect(position.left).toBe(256 + 14);
    expect(position.top).toBe(20);
    expect(position.arrow).toBe(40);
  });
});

describe("R2-TOUR-1 · no celular o popover não cobre o alvo", () => {
  const phone = { width: 375, height: 812 };
  it("rola o alvo para que alvo + popover caibam entre a barra do topo e a doca", () => {
    const top = phoneTargetTop(251, 241, phone, 104, 64);
    const position = tourPosition({ top, left: 12, width: 351, height: 251 }, { width: 351, height: 241 }, phone, 104);
    expect(position.placement).toBe("below");
    expect(top).toBeGreaterThanOrEqual(64 + 12);
    expect(position.top).toBeGreaterThanOrEqual(top + 251);
    expect(position.top + 241).toBeLessThanOrEqual(812 - 104 - 12);
  });

  it("alvo maior que o espaço vai para o topo", () => {
    expect(phoneTargetTop(600, 240, phone, 104, 64)).toBe(64 + 12);
  });
});
