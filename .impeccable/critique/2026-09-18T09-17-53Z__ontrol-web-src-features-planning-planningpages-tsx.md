---
target: Contas a pagar
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-18T09-17-53Z
slug: ontrol-web-src-features-planning-planningpages-tsx
---
⚠️ DEGRADED: parcial (o agente A da R4 é um subagente que critica 9 telas numa sessão só; a Avaliação A foi feita inline no agente e a Avaliação B rodou num sub-agente isolado, mas o resultado de B chegou antes de A terminar as telas 2–9)

# Crítica de design: Contas a pagar (R4, depois do fix R3)

## Design Health Score
| # | Heurística | Nota | Ponto-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 4 | Status com data e dias; offline com aviso único; mês fechado com “Não paga” neutro. |
| 2 | Correspondência com o mundo real | 3 | “Débito automático em 22/09 (4 dias)”, “Pagar antes”. |
| 3 | Controle e liberdade | 3 | Pagar, desfazer, reabrir mês. |
| 4 | Consistência e padrões | 3 | “Vence em 28/09 (10 dias)” igual ao Painel agora. |
| 5 | Prevenção de erros | 4 | Pagar desabilitado em mês fechado com `title`; confirmação ao remover. |
| 6 | Reconhecimento em vez de memória | 3 | Faturas com logo e “1 compra no cartão”. |
| 7 | Flexibilidade e eficiência | 3 | Ordenação por coluna. |
| 8 | Estética e minimalismo | 3 | Em 1024 a tabela de faturas rola de lado e “Pagar fatura” some da tela; KPI Próximo vencimento repete “débito automático”. |
| 9 | Recuperação de erros | 3 | Offline com nota “sem as faturas de cartão” nos KPIs (código). |
| 10 | Ajuda e documentação | 3 | Subtítulo explica a regra de pagamento. |
| **Total** | | **32/40** | **Bom** |

## Verificação dos itens R3
R3-BILLS-1 corrigido no código (`withoutInvoices` “sem as faturas de cartão” + nota no lugar da seção; ao vivo a página abriu no estado “abre quando o servidor voltar”, sem zeros) · R3-BILLS-2 corrigido (“Vence em 28/09 (10 dias)”) · R3-BILLS-3 corrigido (“5 contas · 3 faturas”)

## Veredito de especificidade
**LLM:** Específica: faturas de cartão e contas no mesmo lugar, débito automático, mês fechado. Falta adaptação a larguras intermediárias.

**Detector:** CLI `detect.mjs --json` em `features/{dashboard,transactions,planning,wealth,catalog,closing}` e `components/`: `[]` (exit 0) nas 7 pastas. Navegador: `cramped-padding`/`edge-flush-cards` em `section.bills-invoices .table-wrap` e `section.bills-list .table-wrap` — confirma a rolagem lateral medida (805/907 px em 692 px). Achados comuns no navegador (`detect.js` injetado pelo live-server, 1024 px): `dark-glow` no logo (intencional) e `border-accent-on-rounded` nos `kbd` (falso positivo); `ai-color-palette` nos ícones de categoria (falso positivo, conta 1 por `<path>`).

## O que funciona
- Status com data e contagem de dias, igual ao Painel.
- Faturas vencidas no topo com “Fatura de um mês anterior ainda em aberto”.
- “Pagar antes” para débito automático.

## Problemas prioritários
- **[P2] R4-X-1: Tabelas com rolagem lateral em 1024 px**
  - Evidência: Com a barra lateral aberta, a área útil é 692 px: `.table-wrap` mede 805/907 px em Contas a pagar, 1129 px em Categorias e 963 px em Assinaturas; a coluna de ações (Pagar fatura, Lançar, editar/remover) fica fora da tela e o nome da fatura quebra em 4 linhas.
  - Correção: Abaixo de ~1180 px de área útil, usar o layout de linha empilhada que já existe no celular (nome + meta numa célula, ações num menu `…`), ou esconder colunas secundárias (Categoria, Cartão, Tipo) com `@container`.
  - Comando: `/impeccable adapt` · Arquivos: `styles/pages-a.css, styles/pages-b.css, CatalogPages.tsx, PlanningPages.tsx`
- **[P3] R4-BILLS-1: KPI Próximo vencimento redundante**
  - Evidência: “Luz Enel · R$ 213,40 · débito automático em 22/09 (4 dias) · 1 em débito automático” — quebra em 3 linhas e repete o termo.
  - Correção: “R$ 213,40 · débito automático em 22/09 (4 dias)”; o “1 em débito automático” sai (já está na tabela).
  - Comando: `/impeccable distill` · Arquivos: `features/planning/PlanningPages.tsx`
- **[P3] R4-BILLS-2: Linha secundária cortada no celular**
  - Evidência: 375 px: “Plano de saúde” 69/103 px, “Nubank Roxinho · Vence 10/08 · mês anterior…” 106/255 px, “Vence 15/09 · Sem categoria” 113/162.
  - Correção: Nome em até 2 linhas; meta em linha própria abaixo do valor/badge, sem ellipsis.
  - Comando: `/impeccable adapt` · Arquivos: `styles/touch.css, styles/pages-a.css`
- **[P3] R4-BILLS-3: Conta paga por lançamento avulso continua “Vencida”**
  - Evidência: Há lançamentos “Aluguel” (05/09) e “Condomínio” (06/09) do mesmo valor, e as contas homônimas aparecem “Vencida há 13/12 dias”.
  - Correção: Ao listar uma conta vencida, sugerir “Encontramos um lançamento Aluguel de R$ 3.200,00 em 05/09 · Vincular” (match por nome/valor no mês).
  - Comando: `/impeccable harden` · Arquivos: `features/planning/PlanningPages.tsx, billStatus.ts`

## Personas
**Alex:** tudo em uma tela; em 1024 precisa rolar de lado para pagar. **Casey:** alvos ok, nomes cortados. **Riley:** paga o Aluguel por Lançamentos e a conta continua vencida.

## Carga cognitiva
Falhas no checklist: 0. Até 3 ações por linha.

## Perguntas
- Uma conta vencida com lançamento equivalente no mês deveria ser sugerida como paga?
