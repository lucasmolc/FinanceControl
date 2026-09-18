---
target: App shell (R4 agent B)
total_score: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-18T09-21-24Z
slug: src-financecontrol-web-src-components-appshell-tsx
---
⚠️ DEGRADED: single-context (partial). Assessment B's CLI detector ran in an isolated sub-agent, but its in-page half could not: the browser pane is at its tab cap, so the sub-agent could not open a tab of its own. Assessment A and the in-page detector therefore both ran in agent B's reused tab. The in-page detector ran after Assessment A was drafted.

# Critique R4 (agent B): App shell: 34/40

Heuristics:

| Screen | H1 | H2 | H3 | H4 | H5 | H6 | H7 | H8 | H9 | H10 |
|---|---|---|---|---|---|---|---|---|---|---|
| App shell | 3 | 3 | 4 | 4 | 3 | 4 | 4 | 3 | 3 | 3 |

## 10. App shell / navegação: 34/40 (R3 33)

R3 verification:

| R3 id | Status | Evidence |
|---|---|---|
| R3-SH-1 / R3-X-1 | **fixed** | One banner, no duplicate toasts (Relatórios, Mercado, RecordModal save). |

- Also still passing: the mobile dock "Visão geral · Extrato · + · A pagar · Mais" and the Mais panel (10 destinations, opaque `rgb(14,21,32)`, focus on the first item).
- Remaining issues: **R4-SH-1** (P2, silent offline privacy toggle) and **R4-SH-2** (P3, slow reconnect), both listed above under Cross-cutting.


## Cross-cutting


**R4-SH-1 · P2 · Offline, the privacy toggle (eye) silently does nothing.**
- **Observed:** with the API down on Mercado, clicking "Ocultar valores" left `aria-pressed="false"` and no "•••" appeared. There was no toast and no message: the optimistic update rolls back when the save fails. Before R3 a toast at least said so; the central toast suppression made the failure silent.
- **Why it matters:** hiding values is a privacy action, typically used on the spot in public.
- **Fix:** treat UI preferences (`hide_values`, theme, density, animations) as local-first while offline:
  - apply them immediately and keep them in `localStorage`;
  - queue the `ui_preferences` PUT and flush it when `connectivityStatus()` returns online;
  - never roll a preference back because of a connectivity error. Roll back only on a 4xx.
- **Command:** `/impeccable harden`.
- **Files:** `hooks/usePreferences.ts`, `components/HideValuesToggle.tsx`, `App.tsx:356` (`toggleHideValues`), `features/settings/AppearanceSection.tsx`.

**R4-SH-2 · P3 · Reconnect can take about 18 s after the server is back** (Mercado: 10.3 s of waiting after a 5 s restart gap). The banner offers "Tentar agora", so a workaround exists. Cap the backoff at about 5 s, or also probe on `focus` / `visibilitychange`. Files: the connectivity poller used by `OfflineBanner.tsx`.


Full report: scratchpad CRITIQUE-R4-B.md (MEL-47 states, detector table).
