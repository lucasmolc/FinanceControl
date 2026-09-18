---
target: Cartões (com faturas)
total_score: 33
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-18T09-17-53Z
slug: web-src-features-catalog-catalogpages-tsx-cartoes
---
⚠️ DEGRADED: parcial (o agente A da R4 é um subagente que critica 9 telas numa sessão só; a Avaliação A foi feita inline no agente e a Avaliação B rodou num sub-agente isolado, mas o resultado de B chegou antes de A terminar as telas 2–9)

# Crítica de design: Cartões (com faturas) (R4, depois do fix R3)

## Design Health Score
| # | Heurística | Nota | Ponto-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 4 | Faturas por status (Vencida, Atual), limite pessoal e disponível. |
| 2 | Correspondência com o mundo real | 4 | “Melhor dia de compra”, “Fecha dia 3 · Vence dia 10”. |
| 3 | Controle e liberdade | 3 | Pagar, antecipar, ver fatura. |
| 4 | Consistência e padrões | 3 | Resumo de assinaturas igual nos dois cartões. |
| 5 | Prevenção de erros | 3 | “Pague a mais antiga primeiro” e botão primário só na mais antiga. |
| 6 | Reconhecimento em vez de memória | 4 | Arte do cartão com bandeira e cores do banco. |
| 7 | Flexibilidade e eficiência | 3 | Antecipar pagamento da fatura atual. |
| 8 | Estética e minimalismo | 3 | Espaço vazio de ~50 px entre o nome do cartão e a arte. |
| 9 | Recuperação de erros | 3 | Recuperação automática. |
| 10 | Ajuda e documentação | 3 | Fechamento/vencimento explicados em cada fatura. |
| **Total** | | **33/40** | **Bom** |

## Verificação dos itens R3
R3-CARD-1 corrigido (“Ver 1 fatura futura”) · R3-CARD-2 corrigido (“Total mensal equivalente: R$ 21,90 · 0,7% do limite pessoal” nos dois) · R3-CARD-3 corrigido (arte alinhada ao bloco de limites)

## Veredito de especificidade
**LLM:** A tela mais autoral do app: arte do cartão, limite pessoal vs banco, faturas com status.

**Detector:** CLI `detect.mjs --json` em `features/{dashboard,transactions,planning,wealth,catalog,closing}` e `components/`: `[]` (exit 0) nas 7 pastas. Navegador: `ai-color-palette` (gradiente roxo) e `nested-cards` em `div.visual-card` — intencionais (arte do cartão físico dentro do painel). Achados comuns no navegador (`detect.js` injetado pelo live-server, 1024 px): `dark-glow` no logo (intencional) e `border-accent-on-rounded` nos `kbd` (falso positivo); `ai-color-palette` nos ícones de categoria (falso positivo, conta 1 por `<path>`).

## O que funciona
- Faturas vencidas com orientação de ordem de pagamento.
- Limite pessoal separado do limite do banco.
- Resumo de assinaturas por cartão.

## Problemas prioritários
- **[P3] R4-CARD-1: Vazio entre o cabeçalho do card e a arte**
  - Evidência: Em 1440 há ~50 px vazios abaixo de “Nubank Roxinho” antes da arte e do bloco de limites (em todos os temas).
  - Correção: Alinhar o bloco arte+limites ao topo, logo abaixo do nome (`align-items: start`), ou pôr o nome dentro da linha da arte.
  - Comando: `/impeccable layout` · Arquivos: `features/catalog/CatalogPages.tsx, styles/pages-b.css`
- **[P3] R4-CARD-2: “Ver 1 fatura futura” parece texto**
  - Evidência: Botão sem borda nem ícone, em 13 px bold, logo abaixo das faturas; não parece clicável.
  - Correção: Mesmo estilo de link dos widgets (“… →”) ou `summary` com chevron.
  - Comando: `/impeccable polish` · Arquivos: `features/catalog/CardInvoices.tsx`

## Personas
**Alex:** paga e antecipa direto do card. **Jordan:** “Melhor dia de compra” e “Pague a mais antiga primeiro” guiam sem jargão.

## Carga cognitiva
Falhas no checklist: 0.

## Perguntas
- A fatura futura precisa de um botão, ou poderia aparecer só como linha da Atual?
