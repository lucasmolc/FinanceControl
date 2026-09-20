# Fluxos do sistema — LMM Finance Control

Como cada função funciona de ponta a ponta: o que o usuário faz, o que a API recebe, que regra decide o resultado e o
que fica gravado. É o documento de referência para entender o comportamento sem ler o código; o contrato HTTP está em
[API.md](API.md), as camadas em [ARCHITECTURE.md](ARCHITECTURE.md) e o esquema em [MIGRATIONS.md](MIGRATIONS.md).

> **Regra de manutenção:** toda mudança de comportamento atualiza este arquivo junto com o código. Um fluxo descrito
> aqui e não coberto por teste é um fluxo que ainda não está pronto.

## Índice

1. [Conceitos transversais](#1-conceitos-transversais)
2. [Primeiro acesso, conta e sessão](#2-primeiro-acesso-conta-e-sessão)
3. [Lançamentos](#3-lançamentos)
4. [Compra parcelada](#4-compra-parcelada)
5. [Gasto mensal sem prazo (assinaturas)](#5-gasto-mensal-sem-prazo-assinaturas)
6. [Importar fatura ou extrato](#6-importar-fatura-ou-extrato)
7. [Cartões e faturas](#7-cartões-e-faturas)
8. [Contas a pagar](#8-contas-a-pagar)
9. [Contas bancárias e saldo](#9-contas-bancárias-e-saldo)
10. [Metas e investimentos](#10-metas-e-investimentos)
11. [Orçamento, plano 70-20-10 e metas automáticas](#11-orçamento-plano-70-20-10-e-metas-automáticas)
12. [Fechamento mensal](#12-fechamento-mensal)
13. [Moedas e mercado](#13-moedas-e-mercado)
14. [Rotinas em segundo plano](#14-rotinas-em-segundo-plano)
15. [Cópia de segurança, restauração e zerar a conta](#15-cópia-de-segurança-restauração-e-zerar-a-conta)
16. [Ajuda na interface](#16-ajuda-na-interface)

---

## 1. Conceitos transversais

### 1.1 As três datas de um gasto

Esta é a distinção que mais afeta o comportamento do sistema, e ela é mantida em três lugares diferentes:

| Eixo | O que responde | Onde vive |
|---|---|---|
| **Competência** | quando o gasto aconteceu | `transactions.date` |
| **Fatura** | em qual cobrança de cartão ele entra | derivado por `CardInvoiceRules` a partir da data e do ciclo do cartão |
| **Caixa** | quando o dinheiro sai da conta | saída bancária gerada ao pagar a fatura, ou o próprio lançamento quando é em conta |

**A data da compra nunca é deslocada.** Uma compra de 06/09 em um cartão que fecha dia 3 é gasto de **setembro** —
entra no resumo, no orçamento e nos relatórios de setembro — e cai na **fatura de outubro**, que é quem cobra.

Isso também casa com o fluxo de caixa real: a fatura de outubro vence no início do mês e é paga com o salário
recebido nos primeiros dias úteis de outubro — o "salário de setembro". Competência com competência.

A única exceção é a **parcela**, que é um fato do próprio mês: a parcela 3/10 de uma compra de julho é gasto do mês em
que ela é cobrada, não de julho (ver [§4](#4-compra-parcelada) e [§6.4](#64-datas-das-parcelas-importadas)).

### 1.2 Dinheiro, datas e moedas

- Valores são inteiros de 64 bits em **unidades mínimas** da moeda (centavos para BRL).
- Datas de negócio são texto ISO `AAAA-MM-DD`; competências, `AAAA-MM`. Ordenação e comparação são ordinais.
- Todo lançamento guarda `currency`, `amount_cents` naquela moeda, `exchange_rate` (reais por 1 unidade) e
  `base_amount_cents` (o valor em reais **na data do lançamento**). Resumos, orçamentos e relatórios somam o valor base.
- Moeda sem cotação salva fica **fora** dos totais em reais, e a tela avisa, em vez de somar zero em silêncio.

### 1.3 Exclusão lógica e desfazer

Registros financeiros não são apagados fisicamente. Lançamentos usam `deleted_at`; os demais módulos, `active = 0`.
Remover e restaurar reaplicam e desfazem os efeitos (saldo de conta, valor de meta, posição de investimento), e a
interface oferece **Desfazer** logo após a ação.

### 1.4 Validação e erros

Toda entrada passa por um esquema (`ModuleSchemas`) antes de chegar ao domínio. Erro de validação vira
`400 ProblemDetails` com o campo e a mensagem em português; referência inexistente vira erro do campo
correspondente; registro ausente, `404`.

### 1.5 Mês fechado

Um mês fechado trava qualquer alteração de lançamento naquele período — criar, editar, remover, restaurar, pagar
conta, cobrar assinatura, pagar fatura. As telas avisam antes de tentar salvar e oferecem reabrir.

---

## 2. Primeiro acesso, conta e sessão

1. **Cadastro** (`POST /api/auth/register`) — cadastro livre. A senha vira hash PBKDF2; o banco financeiro do usuário
   nasce migrado nesse momento, em `users/<id>/finance.db`.
2. **Login** (`POST /api/auth/login`) — cria a sessão em cookie. `GET /api/auth/me` devolve o usuário conectado;
   `POST /api/auth/logout` encerra.
3. **Setup inicial** — enquanto `settings.setup_completed` é falso, o app abre o assistente, que coleta nome, salário
   líquido, teto de gastos, meses de reserva e, opcionalmente, contas a pagar, metas e um cartão
   (`POST /api/setup`). Pular (`POST /api/setup/skip`) marca o setup como concluído sem preencher nada.
4. **Tour guiado** — roda uma vez (`settings.tour_completed`) e pode ser revisto em Configurações → Ajuda.

Todo o restante da API exige sessão, e requisições que alteram dados exigem o cabeçalho
`X-Requested-With: FinanceControl` (anti-CSRF). Os dados de cada usuário ficam em um arquivo separado: nenhuma consulta
cruza contas.

---

## 3. Lançamentos

### 3.1 Criar

`POST /api/transactions` com data, descrição, tipo (`income`/`expense`/`investment`), valor, categoria, forma de
pagamento e o vínculo (cartão **ou** conta).

Ordem das decisões no servidor:

1. Validação do esquema (tipos, tamanhos, referências existentes e ativas).
2. **Compra no cartão** — com `card_id`, a conta precisa ficar vazia e a forma de pagamento é `card`. Com forma de
   pagamento `card`, o cartão é obrigatório (senão a compra ficaria fora de toda fatura e do limite).
3. **Parcelamento** — se houver `installment_count`, a série é montada (ver [§4](#4-compra-parcelada)).
4. **Mês fechado** — o mês do lançamento (ou todos os meses da série) precisa estar aberto.
5. **Moeda** — a moeda vem da conta vinculada quando existe; compras no cartão são sempre em reais. A cotação usada é
   a enviada, senão a última conhecida; sem nenhuma, o pedido é recusado.
6. Gravação e efeito no saldo (ver [§9.1](#91-o-saldo-conta-o-que-já-aconteceu)).

### 3.2 Editar, remover e restaurar

- `PUT` recalcula o efeito no saldo: desfaz o efeito antigo (pelos valores anteriores) e aplica o novo.
- Campos de parcelamento são recusados na edição: eles definem **quantos** lançamentos existem, então só valem na criação.
- `DELETE` é exclusão lógica; `POST /{id}/restore` traz de volta, recusando se a conta vinculada tiver sido removida
  ou se o mês estiver fechado.

### 3.3 Revisar em lote

Na tela de lançamentos, selecionar linhas abre ações em lote: **Categorizar** define categoria e/ou **cartão** de uma
vez (cada lançamento só recebe categoria do próprio tipo), e **Remover** faz as exclusões com um único Desfazer.
O filtro **Só importados** isola o que acabou de vir de uma importação — é o caminho normal de revisão depois de
importar uma fatura.

---

## 4. Compra parcelada

Vale para **qualquer forma de pagamento**.

**Entrada:** `installment_count` (2 a 72), `installment_number` (em qual parcela a compra está hoje, padrão 1) e,
opcionalmente, `installment_total_cents` (valor da compra inteira). Sem o total, ele é `amount_cents × parcelas`.

**Regras (`InstallmentRules`):**

- **Datas.** A parcela *k* fica no mesmo dia do mês da parcela informada, deslocado por `k − número informado`, com o
  dia limitado ao tamanho do mês (31/01 → 28/02 → 31/03, e 29/02 em ano bissexto). "6/10 hoje" cria cinco parcelas
  para trás e quatro para frente.
- **Rateio.** Ao dividir o total, base = total ÷ parcelas e o resto vai um centavo por parcela a partir da primeira
  (100,00 em 3x = 33,34 + 33,33 + 33,33). A soma fecha exatamente o total e nenhuma parcela fica em zero — por isso o
  total precisa cobrir ao menos um centavo por parcela.
- **Descrição.** Cada parcela recebe o sufixo `(k/N)`, no formato das faturas.
- **Atomicidade.** As N parcelas são gravadas em uma única transação de banco, com um `installment_group` comum.
- **Mês fechado.** Se qualquer mês da série estiver fechado, a compra inteira é recusada, com os meses listados na
  mensagem. Nada é gravado pela metade.

**Efeitos:** no cartão, cada parcela cai na fatura do seu mês. Em conta, as parcelas futuras ficam pendentes e só
entram no saldo quando a data chega ([§9.1](#91-o-saldo-conta-o-que-já-aconteceu)).

**Resposta:** `{ ok, id }` com o id da parcela informada — a que o usuário acabou de lançar.

---

## 5. Gasto mensal sem prazo (assinaturas)

Gasto que se repete **sem data para acabar** (academia, streaming, mensalidade) é uma **assinatura**, não uma série de
parcelas: não há número de parcelas, o valor muda ao longo do tempo e o fim é a desativação.

- No formulário de lançamento, a opção **"Todo mês, sem prazo"** cria a assinatura e já lança a cobrança daquela data.
- **Alterar o valor** vale para as próximas cobranças; as já lançadas ficam como estão.
- **Encerrar** é desativar a assinatura.
- **Cobrança automática** (`auto_debit`) lança a despesa sozinha no dia, no cartão ou na conta escolhida, sem duplicar:
  cada cobrança fica registrada por data em `subscription_charges`.
- **Previsão na fatura.** Faturas que ainda não fecharam mostram as cobranças esperadas do ciclo em
  `projected_cents`/`projected_count`, **fora** do total realizado — previsão não é gasto. Faturas já fechadas nunca
  recebem previsão.

---

## 6. Importar fatura ou extrato

Dois passos, sem estado no servidor: a conferência não grava nada, e a confirmação refaz a mesma leitura
determinística sobre o mesmo arquivo.

```
arquivo (base64) ─▶ POST /api/imports/preview ─▶ conferência na tela
                                                      │ usuário marca/desmarca
                                                      ▼
                                            POST /api/imports/commit ─▶ lançamentos
```

### 6.1 Destino, formato e codificação

- Destino: **um** cartão (fatura) ou **uma** conta (extrato). Ele define a moeda e onde procurar repetidos.
- Formatos reconhecidos pelo conteúdo: **CSV/TXT** (separador `;`, tab, `,` ou `|` detectado pelo cabeçalho),
  **OFX** (SGML e XML) e **QIF**. Limite de 5 MB.
- Texto em UTF-8 (BOM removido) ou, quando não for UTF-8 válido, ISO-8859-1 — que é como vários bancos exportam.
- Colunas do CSV reconhecidas por apelidos normalizados (sem acento, minúsculas): data, descrição, valor, cartão
  (portador/final) e parcela. Sem data e valor reconhecíveis, o arquivo é recusado com a mensagem do que é esperado.

### 6.2 Valores e sinal

- Aceita `1.234,56`, `1,234.56`, `1234.56`, `R$ 1.234,56`, `-12,90`, `12,90-` e `(12,90)`. Com um separador único
  seguido de exatamente três dígitos, ele é de milhar (`1.234` = 1234,00).
- **Convenção de sinal:** em fatura de cartão, positivo é despesa; em extrato, positivo é receita. OFX e QIF seguem
  sempre o padrão (saída negativa). `positive_is_expense` inverte quando o banco fizer diferente.

### 6.3 Qual cartão fez a compra

Em faturas com cartões adicionais, a coluna de cartão é casada, nesta ordem:

1. **Últimos 4 dígitos** (`cards.last_digits`) de um cartão ativo;
2. **Nome do portador** comparado ao nome do cartão (sem acento, maiúsculas/minúsculas ignoradas);
3. sem casar, fica o **cartão escolhido** na importação — e o ajuste é feito em lote na tela de lançamentos.

### 6.4 Datas das parcelas importadas

Alguns bancos repetem a **data da compra original** em toda parcela: `04/07/2026 … 3 de 3` na fatura de outubro. Essa
parcela não é gasto de julho — ela é cobrada agora.

A importação deduz **o ciclo que o arquivo representa** (o ciclo em que cai a maioria das compras à vista) e então:

- data da linha **fora** do ciclo → o gasto é deslocado para o mês da parcela (`04/07` na 3/3 → `04/09`), guardando a
  compra original em `purchase_date` e nas observações;
- data da linha **dentro** do ciclo → ela já é a data da cobrança e fica como está (bancos que datam cada parcela).

Resultado: as parcelas caem no mesmo mês das compras à vista da fatura, que é quando pesam de verdade.

### 6.5 Situação de cada linha

| Situação | Significado | Entra? |
|---|---|---|
| `novo` | ainda não existe aqui | marcada por padrão |
| `duplicado` | já existe lançamento de mesmo valor e tipo no destino, até 4 dias de distância | desmarcada; o usuário decide |
| `importado` | esta mesma linha já veio em uma importação anterior | não |
| `pagamento` | pagamento da fatura anterior | desmarcada (é registrado na tela de faturas) |
| `mes_fechado` | cai em mês fechado | não, até reabrir |

A janela de 4 dias existe por um motivo concreto: a **assinatura cadastrada no cartão** já lança a cobrança no dia de
cobrança, enquanto a fatura mostra a data em que a compra foi processada. Sem a folga, importar a fatura duplicaria a
assinatura. A linha informa qual lançamento ela parece repetir (`duplicate_of`, `duplicate_date`).

### 6.6 Não duplicar entre importações

Cada linha carrega uma **marca de origem** (`import_fingerprint`): o `FITID` no OFX e, nos demais formatos, o hash de
destino + data + descrição + valor + a repetição da linha dentro do arquivo. Reimportar o mesmo arquivo (mesmo com
outro nome) marca tudo como `importado`. Arquivos com períodos sobrepostos reconhecem as linhas já importadas.

### 6.7 Gravação

`POST /api/imports/commit` sem `fingerprints` grava apenas as linhas `novo`; com `fingerprints`, grava as escolhidas.
Todas entram em uma única transação de banco, com `payment_method = card` no cartão, a categoria escolhida (ou
nenhuma, para categorizar em lote depois) e o número da parcela quando o arquivo informou.

---

## 7. Cartões e faturas

### 7.1 Ciclo

Com fechamento **C** e vencimento **D** (limitados ao tamanho do mês): a fatura do mês M vence em D/M e fecha em C/M
quando D > C, senão em C/(M−1). O período vai do dia seguinte ao fechamento anterior até o fechamento. Uma compra
pertence à fatura cujo período contém a sua data.

**Situação:** `paga` (há pagamento) · `aberta` (até o fechamento) · `fechada` (após o fechamento, até o vencimento, ou
sem valor a pagar) · `vencida` (depois do vencimento com valor a pagar).

### 7.2 Total

Total = soma dos lançamentos do período, com sinal: despesas e investimentos somam, receitas (estornos e créditos)
abatem. Fora dele, `projected_cents` traz as cobranças de assinatura previstas do ciclo ([§5](#5-gasto-mensal-sem-prazo-assinaturas)).

### 7.3 Pagar e desfazer

Pagar (`POST /api/cards/{id}/invoices/{mês}/pay`) registra uma **saída na conta bancária** escolhida, no valor da
fatura (ou no valor informado), e vincula o pagamento à fatura. Desfazer estorna a saída e a fatura volta a ficar em
aberto. Estornar a saída pelo extrato da conta também desfaz o pagamento, e desfazer o estorno o refaz.

### 7.4 Limite

Limite disponível = limite pessoal (ou o real, quando o pessoal é zero) − faturas não pagas com valor. Sem limite
cadastrado, não há número a exibir.

---

## 8. Contas a pagar

- O **checklist do mês** lista as contas ativas com vencimento, situação e o pagamento, mais as faturas de cartão
  fechadas e não pagas.
- **Marcar como paga** cria a despesa na data do vencimento e vincula o lançamento ao pagamento; desmarcar remove o
  lançamento.
- **Débito automático**: com conta escolhida, a rotina paga no vencimento e lança a despesa, uma vez por mês, sem
  duplicar. Desmarcar a conta no mês impede a cobrança automática daquele mês.
- **Vigência**: uma conta só aparece a partir do mês em que passou a existir (`active_since`), para não surgir como
  vencida em meses anteriores ao cadastro.

---

## 9. Contas bancárias e saldo

### 9.1 O saldo conta o que já aconteceu

`current_balance_cents` é um saldo acumulado e considera **apenas lançamentos e movimentações com data até hoje**.
Um lançamento futuro (uma parcela à frente, por exemplo) fica pendente (`balance_applied = 0`) e entra no saldo no dia
em que a data chega, pela rotina de débito automático. Remover, restaurar e editar respeitam a mesma regra: o efeito
só é desfeito se tiver sido aplicado.

Bancos criados antes dessa regra mantêm exatamente o saldo que tinham: a migração marca os lançamentos existentes como
já aplicados.

### 9.2 Movimentações

Depósito, saque, transferência e ajuste. O ajuste leva o saldo ao valor informado (útil para copiar o extrato do
banco). Transferência entre contas sai de uma e entra na outra atomicamente; entre moedas diferentes, o valor recebido
no destino é informado.

### 9.3 Extrato e projeção

O extrato mostra cada movimentação com o saldo após ela e permite estornar (e desfazer o estorno). Abaixo do saldo, a
tela projeta o que ainda deve sair até o fim do mês — contas a pagar do mês e assinaturas com débito automático na
conta — e o saldo previsto depois disso.

---

## 10. Metas e investimentos

**Metas.** Aportes e resgates entram no histórico e movem o valor guardado; cada movimentação pode ser estornada.
Com data-alvo, a tela calcula o aporte mensal necessário. Concluir uma meta a tira da lista preservando o histórico.

**Investimentos.** Quatro movimentações: aporte (soma aplicado e atual), resgate (reduz o atual e o aplicado pelo
**custo médio**, proporcional ao resgate), rendimento (só o atual) e ajuste (define o atual). O resultado é
`atual − aplicado`. Investimentos em outras moedas entram nos totais pela última cotação.

---

## 11. Orçamento, plano 70-20-10 e metas automáticas

- **Orçamento**: limite mensal por categoria de despesa comparado ao gasto do mês.
- **Plano 70-20-10**: percentuais de gastos fixos, lazer e investimento sobre o salário líquido. Aplicar o plano
  classifica categorias em baldes e vincula duas metas calculadas.
- **Reserva de emergência**: salário líquido × meses de reserva.
- **Número da liberdade**: salário líquido × multiplicador (150 por padrão). O progresso é o **patrimônio investido**,
  atualizado sozinho.
- Com o cálculo automático ligado, mudar o salário recalcula os alvos. Desligar exige confirmação, porque a meta
  deixa de acompanhar o planejamento.
- **Metas removidas não voltam sozinhas.** Quando a reserva ou o número da liberdade é removido, a tela de Metas
  mostra um aviso com a opção de criar de novo, já vinculada e com o cálculo automático. Sem salário (ou sem plano,
  no caso do número da liberdade), a ação fica indisponível explicando o que falta.

---

## 12. Fechamento mensal

Fechar um mês (`POST /api/months/{mês}/close`) guarda um **resumo congelado** daquele mês e trava alterações no
período. Não é possível fechar um mês que ainda não começou nem fechar duas vezes. Reabrir destrava e mantém o
histórico do fechamento. As telas avisam antes de tentar salvar algo em mês fechado e oferecem reabrir na hora.

---

## 13. Moedas e mercado

- Catálogo de moedas com as casas decimais de cada uma.
- Cotações e indicadores são buscados de fontes públicas de tempos em tempos; falha total mantém o último valor salvo
  e registra o erro.
- Cotação **manual** é preservada nas atualizações automáticas até ser limpa.
- Todo lançamento em outra moeda guarda a cotação usada, de modo que o histórico não muda quando o câmbio muda.

---

## 14. Rotinas em segundo plano

Duas rotinas rodam no servidor e podem ser disparadas manualmente:

- **Débito automático** (`POST /api/auto-debits/run`) — idempotente. Aplica, nesta ordem:
  1. os **lançamentos futuros cuja data chegou**, no saldo das contas;
  2. as **contas a pagar** com débito automático vencidas no mês;
  3. as **cobranças de assinatura** devidas, respeitando a janela de recuperação e o que já foi cobrado.
- **Cotações** — atualiza moedas e indicadores quando a atualização automática está ligada.

Nenhuma delas altera mês fechado.

---

## 15. Cópia de segurança, restauração e zerar a conta

- **Exportar JSON** — todos os registros em formato legível; é o formato aceito na restauração.
- **Baixar banco** — cópia SQLite consistente do banco do usuário.
- **Restaurar** — substitui os dados atuais pelo conteúdo do arquivo, validando tabelas, colunas e referências antes
  de gravar. Uma cópia automática do banco é feita antes, em `backups/`. Backups anteriores à v1.4 têm os saldos
  preservados (os lançamentos são marcados como já aplicados).
- **Zerar a conta** (`POST /api/reset`) — apaga **todos** os dados financeiros e devolve o app ao primeiro acesso:
  setup por fazer, tour por ver, categorias padrão recriadas e ids recomeçando do 1. O usuário e a senha continuam.
  Exige o texto de confirmação `APAGAR TUDO` na API; a interface ainda lista o que será apagado, pede uma marcação de
  ciência e o mesmo texto digitado. Antes de apagar, grava `backups/antes-de-zerar-<data>.db` e devolve o caminho.

---

## 16. Ajuda na interface

Cada tela tem um botão discreto de ajuda no topo que abre um painel com o que cada função faz e a melhor forma de
usá-la, incluindo os pontos que mais confundem (data do gasto x fatura, saldo x fatura, valor de assinatura valendo só
para o futuro). O conteúdo fica em `features/help/pageHelp.ts` — **é parte da documentação do sistema e acompanha
qualquer mudança de comportamento.**
