/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest stubs stylesheets (even with ?raw), so the files are read from disk.
const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const baseCss = read("base.css");
const dataviz = read("dataviz.css");

// CR-01 regression guard. jsdom has no layout, so the scrollWidth check itself (document.documentElement.scrollWidth ===
// clientWidth at 375px on the Painel and Relatórios) is done in the browser; these assertions pin the CSS that makes
// it hold. The culprit was a visually hidden element (.sr-only, position:absolute) inside the horizontally scrolling
// ticker with no positioned ancestor: it kept its static x far to the right, the ticker could not clip it, and the
// layout viewport grew to ~646px — pushing "Metas" and "Mais" out of the dock and cutting the tour popover.

const rule = (css: string, selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
};

describe("CR-01 · nada escondido alarga a página no celular", () => {
  it(".sr-only fica preso à borda inicial do bloco que o contém", () => {
    const srOnly = rule(baseCss, ".sr-only");
    expect(srOnly).toMatch(/position:\s*absolute/);
    expect(srOnly).toMatch(/left:\s*0/);
    expect(srOnly).toMatch(/overflow:\s*hidden/);
  });

  it("o ticker rolável contém os descendentes posicionados e a tabela oculta dos gráficos sai do fluxo", () => {
    expect(rule(dataviz, ".ticker")).toMatch(/position:\s*relative/);
    const table = rule(dataviz, "table.chart-table");
    expect(table).toMatch(/position:\s*absolute/);
    expect(table).toMatch(/left:\s*0/);
    expect(table).toMatch(/width:\s*1px/);
  });
});
