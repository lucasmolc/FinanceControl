---
target: Categorias
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-18T09-17-53Z
slug: econtrol-web-src-features-catalog-catalogpages-tsx
---
⚠️ DEGRADED: parcial (o agente A da R4 é um subagente que critica 9 telas numa sessão só; a Avaliação A foi feita inline no agente e a Avaliação B rodou num sub-agente isolado, mas o resultado de B chegou antes de A terminar as telas 2–9)

# Crítica de design: Categorias (R4, depois do fix R3)

## Design Health Score
| # | Heurística | Nota | Ponto-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 4 | Uso do limite por categoria e baldes do plano no topo. |
| 2 | Correspondência com o mundo real | 3 | “Sem limite (não é despesa)”, “passam R$ 100,00”. |
| 3 | Controle e liberdade | 3 | Filtros por tipo, editar, remover. |
| 4 | Consistência e padrões | 3 | Tipo “Despesa” como texto e badges só para Receita/Investimento. |
| 5 | Prevenção de erros | 3 | Balde escolhido por select inline. |
| 6 | Reconhecimento em vez de memória | 4 | Ícones de categoria, baldes nomeados. |
| 7 | Flexibilidade e eficiência | 3 | Troca de balde inline, filtros. |
| 8 | Estética e minimalismo | 3 | 9 selects de balde por tela; em 1024 a tabela mede 1129 px em 692 px. |
| 9 | Recuperação de erros | 3 | Recuperação automática. |
| 10 | Ajuda e documentação | 3 | Subtítulo explica limite, balde e mês. |
| **Total** | | **32/40** | **Bom** |

## Verificação dos itens R3
R3-CAT-1 corrigido (a 375 px nenhum alvo < 44 px) · R3-CAT-2 parcial (“Despesa” virou texto muted; a coluna Tipo continua com 7 linhas iguais)

## Veredito de especificidade
**LLM:** Específica: orçamento por categoria amarrado aos baldes 70-20-10.

**Detector:** CLI `detect.mjs --json` em `features/{dashboard,transactions,planning,wealth,catalog,closing}` e `components/`: `[]` (exit 0) nas 7 pastas. Navegador: `cramped-padding`/`edge-flush-cards` no `div.table-wrap` (confirma a rolagem lateral em 1024) e `cramped-padding` no `span.badge.negative` de “Excedido” (texto encosta nas bordas) — real, borderline. Achados comuns no navegador (`detect.js` injetado pelo live-server, 1024 px): `dark-glow` no logo (intencional) e `border-accent-on-rounded` nos `kbd` (falso positivo); `ai-color-palette` nos ícones de categoria (falso positivo, conta 1 por `<path>`).

## O que funciona
- Baldes do plano com limite, realizado e o quanto os limites das categorias passam do balde.
- Excedido com valor acima.
- Link para categorizar em lote.

## Problemas prioritários
- **[P2] R4-X-1: Tabelas com rolagem lateral em 1024 px**
  - Evidência: Com a barra lateral aberta, a área útil é 692 px: `.table-wrap` mede 805/907 px em Contas a pagar, 1129 px em Categorias e 963 px em Assinaturas; a coluna de ações (Pagar fatura, Lançar, editar/remover) fica fora da tela e o nome da fatura quebra em 4 linhas.
  - Correção: Abaixo de ~1180 px de área útil, usar o layout de linha empilhada que já existe no celular (nome + meta numa célula, ações num menu `…`), ou esconder colunas secundárias (Categoria, Cartão, Tipo) com `@container`.
  - Comando: `/impeccable adapt` · Arquivos: `styles/pages-a.css, styles/pages-b.css, CatalogPages.tsx, PlanningPages.tsx`
- **[P3] R4-CAT-1: Linha de status cortada no celular**
  - Evidência: 375 px: “Excedido · 119% · Lazer · Despesa” 127/193 px, “52% do limite · Gastos fixos · Despesa” 126/217 — o balde some.
  - Correção: Duas linhas: status/percentual e “Balde · Tipo”; ou tirar “Despesa” (padrão).
  - Comando: `/impeccable adapt` · Arquivos: `styles/touch.css, features/catalog/CatalogPages.tsx`
- **[P3] R4-CAT-2: Badge “Excedido” apertado**
  - Evidência: Detector: padding vertical encosta no texto em `td .budget-status span.badge.negative`.
  - Correção: `padding-block: 2px` e `line-height: 1.3` no badge dentro da célula.
  - Comando: `/impeccable polish` · Arquivos: `styles/pages-b.css`

## Personas
**Alex:** troca balde inline, rápido. **Casey:** perde o balde da categoria no celular.

## Carga cognitiva
Falhas no checklist: 1 (9 selects visíveis ao mesmo tempo).

## Perguntas
- O balde precisa ser editável em cada linha, ou só no formulário da categoria?
