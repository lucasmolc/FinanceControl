---
target: Contas bancárias
total_score: 33
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-18T09-17-53Z
slug: ncecontrol-web-src-features-wealth-wealthpages-tsx
---
⚠️ DEGRADED: parcial (o agente A da R4 é um subagente que critica 9 telas numa sessão só; a Avaliação A foi feita inline no agente e a Avaliação B rodou num sub-agente isolado, mas o resultado de B chegou antes de A terminar as telas 2–9)

# Crítica de design: Contas bancárias (R4, depois do fix R3)

## Design Health Score
| # | Heurística | Nota | Ponto-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 4 | Saldo projetado por conta e consolidado, com o que sai até o fim do mês. |
| 2 | Correspondência com o mundo real | 3 | Nota do consolidado longa (116 caracteres por linha). |
| 3 | Controle e liberdade | 3 | Movimentar, extrato, menu. |
| 4 | Consistência e padrões | 3 | Mesmo padrão de card de Investimentos. |
| 5 | Prevenção de erros | 3 | Movimentar com confirmação. |
| 6 | Reconhecimento em vez de memória | 4 | Cada conta lista os pagamentos que entram na projeção. |
| 7 | Flexibilidade e eficiência | 3 | Ordenar por saldo ou uso recente. |
| 8 | Estética e minimalismo | 3 | Limpa; nota do consolidado pesa. |
| 9 | Recuperação de erros | 3 | Recuperação automática. |
| 10 | Ajuda e documentação | 4 | A projeção explica o que entra e o que não entra. |
| **Total** | | **33/40** | **Bom** |

## Verificação dos itens R3
R3-CONTAS-1 corrigido (consolidado R$ 36.202,20 = 43.206,60 − 3.413,40 − 3.591,00; conferido) · R3-CONTAS-2 corrigido (“Última movimentação” em 13–14 px muted)

## Veredito de especificidade
**LLM:** Específica: projeção de saldo com contas e faturas do mês, logos dos bancos.

**Detector:** CLI `detect.mjs --json` em `features/{dashboard,transactions,planning,wealth,catalog,closing}` e `components/`: `[]` (exit 0) nas 7 pastas. Navegador: `line-length` em `p.field-hint.account-invoices-note` (~116 caracteres por linha) — real. Achados comuns no navegador (`detect.js` injetado pelo live-server, 1024 px): `dark-glow` no logo (intencional) e `border-accent-on-rounded` nos `kbd` (falso positivo); `ai-color-palette` nos ícones de categoria (falso positivo, conta 1 por `<path>`).

## O que funciona
- Consolidado agora inclui as contas sem conta vinculada, com nota.
- Projeção por conta lista cada pagamento.
- Hierarquia de texto corrigida.

## Problemas prioritários
- **[P3] R4-CONTAS-1: Nota do consolidado longa e solta**
  - Evidência: “3 faturas de cartão (3 vencidas) e 3 contas sem conta definida (2 vencidas) a pagar (R$ 3.591,00) entram só no saldo projetado consolidado: a conta é escolhida ao pagar.” em linha de 116 caracteres, fora do card.
  - Correção: Mover para dentro do KPI Saldo projetado como `details`: “Inclui R$ 3.591,00 sem conta definida (3 faturas, 3 contas)”; `max-width: 65ch`.
  - Comando: `/impeccable clarify` · Arquivos: `features/wealth/WealthPages.tsx, styles/pages-a.css`

## Personas
**Alex:** vê o saldo depois dos pagamentos por conta. **Jordan:** a nota do consolidado é difícil de ler numa linha só.

## Carga cognitiva
Falhas no checklist: 0.

## Perguntas
- O saldo projetado deveria permitir escolher a conta das faturas ali mesmo?
