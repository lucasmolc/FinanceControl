---
target: RecordModal (R4 agent B)
total_score: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-18T09-21-23Z
slug: cecontrol-web-src-features-records-recordmodal-tsx
---
⚠️ DEGRADED: single-context (partial). Assessment B's CLI detector ran in an isolated sub-agent, but its in-page half could not: the browser pane is at its tab cap, so the sub-agent could not open a tab of its own. Assessment A and the in-page detector therefore both ran in agent B's reused tab. The in-page detector ran after Assessment A was drafted.

# Critique R4 (agent B): RecordModal: 34/40

Heuristics:

| Screen | H1 | H2 | H3 | H4 | H5 | H6 | H7 | H8 | H9 | H10 |
|---|---|---|---|---|---|---|---|---|---|---|
| RecordModal | 4 | 3 | 4 | 3 | 4 | 3 | 4 | 3 | 3 | 3 |

## 5. Formulário de registro (RecordModal): 34/40 (R3 32)

R3 verification:

| R3 id | Status | Evidence |
|---|---|---|
| R3-REC-1 | **fixed** | Typing "Padaria teste" and pressing Esc, or typing "Pets" in Nova categoria and pressing Esc, or pressing Cancelar, all bring up "Descartar o que foi preenchido?" with **Continuar editando** (focused, safe default) and Descartar. Esc on the confirm returns to the form with the data kept. A pristine Nova assinatura closes on Esc without asking. |
| R3-REC-2 | **fixed** | Inline notice before submit, with "Usar 01/10/2026" and "Reabrir setembro". The reopen confirm returns to the form. |
| R3-REC-3 | **fixed** | Mobile "Salvar e outro" has normal spacing (`.btn-label` wrapper). |
| R3-REC-4 | **fixed** | Subscription form: Cartão (opcional) sits under Periodicidade, and Categoria defaults to a lazer-bucket category. |

**R4-REC-1 · P3 · A connectivity error stays in the form after the server returns.** I saved while offline and got "Não foi possível salvar. Não foi possível conectar ao servidor local…". The API came back and the banner cleared 1.3 s later, but the red error box stayed until I edited or submitted.
- **Fix:** clear connectivity-type form errors when status goes back to online, optionally with "Conexão restabelecida. Tente salvar de novo."
- Also align the wording with the banner: drop "Verifique se a aplicação está em execução" and use "Sem conexão com o servidor local. Seus dados continuam aqui; salve quando ele voltar."
- **Command:** `/impeccable harden`. **Files:** `features/records/RecordModal.tsx`, `features/records/offline.ts`.

**R4-REC-2 · P3 · The dirty check fires on app-made changes.** After only clicking "Usar 01/10/2026" (no typing), Cancelar asks "Descartar o que foi preenchido?". Compare against the form's baseline *after* app-suggested fixes, or ignore the date field when it was set by the closed-month action.
- **Files:** `RecordModal.tsx` (dirty baseline).

**R4-REC-3 · P3 · Closed-month actions sit under Valor, not under Data.** On desktop the "Usar 01/10/2026 · Reabrir setembro" row spans the left column, below Valor. The error is under Data (right column), so the actions are detached from the field they fix. Also, the Data field shows a red error state on a form the user has not touched yet, which reads as a mistake the user made. The fixes:
- Place the actions directly under the Data message (right column), or full width after the Data/Valor row with the message above them.
- Use a neutral or warning tone (not error red) until submit.

**Files:** `features/records/fields.tsx` (date field), `ClosedMonthActions.tsx`.

**R4-REC-4 · P3 · Toast capitalisation differs.** "Setembro de 2026 foi fechado." vs "setembro de 2026 foi reaberto." Capitalise the month at the start of the reopen toast. **Files:** the closing hooks (`features/closing/*`).

**R4-REC-5 · P3 · New subscription defaults "Dia da cobrança" to 1**, not today (18). With "Próxima cobrança" empty, a subscription created on the 18th is assumed to bill on the 1st. Default to today's day.


Full report: scratchpad CRITIQUE-R4-B.md (MEL-47 states, detector table).
