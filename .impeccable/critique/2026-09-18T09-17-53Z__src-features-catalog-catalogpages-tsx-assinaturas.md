---
target: Assinaturas
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-18T09-17-53Z
slug: src-features-catalog-catalogpages-tsx-assinaturas
---
⚠️ DEGRADED: parcial (o agente A da R4 é um subagente que critica 9 telas numa sessão só; a Avaliação A foi feita inline no agente e a Avaliação B rodou num sub-agente isolado, mas o resultado de B chegou antes de A terminar as telas 2–9)

# Crítica de design: Assinaturas (R4, depois do fix R3)

## Design Health Score
| # | Heurística | Nota | Ponto-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 4 | “Cobrança de 08/09 não lançada” com Lançar na linha. |
| 2 | Correspondência com o mundo real | 3 | Custo mensal equivalente explicado (anuais ÷ 12). |
| 3 | Controle e liberdade | 3 | Lançar, menu, filtro pelo KPI. |
| 4 | Consistência e padrões | 3 | Cabeçalho “Por mês” sem moeda repetida. |
| 5 | Prevenção de erros | 3 | Lançar confirma. |
| 6 | Reconhecimento em vez de memória | 4 | Logos dos serviços; moeda original mostrada (US$ 4,99). |
| 7 | Flexibilidade e eficiência | 3 | KPI filtra as cobranças a lançar. |
| 8 | Estética e minimalismo | 3 | Em 1024 a tabela rola de lado e o Lançar some; no celular ~340 px antes dos KPIs. |
| 9 | Recuperação de erros | 3 | Recuperação automática. |
| 10 | Ajuda e documentação | 3 | Subtítulo e KPI explicam o cálculo. |
| **Total** | | **32/40** | **Bom** |

## Verificação dos itens R3
R3-ASSIN-1 corrigido (no celular o KPI-filtro tem 44 px; no desktop o botão mede 48×32, ok para mouse) · R3-ASSIN-2 corrigido (“Por mês”; “Ver só estas” em linha própria)

## Veredito de especificidade
**LLM:** Específica: conversão de moeda, cobranças não lançadas, cartão de cobrança.

**Detector:** CLI `detect.mjs --json` em `features/{dashboard,transactions,planning,wealth,catalog,closing}` e `components/`: `[]` (exit 0) nas 7 pastas. Navegador: `cramped-padding`/`edge-flush-cards` no `div.table-wrap` (963 px dentro de 692 px em 1024) — real. Achados comuns no navegador (`detect.js` injetado pelo live-server, 1024 px): `dark-glow` no logo (intencional) e `border-accent-on-rounded` nos `kbd` (falso positivo); `ai-color-palette` nos ícones de categoria (falso positivo, conta 1 por `<path>`).

## O que funciona
- Cobranças vencidas não lançadas no topo com ação na linha.
- Equivalente mensal com moeda original.
- KPI que filtra.

## Problemas prioritários
- **[P2] R4-X-1: Tabelas com rolagem lateral em 1024 px**
  - Evidência: Com a barra lateral aberta, a área útil é 692 px: `.table-wrap` mede 805/907 px em Contas a pagar, 1129 px em Categorias e 963 px em Assinaturas; a coluna de ações (Pagar fatura, Lançar, editar/remover) fica fora da tela e o nome da fatura quebra em 4 linhas.
  - Correção: Abaixo de ~1180 px de área útil, usar o layout de linha empilhada que já existe no celular (nome + meta numa célula, ações num menu `…`), ou esconder colunas secundárias (Categoria, Cartão, Tipo) com `@container`.
  - Comando: `/impeccable adapt` · Arquivos: `styles/pages-a.css, styles/pages-b.css, CatalogPages.tsx, PlanningPages.tsx`
- **[P3] R4-ASSIN-1: Cartão da cobrança cortado no celular**
  - Evidência: 375 px: “Cobrança de 12/09 · Nubank Roxinho” 141/211, “Próxima 20/09 · Nubank Roxinho” 122/186 — o cartão some.
  - Correção: Cartão em linha própria (logo + nome curto).
  - Comando: `/impeccable adapt` · Arquivos: `styles/touch.css, features/catalog/CatalogPages.tsx`

## Personas
**Alex:** lança as duas cobranças da própria linha. **Casey:** o topo (H1, H2, parágrafo de 4 linhas, botão) empurra os números para baixo da dobra.

## Carga cognitiva
Falhas no checklist: 0.

## Perguntas
- O parágrafo de explicação precisa ficar sempre visível, ou poderia ir para um “Como calculamos”?
