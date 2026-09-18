---
target: Painel (Visão geral, com Plano 70-20-10 e Formas de pagamento)
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-09-18T09-17-52Z
slug: src-features-dashboard-dashboardpage-tsx
---
⚠️ DEGRADED: parcial (o agente A da R4 é um subagente que critica 9 telas numa sessão só; a Avaliação A foi feita inline no agente e a Avaliação B rodou num sub-agente isolado, mas o resultado de B chegou antes de A terminar as telas 2–9)

# Crítica de design: Painel (Visão geral, com Plano 70-20-10 e Formas de pagamento) (R4, depois do fix R3)

## Design Health Score
| # | Heurística | Nota | Ponto-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 3 | Offline: o Fluxo de 6 meses diz “Sem movimento nos últimos 6 meses” (falso vazio) e Próximos vencimentos cai para “0 de 5” sem avisar que as faturas sumiram. |
| 2 | Correspondência com o mundo real | 3 | Linguagem de dinheiro do dia a dia; “Fatura de agosto”, “de R$ 7.700,00 (limite)”. |
| 3 | Controle e liberdade | 3 | Mês atual, reabrir mês, personalizar e desfazer. |
| 4 | Consistência e padrões | 3 | Em 1440 e 375 os badges de conta cortam: “Vencida há 13 d…”, “Vence em 28/09 (…”; os das faturas, ao lado, cabem inteiros. |
| 5 | Prevenção de erros | 3 | Pagamento bloqueado em mês fechado com `title`; aviso de ritmo acima do teto. |
| 6 | Reconhecimento em vez de memória | 4 | Progresso 1,7% igual a Metas e Configurações; faturas como linhas com logo. |
| 7 | Flexibilidade e eficiência | 3 | Ctrl K, N, personalizar por arrastar, fatia leva aos lançamentos. |
| 8 | Estética e minimalismo | 3 | Masonry sem buracos; Orçamento por categoria ainda com ~75 px e 4 níveis por item. |
| 9 | Recuperação de erros | 3 | Offline mostra a faixa inline “Não foi possível conectar… Tentar novamente” junto do banner global (duas vozes). |
| 10 | Ajuda e documentação | 3 | Texto de apoio em cada widget. |
| **Total** | | **31/40** | **Bom** |

## Verificação dos itens R3
R3-PAINEL-1 corrigido (agosto fechado: Internet “Não paga” neutro, igual à fatura e a Contas a pagar) · R3-PAINEL-2 corrigido (1,7% no Painel, em Metas e em Configurações) · R3-PAINEL-3 corrigido (“Fatura de agosto”; ícone de detalhes na linha do valor) · R3-PAINEL-4 corrigido (a 375 px só o logo do topo fica abaixo de 44 px) · R3-PAINEL-5 parcial (badge só quando excede, mas cada categoria ainda usa 3 linhas)

## Veredito de especificidade
**LLM:** Específica do produto: BRL, logos dos bancos, plano 70-20-10, mês fechado próprio. Os pontos perdidos agora são de robustez (offline) e de acabamento no widget mais usado (badges cortados), não de composição.

**Detector:** CLI `detect.mjs --json` em `features/{dashboard,transactions,planning,wealth,catalog,closing}` e `components/`: `[]` (exit 0) nas 7 pastas. Navegador: `clipped-overflow-container` nos `.sr-only` dos gráficos e no `sr-only` dentro de `span.badge.negative` do Orçamento (falsos positivos); `em-dash-overuse` (advisory). O detector não pega o corte real dos badges `.bill-check small .badge` (text-overflow: ellipsis, 93/125 px), medido no DOM. Achados comuns no navegador (`detect.js` injetado pelo live-server, 1024 px): `dark-glow` no logo (intencional) e `border-accent-on-rounded` nos `kbd` (falso positivo); `ai-color-palette` nos ícones de categoria (falso positivo, conta 1 por `<path>`).

## O que funciona
- Mês fechado coerente: agosto mostra só a fatura e a Internet de agosto, ambas “Não paga” neutro, pagamento desabilitado com `title` “Mês fechado”.
- Um percentual só para metas (1,7%) em todas as telas.
- Grade masonry estável em 1440, 1024 compacto e 375.

## Problemas prioritários
- **[P1] R4-PAINEL-1: Offline, o Fluxo de 6 meses mostra um estado vazio falso e a página fala em duas vozes**
  - Evidência: Com a API parada: o widget Fluxo mostra o EmptyState “Sem movimento nos últimos 6 meses · Receitas, despesas e aportes registrados aparecem aqui” (o usuário tem 3 meses de dados) e acima dos widgets aparece a faixa “Não foi possível conectar ao servidor local… Tentar novamente” além do banner global “Tentar agora”. `FlowWidget` escolhe o EmptyState quando `data` é null, sem olhar o erro.
  - Correção: Com `reports.error` (ou `offline`), Fluxo/Formas de pagamento/Evolução mostram “Sem dados enquanto o servidor estiver fora” (sem botão) em vez do EmptyState; a faixa inline de erro de conectividade some quando o banner global está visível (decisão 1 do contrato R3).
  - Comando: `/impeccable harden` · Arquivos: `features/dashboard/ChartWidgets.tsx:20-35, features/dashboard/useDashboardReports.ts, features/dashboard/DashboardPage.tsx`
- **[P2] R4-PAINEL-2: Badges de status das contas cortados em Próximos vencimentos**
  - Evidência: Em 1440 (coluna de 330 px) e em 375: “Vencida há 13 dias” 93/125 px, “Débito em 22/09” 108/124, “Vence em 28/09 (10 dias)” 108/166 — aparece “Vence em 28/09 (”. A informação nova do R3 (dias) é justamente a que some. As linhas de fatura não cortam porque não têm o círculo de marcar.
  - Correção: Deixar o badge quebrar (`white-space: normal`) ou encurtar para “13 dias de atraso” / “28/09 · 10 dias” quando a coluna for estreita; alternativa: o círculo de marcar sai da linha do nome e vai para a coluna da data.
  - Comando: `/impeccable polish` · Arquivos: `styles/pages-a.css:90-96, features/dashboard/ListWidgets.tsx:96-110`
- **[P2] R4-PAINEL-3: Offline, Próximos vencimentos perde as faturas sem avisar**
  - Evidência: Offline: “R$ 0,00 de R$ 4.751,40 pagos · 0 de 5 pagas”; online: “R$ 7.004,40 · 0 de 8”. Nenhuma nota perto do número (Contas a pagar já avisa “sem as faturas de cartão”).
  - Correção: Reusar o `withoutInvoices` de Contas a pagar: “0 de 5 · sem as faturas de cartão”.
  - Comando: `/impeccable harden` · Arquivos: `features/dashboard/ListWidgets.tsx, features/planning/invoiceRows.ts`
- **[P3] R4-PAINEL-4: “100% do teto… Acima do teto”**
  - Evidência: Ritmo: “o mês fecha em R$ 9.966,25 (100% do teto de R$ 9.900,00). Acima do teto.” O valor é 100,7%; arredondar para 100% contradiz “acima”.
  - Correção: Usar `formatProgress` com uma casa acima de 99% (“100,7%”), ou arredondar para cima quando excede.
  - Comando: `/impeccable clarify` · Arquivos: `features/dashboard/ChartWidgets.tsx (ritmo), lib/progress.ts`
- **[P3] R4-PAINEL-5: Orçamento por categoria ainda alto (R3-PAINEL-5 parcial)**
  - Evidência: Cada categoria: nome+valor, “de R$ …”, barra, linha de restante — ~75 px; o widget é o mais alto da grade.
  - Correção: Restante na mesma linha do “de R$ …”; barra de 4 px colada no fim.
  - Comando: `/impeccable distill` · Arquivos: `features/dashboard/ListWidgets.tsx`

## Personas
**Alex (usuário avançado):** atalhos e personalização ok; lê “Vence em 28/09 (” e precisa ir a Contas a pagar para saber os dias. **Sam (acessibilidade):** badges cortados por `text-overflow` sem `title`; o leitor lê o texto inteiro, mas quem usa zoom perde. **Riley (estresse):** com o servidor fora, o Fluxo afirma que não há movimento em 6 meses e o total de vencimentos cai de 8 para 5 sem explicação.

## Carga cognitiva
Falhas no checklist: 1 (densidade do Orçamento). Nenhum ponto de decisão com mais de 4 ações primárias.

## Perguntas
- Um widget sem dados por falha de rede deveria usar o mesmo visual de um widget sem dados de verdade?
- O badge de prazo precisa repetir a data que já está no bloco de data à esquerda?
