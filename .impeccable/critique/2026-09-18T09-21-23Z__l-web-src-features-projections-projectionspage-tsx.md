---
target: Projeções (R4 agent B)
total_score: 33
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-18T09-21-23Z
slug: l-web-src-features-projections-projectionspage-tsx
---
⚠️ DEGRADED: single-context (partial). Assessment B's CLI detector ran in an isolated sub-agent, but its in-page half could not: the browser pane is at its tab cap, so the sub-agent could not open a tab of its own. Assessment A and the in-page detector therefore both ran in agent B's reused tab. The in-page detector ran after Assessment A was drafted.

# Critique R4 (agent B): Projeções: 33/40

Heuristics:

| Screen | H1 | H2 | H3 | H4 | H5 | H6 | H7 | H8 | H9 | H10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Projeções | 3 | 4 | 4 | 3 | 3 | 3 | 3 | 3 | 3 | 4 |

## 2. Projeções: 33/40 (R3 32)

R3 verification:

| R3 id | Status | Evidence |
|---|---|---|
| R3-PRJ-1 | **fixed** | The Aporte hint now reads "Mínimo do plano (10% do salário): R$ 1.100,00" and there is a "Plano (10%)" chip. A callout says "R$ 733,33 por mês ficam em conta; o plano pede ao menos R$ 1.100,00 investidos. Usar o mínimo do plano". |
| R3-PRJ-2 | **fixed** | "≈ 06/2029 (2 anos e 9 meses)", "≈ 02/2052", "≈ 09/2027 (1 ano)". |
| R3-PRJ-3 | **fixed** | On mobile, Sobra spans the full row. |
| R3-PRJ-4 | **fixed** | No `line-length` findings. |

**R4-PRJ-1 · P3 · "Usar o mínimo do plano" does not look like a button.** In the info callout it renders as bold text without a visible border or fill, so its affordance is weak next to the chips above. Give it the `btn small` style (or the chip style of "Plano (10%)").
- **Command:** `/impeccable polish`. **Files:** `features/projections/ProjectionsPage.tsx`.

**R4-PRJ-2 · P3 · Marcos: the in-horizon items use a muddy olive fill.** "Viagem ao Japão" and "Notebook novo" get a brownish tint on noite that reads as disabled or warning, not "reachable". Use the accent tint (≤ 8%) for "No prazo" and the success tint for "Concluída", or drop the fill and rely on the badge.
- **Command:** `/impeccable colorize`.

**R4-PRJ-3 · P3 · On mobile the Cenário form (about 700 px) pushes every result below the fold.** Only the sticky "Patrimônio em 12 meses" is visible. Collapse CDI/IPCA/rentabilidade into a "Premissas" disclosure on mobile, closed by default.
- **Command:** `/impeccable adapt`.


Full report: scratchpad CRITIQUE-R4-B.md (MEL-47 states, detector table).
