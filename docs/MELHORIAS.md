# Melhorias — LMM Finance Control

O que foi feito em cada rodada de melhoria e as notas de cada tela na crítica do impeccable. O estado atual do sistema está no [README](../README.md) e em [ARCHITECTURE](ARCHITECTURE.md), [API](API.md), [MIGRATIONS](MIGRATIONS.md) e no `DESIGN.md` do frontend.

**Meta:** todas as telas e funções com nota **≥ 32/40**. A transição da marca é avaliada em /32 e tem meta de **≥ 26/32**.

**Como cada rodada foi feita:**
1. Crítica em duas frentes paralelas, com uma cópia do banco de backup populada com dados realistas.
2. Correção em paralelo, dividida em backend, navegação/Painel, telas de registros e telas de análise.
3. `npm run check` verde duas vezes.

Os relatórios completos por tela ficam em `.impeccable/critique/`.

## Notas por tela

| Tela | v1.2 | R1 | R2 | R3 | R4 (confirmação) |
|---|---:|---:|---:|---:|---:|
| Painel | 28 | 25 | 30 | 32 | 31 |
| Lançamentos | 28 | 29 | 32 | 31 | 32 |
| Contas a pagar | 28 | 26 | 32 | 33 | 32 |
| Metas | 28 | 26 | 31 | 32 | 33 |
| Investimentos | 28 | 29 | 32 | 33 | 33 |
| Contas bancárias | 28 | 29 | 31 | 32 | 33 |
| Cartões | 25 | 26 | 30 | 32 | 33 |
| Categorias | 28 | 27 | 32 | 33 | 32 |
| Assinaturas | 28 | 26 | 32 | 33 | 32 |
| Relatórios | 27 | 27 | 30 | 32 | 33 |
| Projeções | 27 | 29 | 30 | 32 | 33 |
| Mercado | 28 | 29 | 31 | 32 | 33 |
| Configurações | 28 | 26 | 31 | 32 | 33 |
| Formulário de registro | 28 | 29 | 32 | 32 | 34 |
| Setup | 28 | 27 | 31 | 33 | 33 |
| Tour | 27 | 28 | 32 | 33 | 33 |
| Paleta de comandos | 30 | 30 | 33 | 34 | 35 |
| Navegação (App shell) | — | 27 | 32 | 33 | 34 |
| Transição da marca (/32) | 17 | 22 | 27 | 28 | 29 |

As quedas da R1 vêm, na maioria, de ter avaliado com dados realistas pela primeira vez; o backup quase não tinha registros. A queda de Lançamentos na R3 veio do teste com a API fora do ar.

## v1.3 — execução do backlog (MEL-45, MEL-46, MEL-48, MEL-49, CR-01…CR-30)

**Plano 70-20-10 (MEL-45)**
- **Setup:** novo passo "Plano sugerido", com a tabela ao vivo e a explicação do plano.
- **Configurações:** nova seção do plano. A meta "Número da liberdade" (salário × 150) fica vinculada ao plano e não é duplicada.
- **Categorias:** cada categoria recebe um balde: fixo, lazer, investimento ou fora do plano.
- **Painel, Projeções e Relatórios:** o Painel ganhou o widget "Plano", Projeções um cenário do plano e Relatórios o realizado × plano.
- **Backend:** migração `008_plan`, `POST/DELETE /api/plan`, `summary.plan` e `summary.payment_methods`.

**Carregamento e marca**
- **Abertura (MEL-48):**
  - Animada, com cerca de 1,2 s: mínimo de 0,9 s e teto de 1,6 s.
  - Pula com Esc, clique ou toque.
  - Troca de página sem tela cheia, em até 300 ms.
  - Mini-loader só quando a página passa de 400 ms.
- **Logo (MEL-49):** a da barra lateral e a do topo no celular levam à Visão geral.

**Crítica da v1.2 (CR-01…CR-30)**
- **Celular:** a página tinha 646 px por causa de um texto oculto no letreiro de cotações. Agora ocupa a largura da tela.
- **Gráficos:** corrigidos a rosca com uma fatia e o gráfico com um único ponto. As cores das séries passaram a ser as mesmas em todas as telas.
- **Cartões:** faturas com estados claros. Compra no cartão agora exige escolher o cartão.
- **Listas e formulários:** linhas compactas no celular e formulários mais curtos, com "Salvar e lançar outro".
- **Lançamentos:** ações em lote.
- **Paleta:** busca melhor ranqueada.
- **Outras telas:** Relatórios, Projeções, Mercado e Configurações foram reorganizados.

**Resíduos (MEL-46)**
- Pilha única de camadas para o Esc.
- Moedas sem cotação ficam fora dos totais, com aviso.
- A restauração de backup preserva as cotações e ressincroniza as metas vinculadas.
- Ícone de moto próprio.

## R1 — primeira crítica pós-v1.3 e correções

**Principais problemas encontrados**
- A abertura terminava em cerca de 0,9 s, com fases sobrepostas.
- "Teto" tinha três valores diferentes, e aplicar o plano mudava o teto sem avisar.
- O campo do Número da liberdade mostrava "15" em vez de 150.
- Faturas vencidas antigas sumiam de Cartões.
- Contas criadas em setembro apareciam vencidas em agosto fechado.
- Relatórios dizia "dentro do teto" sem nenhum gasto classificado.
- Sem conexão, o mês novo mostrava os números do mês anterior.

**Decisões**
- **Teto:** "Teto de gastos do mês" tem um único valor. As linhas do plano passaram a se chamar "Limite de gastos fixos", "Limite de lazer" e "Investimento mínimo".
- **Aplicar o plano:** mostra o teto antes → depois, e o aviso oferece "Desfazer".
- **Número da liberdade:** o progresso é o patrimônio investido.
- **Sem conexão:** um aviso global com nova tentativa automática, e os botões de salvar ficam desativados.
- **Botões primários:** sem brilho colorido.
- **Troca de página:** sempre começa no topo.

**Correções**
- **Backend:**
  - Migração `009_bill_active_since`: uma conta não aparece em meses anteriores à sua criação.
  - Novo `GET /api/card-invoices` e todas as faturas vencidas listadas.
- **Abertura:** fases em sequência, com cerca de 1,2 s.
- **Navegação:**
  - "Novo lançamento" disponível em qualquer tela, também pela tecla N.
  - No celular, o topo tem cerca de 120 px.
  - Link "Pular para o conteúdo".
- **Registros:**
  - Categorias ganhou uma coluna de balde.
  - Assinaturas mostra a data da cobrança pendente.
  - Contas bancárias mostra o saldo projetado.
- **Tour, Setup e Configurações:** o Tour ganhou novos passos, teclado e fundo escurecido. O Setup e Configurações foram refeitos para o plano.

## R2 — segunda crítica e correções

**Resultado:** 12 de 19 telas com ≥ 32. Transição em 27/32.

**Principais problemas encontrados**
- Relatórios, Projeções e Mercado não acionavam o aviso de sem conexão.
- Os marcos de Projeções ficavam ilegíveis no celular.
- A grade do Painel tinha buracos.
- Relatórios dividia os percentuais do plano por 6 meses, mesmo com só 3 com renda.

**Correções**
- **Sem conexão:** as três telas passaram a usar o mesmo cliente de rede e o mesmo aviso. O `npm run dev` também é detectado.
- **Painel:**
  - A grade não tem mais buracos.
  - As faturas entram em "Próximos vencimentos", com a mesma contagem de Contas a pagar.
- **Celular e setup:**
  - O dock do celular ganhou um "+" no centro.
  - Depois do setup, o formulário e o tour só abrem quando a abertura termina.
- **Registros:**
  - Linhas compactas de Lançamentos com 41 px a 1024 px.
  - Cartões com menos espaço morto e um atalho para as faturas vencidas.
  - Com o plano ativo, uma categoria nova já nasce num balde.
- **Análise:**
  - Relatórios divide o plano pelos meses com renda.
  - O eixo de Projeções não parte do zero.
  - Mercado com uma moeda só tem layout próprio.

## R3 — terceira crítica e correções

**Resultado:** 18 de 19 telas com ≥ 32. Lançamentos caiu para 31 no teste sem conexão: mostrava R$ 0,00 e dois avisos.

**Decisões**
- **Sem conexão:** o aviso global é o único que oferece nova tentativa. Os erros de conexão são filtrados num lugar só.
- **Dados indisponíveis:** aparecem como "—", nunca como R$ 0,00.
- **Percentuais:** uma regra única, com "1,7%" em todas as telas.
- **Toque:** alvos com pelo menos 44 px.

**Correções**
- **Conexão:** verificada a cada 30 s e ao voltar à janela.
- **Formulário:**
  - Confirma antes de descartar o que foi digitado.
  - Uma data em mês fechado oferece "Usar hoje" ou "Reabrir mês".
- **Configurações:** com o plano ativo, o teto fica somente leitura.
- **Projeções:** avisa quando o aporte está abaixo do mínimo do plano.
- **Relatórios:** no celular, os rankings viram lista com rótulos inteiros.
- **Paleta:** novo grupo "Recentes", e "Fechar o mês" disponível em qualquer tela.
- **Leitor de tela:** gráficos agrupados informam o maior valor de cada série.

## R4 — crítica de confirmação e correções finais

**Resultado:** 18 de 19 telas com ≥ 32 (nenhuma abaixo de 31). Transição em 29/32. O Painel ficou em 31 por falhas sem conexão e por status cortados; Contas a pagar, Categorias e Assinaturas perderam um ponto pela rolagem lateral a 1024 px. Última rodada de crítica, como combinado: as correções abaixo foram aplicadas e verificadas, sem nova medição.

**Correções**
- **Painel:**
  - Sem conexão, os gráficos dizem "Sem dados enquanto o servidor estiver fora", em vez de "Sem movimento".
  - Sai a faixa de erro duplicada.
  - A contagem avisa quando as faturas ficaram de fora.
  - Os status de vencimento não são mais cortados.
  - Logo acima do teto, o percentual mostra uma casa decimal ("100,7%").
- **Privacidade:** o botão de ocultar valores e as preferências de aparência funcionam sem conexão e são salvos quando a API volta.
- **Reconexão:** nova tentativa em no máximo 5 s.
- **Tabelas:** Contas a pagar, Categorias e Assinaturas viram lista compacta quando não cabem na largura. As ações ficam sempre visíveis.
- **Lançamentos:** na densidade compacta, dias com um só lançamento não têm cabeçalho, e cabem 7 linhas em vez de 5 a 1024 px.
- **Formulário:**
  - Uma gravação que falha sem conexão mantém o que foi digitado e avisa quando dá para salvar de novo.
  - Despesa sem categoria avisa que não entra no plano.
- **Fechar mês:** o diálogo lista as contas e faturas não pagas do mês, com o total.
- **Setup:** as categorias-balde já vêm marcadas.
- **Painel sem gastos no mês:** o widget do plano não sugere investir.
- **Configurações no celular:**
  - Reserva, Cópia de segurança e Ajuda ficam recolhidas.
  - A barra de seções indica que há mais itens.
  - A confirmação de restauração mostra a data do backup.
- **Tour no celular:** os passos seguem a ordem da página e o texto fala em toque, não em teclado.
- **Relatórios:** as médias contam só os meses com lançamentos.

**Estado final:**
- 742 testes no frontend e 342 no backend.
- `npm run check` verde.
- Migração atual: `010_imports_and_installments`.

## v1.4 — importação, parcelamento e saldo por data

Rodada de funcionalidade (não de crítica de design). O que entrou e por quê:

- **Importar fatura e extrato** (CSV/TXT, OFX, QIF) com conferência antes de gravar, marca de origem por linha para
  nunca duplicar e identificação do cartão por últimos dígitos ou portador. Uma fatura real do Itaú foi usada como
  caso de teste e definiu três regras: sinal antes do valor (`R$ -5.195,80`), a linha "Pagamento de fatura" que não
  pode virar lançamento, e a data da compra repetida nas parcelas.
- **Parcelamento em qualquer forma de pagamento**, com valor por parcela ou total, rateio que fecha exato e recusa da
  compra inteira quando algum mês da série está fechado.
- **Saldo da conta por data**: lançamento futuro só entra no saldo quando a data chega. Corrige também o caso
  anterior de um lançamento futuro avulso derrubar o saldo de hoje. Migração preserva os saldos existentes.
- **Previsão de assinaturas nas faturas abertas**, em total separado do realizado.
- **Zerar a conta** com confirmação extensa, cópia automática antes e retorno ao primeiro acesso.
- **Recriar as metas do planejamento** removidas, direto na tela de Metas.
- **Ajuda por tela**, com o que cada função faz e a melhor forma de usá-la.
- **Documentação de fluxos** (`FLUXOS.md`) e a regra de mantê-la atualizada junto com o código (AGENTS).

Decisão de modelagem registrada: **a data da compra não é deslocada**. Competência, fatura e caixa são eixos
distintos — um gasto de setembro cobrado na fatura de outubro continua sendo de setembro, e é pago com o salário de
setembro, recebido no início de outubro. A única exceção é a parcela, que é um fato do próprio mês.
