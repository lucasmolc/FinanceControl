import { describe, expect, it } from "vitest";
import { gridMove } from "./gridNavigation";

// Two groups in a 6-column grid: A has 8 items (rows of 6 + 2), B has 4 items (one row).
//   A: 0 1 2 3 4 5
//      6 7
//   B: 8 9 10 11
const sizes = [8, 4];

describe("MEL-46 · IconPicker ↑/↓ entre grupos", () => {
  it("↓ mantém a coluna e salta para o grupo seguinte na primeira linha", () => {
    expect(gridMove(sizes, 1, "ArrowDown", 6)).toBe(7);   // A row 0 col 1 → A row 1 col 1
    expect(gridMove(sizes, 4, "ArrowDown", 6)).toBe(7);   // col 4 has no cell on A row 1 → clamp to its last (7)
    expect(gridMove(sizes, 7, "ArrowDown", 6)).toBe(9);   // last row of A, col 1 → B col 1
    expect(gridMove(sizes, 10, "ArrowDown", 6)).toBe(10); // last row overall: stays
  });

  it("↑ mantém a coluna e volta para a última linha do grupo anterior", () => {
    expect(gridMove(sizes, 9, "ArrowUp", 6)).toBe(7);     // B col 1 → A last row col 1
    expect(gridMove(sizes, 11, "ArrowUp", 6)).toBe(7);    // B col 3 → A last row has 2 cells → clamp
    expect(gridMove(sizes, 6, "ArrowUp", 6)).toBe(0);
    expect(gridMove(sizes, 2, "ArrowUp", 6)).toBe(2);
  });

  it("←/→ percorrem a ordem plana; listas vazias não quebram", () => {
    expect(gridMove(sizes, 7, "ArrowRight", 6)).toBe(8);
    expect(gridMove(sizes, 8, "ArrowLeft", 6)).toBe(7);
    expect(gridMove(sizes, 11, "ArrowRight", 6)).toBe(11);
    expect(gridMove([], 3, "ArrowDown", 6)).toBe(0);
    expect(gridMove([0, 3], 1, "ArrowUp", 6)).toBe(1);
  });
});
