---
target: Investimentos
total_score: 33
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-18T09-17-53Z
slug: src-features-wealth-wealthpages-tsx-investimentos
---
⚠️ DEGRADED: parcial (o agente A da R4 é um subagente que critica 9 telas numa sessão só; a Avaliação A foi feita inline no agente e a Avaliação B rodou num sub-agente isolado, mas o resultado de B chegou antes de A terminar as telas 2–9)

# Crítica de design: Investimentos (R4, depois do fix R3)

## Design Health Score
| # | Heurística | Nota | Ponto-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 3 | Resultado e rentabilidade por aplicação; offline com estado único. |
| 2 | Correspondência com o mundo real | 4 | “Rende 110% do CDI (≈ 15,29% ao ano hoje)”, “Segue o índice S&P 500 · sem rendimento garantido”. |
| 3 | Controle e liberdade | 3 | Movimentar, histórico, menu. |
| 4 | Consistência e padrões | 3 | Badges de tipo todos verdes, enquanto a alocação usa verde/roxo/laranja por tipo. |
| 5 | Prevenção de erros | 3 | Movimentar com confirmação. |
| 6 | Reconhecimento em vez de memória | 4 | Referência e liquidez em chips. |
| 7 | Flexibilidade e eficiência | 4 | Por tipo/liquidez, ordenação, cartões/lista. |
| 8 | Estética e minimalismo | 3 | Cabeçalho duplo (H1 + H2 “Carteira de investimentos” + subtítulo). |
| 9 | Recuperação de erros | 3 | Recuperação automática. |
| 10 | Ajuda e documentação | 3 | Linhas de rendimento explicam cada ativo. |
| **Total** | | **33/40** | **Bom** |

## Verificação dos itens R3
R3-INV-1 corrigido (“Segue o índice S&P 500 · sem rendimento garantido”) · R3-INV-2 corrigido (A–Z com 44 px no celular)

## Veredito de especificidade
**LLM:** Específica: Tesouro, CDI, S&P 500 em reais, liquidez D+1.

**Detector:** CLI `detect.mjs --json` em `features/{dashboard,transactions,planning,wealth,catalog,closing}` e `components/`: `[]` (exit 0) nas 7 pastas. Navegador: Nenhum achado além do shell. Achados comuns no navegador (`detect.js` injetado pelo live-server, 1024 px): `dark-glow` no logo (intencional) e `border-accent-on-rounded` nos `kbd` (falso positivo); `ai-color-palette` nos ícones de categoria (falso positivo, conta 1 por `<path>`).

## O que funciona
- Cada ativo diz como rende hoje.
- Alocação por tipo e por liquidez.
- Resultado em R$ e % lado a lado.

## Problemas prioritários
- **[P3] R4-INV-1: Cor do badge de tipo não bate com a legenda da alocação**
  - Evidência: Alocação: Tesouro verde, Renda fixa roxo, Ações laranja; os badges “Renda fixa” e “Ações” nos cards são verdes.
  - Correção: Badge de tipo com o ponto/cor da série da alocação (`seriesColor`), ou neutro.
  - Comando: `/impeccable colorize` · Arquivos: `features/wealth/WealthPages.tsx`
- **[P3] R4-X-2: Cabeçalho duplo em todas as telas de cadastro**
  - Evidência: H1 + subtítulo e logo abaixo H2 + outro subtítulo (Investimentos, Contas bancárias, Cartões, Metas, Categorias, Assinaturas); no celular são ~340 px antes do primeiro número em Assinaturas.
  - Correção: Um só nível: H1 com o subtítulo mais útil; o H2 vira `aria-label` da seção.
  - Comando: `/impeccable distill` · Arquivos: `components/PageHeader (ou equivalente), páginas de cadastro`

## Personas
**Alex:** alterna tipo/liquidez e lista rapidamente. **Jordan:** entende o que é cada ativo pelas linhas “Rende…”.

## Carga cognitiva
Falhas no checklist: 0.

## Perguntas
- Os badges de tipo precisam existir se a alocação já mostra o tipo por cor?
