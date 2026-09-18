---
target: Metas
total_score: 33
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-18T09-17-53Z
slug: web-src-features-planning-planningpages-tsx-metas
---
⚠️ DEGRADED: parcial (o agente A da R4 é um subagente que critica 9 telas numa sessão só; a Avaliação A foi feita inline no agente e a Avaliação B rodou num sub-agente isolado, mas o resultado de B chegou antes de A terminar as telas 2–9)

# Crítica de design: Metas (R4, depois do fix R3)

## Design Health Score
| # | Heurística | Nota | Ponto-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 3 | Progresso, prazo e aporte sugerido visíveis; offline com estado único. |
| 2 | Correspondência com o mundo real | 4 | “≈ R$ 1.292,31/mês até 01/10/2027 (13 meses)”. |
| 3 | Controle e liberdade | 3 | Concluir, menu de ações. |
| 4 | Consistência e padrões | 4 | 1,7% igual nas três telas; badges de tipo removidos de todas. |
| 5 | Prevenção de erros | 3 | Concluir só quando atinge 100%. |
| 6 | Reconhecimento em vez de memória | 4 | Automáticas explicam o alvo (“Alvo = 150 × R$ 11.000,00…”). |
| 7 | Flexibilidade e eficiência | 3 | Registrar aporte direto do card. |
| 8 | Estética e minimalismo | 3 | KPIs com contagens ambíguas (“Falta · 3 metas”, “1 de 3”). |
| 9 | Recuperação de erros | 3 | Offline com recuperação sozinha. |
| 10 | Ajuda e documentação | 3 | Texto de apoio em cada meta automática. |
| **Total** | | **33/40** | **Bom** |

## Verificação dos itens R3
R3-METAS-1 corrigido (1,7% em Metas, Painel e Configurações) · R3-METAS-2 corrigido (nenhuma meta com badge de tipo) · R3-METAS-3 corrigido (linhas de progresso em 13–14 px)

## Veredito de especificidade
**LLM:** Específica: número da liberdade e reserva ligados ao salário e ao plano. Clara e calma.

**Detector:** CLI `detect.mjs --json` em `features/{dashboard,transactions,planning,wealth,catalog,closing}` e `components/`: `[]` (exit 0) nas 7 pastas. Navegador: Nenhum achado além do shell. Achados comuns no navegador (`detect.js` injetado pelo live-server, 1024 px): `dark-glow` no logo (intencional) e `border-accent-on-rounded` nos `kbd` (falso positivo); `ai-color-palette` nos ícones de categoria (falso positivo, conta 1 por `<path>`).

## O que funciona
- Metas automáticas explicam a fórmula do alvo.
- Aporte mensal sugerido com prazo e meses.
- Números consistentes entre telas.

## Problemas prioritários
- **[P3] R4-METAS-1: Contagens dos KPIs não batem com os cards**
  - Evidência: “Falta R$ 49.800,00 · 3 metas” (só 2 metas têm falta: Viagem 16.800 + Reserva 33.000) e “Metas atingidas 1 de 3” com 4 cards na tela; só o Guardado diz “sem o Número da liberdade”.
  - Correção: “Falta · 2 metas em andamento”; “1 de 3 (sem o Número da liberdade)” ou um rodapé único “KPIs não incluem o Número da liberdade”.
  - Comando: `/impeccable clarify` · Arquivos: `features/planning/PlanningPages.tsx`
- **[P3] R4-METAS-2: Badge “Automática” em ouro, a mesma cor de “Meta atingida”**
  - Evidência: O selo de meta automática usa o tom de alerta/conquista; compete com “Meta atingida” do Notebook.
  - Correção: Selo neutro (`badge neutral`) para Automática.
  - Comando: `/impeccable colorize` · Arquivos: `styles/pages-a.css (.goal-card)`

## Personas
**Jordan:** entende o alvo das metas automáticas pela fórmula. **Alex:** aporte direto no card. **Sam:** barras com texto de percentual ao lado.

## Carga cognitiva
Falhas no checklist: 0.

## Perguntas
- O Número da liberdade deveria ficar fora da grade, numa faixa própria, já que não entra nos KPIs?
