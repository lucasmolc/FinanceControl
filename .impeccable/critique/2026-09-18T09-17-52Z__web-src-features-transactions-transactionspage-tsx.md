---
target: Lançamentos
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-18T09-17-52Z
slug: web-src-features-transactions-transactionspage-tsx
---
⚠️ DEGRADED: parcial (o agente A da R4 é um subagente que critica 9 telas numa sessão só; a Avaliação A foi feita inline no agente e a Avaliação B rodou num sub-agente isolado, mas o resultado de B chegou antes de A terminar as telas 2–9)

# Crítica de design: Lançamentos (R4, depois do fix R3)

## Design Health Score
| # | Heurística | Nota | Ponto-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 4 | Offline: um aviso só (“Lançamentos abre quando o servidor voltar”) e nenhum R$ 0,00; mês fechado com banner e ações desabilitadas com `title`. |
| 2 | Correspondência com o mundo real | 3 | Dias por extenso, formas de pagamento em português. |
| 3 | Controle e liberdade | 3 | Filtros, desfazer, reabrir mês. |
| 4 | Consistência e padrões | 3 | Cabeçalho ainda em três camadas; setas de ordenação à esquerda em “Valor” e à direita nas outras colunas. |
| 5 | Prevenção de erros | 3 | Fechar mês confirma com resumo, mas não lista pendências (1 fatura e a Internet de agosto não pagas). |
| 6 | Reconhecimento em vez de memória | 3 | Categoria junto da descrição no compacto; logos de conta. |
| 7 | Flexibilidade e eficiência | 4 | Seleção em lote, busca, filtros, ordenação, N. |
| 8 | Estética e minimalismo | 3 | Compacto em 1024: cada lançamento ocupa 82 px (cabeçalho do dia + linha de 41 px) com um lançamento por dia; ~5 linhas por tela. |
| 9 | Recuperação de erros | 3 | Mensagem offline clara e recuperação automática (~20 s). |
| 10 | Ajuda e documentação | 3 | Subtítulos e placeholders explicam a busca. |
| **Total** | | **32/40** | **Bom** |

## Verificação dos itens R3
R3-LANC-1 corrigido (offline sem KPIs zerados; estado “abre quando o servidor voltar”) · R3-LANC-2 corrigido (só o banner global tem “Tentar agora”; nenhum botão de escrita ativo) · R3-LANC-3 não corrigido (H1 + H2 “12 lançamentos em setembro de 2026” + faixa Fechar mês) · R3-LANC-4 corrigido (nenhum alvo < 44 px a 375 px)

## Veredito de especificidade
**LLM:** Extrato brasileiro de verdade (Pix, boleto, crédito, logos). O ganho da rodada foi robustez offline; o que segura a nota é densidade e cabeçalho.

**Detector:** CLI `detect.mjs --json` em `features/{dashboard,transactions,planning,wealth,catalog,closing}` e `components/`: `[]` (exit 0) nas 7 pastas. Navegador: `ai-color-palette` nos ícones de categoria (falso positivo). Nenhum outro achado. Achados comuns no navegador (`detect.js` injetado pelo live-server, 1024 px): `dark-glow` no logo (intencional) e `border-accent-on-rounded` nos `kbd` (falso positivo); `ai-color-palette` nos ícones de categoria (falso positivo, conta 1 por `<path>`).

## O que funciona
- Offline com uma voz só e sem números falsos.
- Mês fechado: Novo lançamento, editar e remover desabilitados com `title` “Mês fechado”.
- Total por dia na linha do dia.

## Problemas prioritários
- **[P2] R4-LANC-1: Compacto não mostra mais linhas: o cabeçalho do dia dobra a altura**
  - Evidência: Densidade compacta, 1024×1000: primeiro lançamento em y≈585, 5 lançamentos visíveis. Com um lançamento por dia, cada um custa cabeçalho do dia (~40 px) + linha (41 px).
  - Correção: No compacto, trocar o cabeçalho do dia por uma coluna Data (“17/09”) e mostrar o total do dia só quando há 2+ lançamentos; ou cabeçalho do dia com 28 px.
  - Comando: `/impeccable layout` · Arquivos: `features/transactions/TransactionsPage.tsx, styles/density.css (ou pages-b.css)`
- **[P3] R4-LANC-2: Cabeçalho em três camadas (R3-LANC-3 continua)**
  - Evidência: H1 “Lançamentos” + subtítulo, H2 “12 lançamentos em setembro de 2026” + botão Novo lançamento (repetido: já está na barra lateral), faixa Fechar mês; ~180 px antes dos KPIs.
  - Correção: Subtítulo do H1 vira “12 lançamentos em setembro de 2026”; o H2 sai (fica como `aria-label` da tabela); Fechar mês vai para a linha do H1.
  - Comando: `/impeccable distill` · Arquivos: `features/transactions/TransactionsPage.tsx, features/closing/MonthCloseBar.tsx`
- **[P3] R4-LANC-3: Fechar mês não lista pendências (R2-X-2 continua)**
  - Evidência: O diálogo “Fechar agosto de 2026” mostra Receitas/Despesas/Resultado e nada sobre a fatura Nubank de agosto (R$ 1.023,00) e a Internet (R$ 199,00) não pagas.
  - Correção: Bloco “Pendências de agosto: 1 fatura e 1 conta não pagas (R$ 1.222,00) · Ver em Contas a pagar” antes do botão.
  - Comando: `/impeccable harden` · Arquivos: `features/closing/*`

## Personas
**Alex:** lote, busca e N funcionam; no compacto rola mais do que esperava. **Riley:** offline agora é honesto; fecha agosto sem ser avisado das contas em aberto. **Casey (celular):** alvos ok; a categoria e a conta cortam em “Transporte · Nubank Roxi…”, aceitável.

## Carga cognitiva
Falhas no checklist: 1 (cabeçalho em camadas). Barra de filtros com 4 grupos, dentro do limite.

## Perguntas
- No modo compacto, o agrupamento por dia ainda compensa?
- Fechar mês deveria impedir, ou só avisar, quando há contas vencidas no mês?
