# API HTTP (v1.3)

JSON em `snake_case`, dinheiro em unidades mínimas (`int64`) da moeda do registro (centavos para BRL; ver [Moedas](#moedas-v12)), datas `YYYY-MM-DD`, competências `YYYY-MM`. O servidor apara (`trim`) todos os textos.

## Erros

Todas as respostas de erro usam Problem Details com textos em português:

| Situação | Status | Corpo |
|---|---|---|
| Validação | 400 | `{ "title": "Dados inválidos.", "errors": { "<campo_da_api>": ["<mensagem>"] } }` |
| Registro inexistente ou já removido | 404 | `{ "title": "Registro não encontrado.", "status": 404 }` |
| Rota `/api/*` desconhecida | 404 | Problem Details JSON (nunca o `index.html`) |
| Falha inesperada | 500 | `{ "title": "Não foi possível concluir a operação." }` |

Mensagens comuns: `Campo obrigatório.`, `Campo não permitido.` (campo desconhecido), `Valor inválido.` (tipo JSON errado), `Opção inválida.` (enum), `O valor deve ser maior que zero.`, `O valor não pode ser negativo.`, `O dia deve estar entre 1 e 31.`, `Use no máximo N caracteres.`, `Use uma data válida no formato AAAA-MM-DD.`, `Use uma competência válida no formato AAAA-MM.`, `Categoria não encontrada.`, `Cartão não encontrado.`, `Conta bancária não encontrada ou inativa.`. JSON malformado ou fora de UTF-8 retorna 400 no campo `body`.

## Leitura agregada

- `GET /api/health` → `{ "status": "ok" }`
- `GET /api/state` → configurações e registros ativos. `transactions[]` traz os 250 lançamentos mais recentes com `category_name`, `account_id`, `account_name`, `card_id` e `card_name`; `bills[]` traz `category_name`; `subscriptions[]` traz `category_name`, `card_name` e `last_charge_date`; `bank_accounts[]` traz `last_movement_date` (data mais recente entre movimentações não estornadas e lançamentos vinculados não removidos, ou `null`; também em `GET /api/bank-accounts`); `cards[]` traz `open_invoice_cents` (total da fatura aberta hoje), `unpaid_invoices_cents` (soma das faturas não pagas com total > 0 até a aberta) e `available_limit_cents` (limite pessoal — ou o real, quando o pessoal é 0 — menos `unpaid_invoices_cents`; `null` sem limite).
- `GET /api/summary?month=YYYY-MM` (padrão: mês local atual) → totais do mês:
  `{ month, income_cents, expense_cents, investment_cents, transactions_count, uncategorized_expense_cents, categories: [{ category_id, name, monthly_budget_cents, spent_cents, active }], bills: { total_count, paid_count, total_cents, paid_cents }, income_categories: [...], investment_categories: [...], uncategorized_income_cents, uncategorized_investment_cents }`.
  `categories` inclui toda categoria de despesa ativa e as inativas com gasto no mês (ordem: gasto desc, nome). `uncategorized_expense_cents` soma despesas sem categoria de despesa.
  `closed` (bool) e `closed_at` (texto ISO ou `null`) indicam se o mês está fechado.
  `income_categories` e `investment_categories` têm o mesmo formato de `categories`, com `spent_cents` = valor realizado (recebido/aplicado) no mês, e seguem as mesmas regras para categorias de receita e de investimento. `uncategorized_income_cents` e `uncategorized_investment_cents` somam receitas/investimentos sem categoria do respectivo tipo.
- `GET /api/checklist?month=YYYY-MM` (padrão: mês local atual) → contas ativas com `category_name`, `paid`, `paid_at`, `transaction_id`.
- `GET /api/about` → `{ "database_path": "<caminho absoluto>", "schema_version": "009_bill_active_since" }`.

## CRUD por módulo

Módulos: `transactions`, `bills`, `goals`, `investments`, `cards`, `bank-accounts`, `categories`, `subscriptions`.

| Rota | Resposta |
|---|---|
| `GET /api/{module}` | registros ativos |
| `GET /api/transactions?month=YYYY-MM` | todos os lançamentos não removidos do mês (data desc, id desc, sem limite); sem `month`, os 250 mais recentes |
| `POST /api/{module}` | 201 `{ "ok": true, "id": 1 }` |
| `PUT /api/{module}/{id}` | 200 `{ "ok": true }`; 404 se inexistente ou removido |
| `DELETE /api/{module}/{id}` | 204 (exclusão lógica: `deleted_at` em lançamentos, `active = 0` nos demais); 404 se já removido |
| `POST /api/{module}/{id}/restore` | 200 `{ "ok": true }` desfaz a exclusão; 404 se inexistente ou não removido |

Na criação os campos obrigatórios são exigidos; na atualização apenas os campos enviados são validados. Os esquemas ficam em `FinanceControl.Application/Validation/ModuleSchemas.cs` (fonte única):

| Módulo | Obrigatórios | Opcionais |
|---|---|---|
| transactions | `date`, `description` (≤160), `kind` (income/expense/investment), `amount_cents` > 0 | `category_id`, `payment_method` (card/debit/pix/cash/transfer/boleto/other; padrão card — `card` exige `card_id`, ver [CR-06](#compra-no-cartão-exige-cartão-cr-06)), `account_id` (conta ativa), `card_id` (cartão ativo), `notes` (≤500) |
| bills | `name` (≤120), `amount_cents` > 0 | `due_day` 1–31, `category_id`, `recurring`, `active` |
| goals | `name`, `target_cents` > 0 | `type` (emergency/travel/purchase/education/retirement/custom), `current_cents` ≥ 0, `target_date`, `currency` (`^[A-Z]{3}$`, padrão BRL), `active`, `notes` |
| investments | `name` | `institution` (≤120), `type` (fixed_income/treasury/stocks/funds/real_estate_funds/crypto/pension/other), `invested_cents` ≥ 0, `current_cents` ≥ 0, `liquidity` (≤80), `benchmark` (≤80), `active` |
| cards | `name` | `closing_day`, `due_day`, `real_limit_cents` ≥ 0, `personal_limit_cents` ≥ 0, `active` |
| bank-accounts | `name`, `institution` | `account_type` (checking/payment/savings/brokerage/cash), `current_balance_cents` (pode ser negativo), `color_label` (≤80), `active` |
| categories | `name`, `kind` | `monthly_budget_cents` ≥ 0, `active`, `bucket` (fixo/lazer/investimento/fora; `null` ou `""` limpa — v1.3) |
| subscriptions | `name`, `amount_cents` > 0; `next_billing_date` quando `frequency` é yearly/weekly | `billing_day`, `category_id`, `card_id`, `frequency` (monthly/yearly/weekly; padrão monthly), `next_billing_date`, `active`, `notes` |

`GET /api/subscriptions` inclui `category_name`, `card_name` e `last_charge_date` (data da cobrança mais recente cujo lançamento não foi removido, ou `null`).

Assinaturas anuais e semanais exigem `next_billing_date`: na criação e em toda atualização cujo registro resultante (campos enviados + valores atuais) seria anual/semanal sem data → 400 `{ "next_billing_date": ["Informe a data da próxima cobrança."] }`. Registros antigos não são alterados pela migração; ao editá-los é preciso informar a data.

### Lançamento vinculado a conta bancária

Com `account_id`, o lançamento altera o saldo da conta na mesma transação SQL: receita soma, despesa e investimento subtraem. `PUT` desfaz o efeito antigo e aplica o novo (conta, tipo e valor podem mudar); `DELETE` desfaz; `restore` reaplica. Sem `account_id`, saldos não são tocados.

Conta removida: `PUT` que mantém (não envia) uma `account_id` de conta inativa e `restore` de lançamento cuja conta está inativa → 400 `{ "account_id": ["A conta vinculada foi removida. Restaure a conta ou escolha outra."] }`. Enviar outra conta (ou `null`) libera a edição; `DELETE` continua permitido e desfaz o efeito. Uma `account_id` enviada que não existe ou está inativa continua respondendo "Conta bancária não encontrada ou inativa.".

### Compras no cartão

Com `card_id` no registro resultante (enviado ou atual): `account_id` deve ser nulo → senão 400 `account_id` "Compras no cartão não movimentam a conta; o pagamento é feito pela fatura."; `payment_method` é preenchido com `card` quando não enviado e qualquer outro valor → 400 `payment_method` "Compras no cartão usam a forma de pagamento Cartão de crédito.". Cartão inexistente ou removido → 400 `card_id` "Cartão não encontrado ou inativo.". Para trocar uma compra no cartão por outra forma, envie `card_id: null` junto.

## Fluxos financeiros

### Checklist de contas

`POST /api/checklist` com `{ bill_id, month, paid, register_transaction?: true, date?, amount_cents?, account_id?, payment_method?: "other" }` → `{ "ok": true, "transaction_id": 1 | null }`.

- `paid: true` em conta não paga: registra o pagamento e, com `register_transaction`, cria uma despesa (descrição = nome da conta, categoria da conta, valor da conta, data = hoje local no mês atual ou o vencimento limitado ao último dia do mês, observação `Pagamento da conta <nome> (<mês>)`) vinculada em `bill_payments.transaction_id`. Tudo atômico.
- `paid: true` em conta já paga: idempotente, devolve o lançamento existente.
- `paid: false`: remove logicamente o lançamento vinculado (desfazendo o efeito no saldo) e reabre a conta.

### Movimentações e extratos

| Rota | Descrição |
|---|---|
| `POST /api/goals/{id}/entries` | `{ date, kind?: "contribution" (padrão) ou "withdrawal", amount_cents > 0, notes? }` → 201 `{ ok, id }`. Aporte soma e resgate subtrai do valor acumulado; resgate acima do valor guardado → 400 `amount_cents` "O resgate é maior que o valor guardado na meta." |
| `POST /api/investments/{id}/entries` | `{ date, kind: deposit/withdrawal/yield/adjustment, amount_cents, notes? }` (ajuste = novo valor atual, ≥ 0) → 201 `{ ok, id }`. Resgate acima do saldo atual → 400 `amount_cents` "O resgate é maior que o saldo atual." |
| `POST /api/bank-accounts/{id}/entries` | `{ date, kind: deposit/withdrawal/transfer_in/transfer_out/adjustment, amount_cents, description?, related_account_id?, notes? }` → 201 `{ ok, id }` (na transferência, o id da saída). Ajuste = novo saldo, pode ser negativo. `transfer_out` exige conta de destino ativa e cria a entrada `transfer_in` vinculada; descrição em branco vira "Transferência enviada"/"Transferência recebida" |
| `GET /api/goals/{id}/entries` | `[{ id, goal_id, date, kind, amount_cents, notes }]` (data desc, id desc; `amount_cents` sempre positivo, o sinal vem de `kind`) |
| `GET /api/investments/{id}/entries` | `[{ id, investment_id, date, kind, amount_cents, notes }]` |
| `GET /api/bank-accounts/{id}/entries` | até 500 itens `{ id, source: "entry"|"transaction", date, description, kind, amount_cents, delta_cents, related_account_id, related_account_name, notes }` unindo movimentações e lançamentos vinculados; `delta_cents` é o efeito no saldo (nulo para ajustes antigos) |

Paginação das três listagens: `?limit=1..200&offset=≥0` (opcionais). A resposta continua sendo a lista na mesma ordem e o cabeçalho `X-Total-Count` traz o total de linhas (sempre presente). Sem `limit`: metas e investimentos devolvem tudo e o extrato até 500 itens. Valor fora da faixa → 400 `limit` "Informe um valor entre 1 e 200." / `offset` "O valor não pode ser negativo."; texto não numérico → "Valor inválido.".

Resgate de investimento pelo custo médio: `current_delta = −amount`; `invested_delta = −min(aplicado, round(aplicado × amount / atual))` quando o saldo atual é positivo (senão `−min(aplicado, amount)`). O arredondamento é para o centavo mais próximo, com meio centavo para cima. Os deltas ficam gravados na movimentação, então o estorno restaura exatamente os valores anteriores. Aporte, rendimento e ajuste não mudaram.

### Estorno de movimentações

`DELETE /api/goals/{id}/entries/{entryId}`, `DELETE /api/investments/{id}/entries/{entryId}` e `DELETE /api/bank-accounts/{id}/entries/{entryId}` → 204: marca `deleted_at` e aplica o efeito inverso, atomicamente. Estornar qualquer lado de uma transferência vinculada estorna os dois. Estornar um resgate de meta devolve o valor à meta. 404 quando a movimentação não existe, pertence a outro registro ou já foi estornada.

`POST /api/goals/{id}/entries/{entryId}/restore`, `POST /api/investments/{id}/entries/{entryId}/restore` e `POST /api/bank-accounts/{id}/entries/{entryId}/restore` → 200 `{ "ok": true }`: desfazem o estorno (limpam `deleted_at` e reaplicam o delta gravado; numa transferência vinculada, os dois lados), atomicamente. 404 quando a movimentação não existe, não está estornada ou pertence a outro registro. Desfazer que deixaria a meta negativa → 400 `amount_cents` "O resgate é maior que o valor guardado na meta."; o investimento → 400 `amount_cents` "A movimentação deixaria o investimento com saldo negativo.".

Movimentações criadas antes da migração 004 não têm deltas gravados: entradas, saídas, rendimentos e aportes em metas continuam estornáveis; ajustes e transferências sem vínculo retornam 400 `{ "entry": ["Esta movimentação foi registrada antes do histórico detalhado e não pode ser estornada."] }`. Estornos que deixariam investimento (ou valor acumulado de meta) negativo retornam 400 em `amount_cents`.

### Cobrança de assinaturas

`POST /api/subscriptions/{id}/charge` com corpo opcional `{ date?, amount_cents? > 0, account_id?: número | null, payment_method? }` → 201 `{ "ok": true, "transaction_id": 1, "charge_date": "AAAA-MM-DD" }`.

- Padrões: `date` = hoje (fuso local), `amount_cents` = valor da assinatura, `payment_method` = `card` se a assinatura tem cartão, senão `other`; sem `account_id` nenhum saldo é alterado. Corpo vazio vale como `{}`.
- Cria, atomicamente, uma despesa (descrição = nome da assinatura, categoria da assinatura, observação `Cobrança da assinatura <nome>`) e o registro em `subscription_charges`. Com `account_id`, o saldo da conta é debitado como em qualquer lançamento.
- Já existe cobrança na data com lançamento ativo → 400 `{ "date": ["Esta cobrança já foi lançada."] }`. Se o lançamento daquela cobrança foi removido em Lançamentos, a cobrança antiga é substituída.
- Assinatura inexistente ou removida → 404.

`DELETE /api/subscriptions/{id}/charge?date=AAAA-MM-DD` → 204: remove logicamente o lançamento vinculado (desfazendo o efeito no saldo) e apaga o registro da cobrança, permitindo lançá-la de novo. 404 quando não há cobrança na data; `date` ausente ou inválida → 400 `date`.

- Assinatura com cartão ativo cobrada sem `account_id` e com forma de pagamento `card` (o padrão): o lançamento recebe `card_id` e entra na fatura. Com conta ou outra forma de pagamento, não.

### Fechamento mensal

- `GET /api/months/closings` → `[{ month, closed_at, notes, summary }]` (meses fechados, do mais recente; `summary` = documento de `/api/summary` guardado no fechamento, ou `null` para fechamentos anteriores à 006).
- `POST /api/months/{AAAA-MM}/close` com corpo opcional `{ notes?: texto ≤ 500 }` → 200 `{ ok, month, closed_at }`. Mês inválido → 400 `month` (formato); mês posterior ao mês local atual → 400 `month` "Não é possível fechar um mês que ainda não começou."; já fechado → 400 `month` "Este mês já está fechado.".
- `POST /api/months/{AAAA-MM}/reopen` → 200 `{ ok }`; 404 quando o mês não está fechado.

Enquanto o mês está fechado, estas operações respondem 400 com "O mês MM/AAAA está fechado. Reabra-o para alterar." (campo `date`, exceto quando indicado):
lançamento criado, editado (data antiga ou nova no mês), removido ou restaurado; checklist do mês (campo `month`) e pagamento de conta cuja data do lançamento cai no mês (ou desmarcar quando o lançamento vinculado é do mês); cobrança de assinatura e desfazer cobrança na data; aporte/resgate/movimentação, estorno e desfazer estorno de metas, investimentos e contas com data no mês; pagar ou desfazer pagamento de fatura cuja data de pagamento ou mês da fatura é o mês fechado.

### Faturas de cartão

Ciclo (cartão com fechamento C e vencimento D, ambos limitados ao tamanho do mês): a fatura é identificada pelo mês de vencimento M; vence em D/M; fecha em C/M quando D > C, senão em C/(M−1) (a comparação usa os dias configurados); período = dia seguinte ao fechamento anterior … fechamento. Uma compra no cartão (`card_id`) pertence à fatura cujo período contém sua data. Total = despesas e investimentos − receitas (créditos/estornos) do período. Regras puras em `FinanceControl.Domain/Rules/CardInvoiceRules.cs`.

Status (hoje = data local): `paga` (há pagamento), `aberta` (hoje ≤ fechamento), `fechada` (após o fechamento, até o vencimento), `vencida` (após o vencimento sem pagamento).

- `GET /api/cards/{id}/invoices?from=AAAA-MM&to=AAAA-MM` → `[{ month, period_start, period_end, closing_date, due_date, total_cents, items_count, status, paid: { amount_cents, date, account_id, account_name, bank_entry_id } | null }]` em ordem crescente de mês. Padrão: a fatura anterior, a aberta hoje (que contém a data de hoje) e a seguinte. Só `from` ou só `to` = um mês. `to` < `from` → 400 `to` "A competência final deve ser igual ou posterior à inicial."; mais de 36 meses → 400 `to` "Informe um intervalo de até 36 meses.". Cartão inexistente → 404 (cartões removidos continuam consultáveis).
- `GET /api/cards/{id}/invoices/{AAAA-MM}` → a fatura + `items: [lançamento]` (data asc, id asc; mesmo formato de `/api/transactions`).
- `POST /api/cards/{id}/invoices/{AAAA-MM}/pay` com `{ account_id (obrigatório, conta ativa), date?: AAAA-MM-DD (padrão hoje local), amount_cents?: > 0 (padrão o total) }` → 201 `{ ok, bank_entry_id }`: cria, atomicamente, a saída (`withdrawal`, descrição "Fatura <cartão> <MM/AAAA>") na conta e o registro do pagamento. Não é despesa (as compras já são). Já paga → 400 `month` "Esta fatura já foi paga."; total ≤ 0 sem `amount_cents` → 400 `amount_cents` "A fatura não tem valor a pagar. Informe o valor do pagamento.".
- `DELETE /api/cards/{id}/invoices/{AAAA-MM}/pay` → 204: estorna a saída (exclusão lógica e saldo de volta; se ela já foi estornada no extrato, nada muda no saldo) e apaga o registro do pagamento. 404 sem pagamento.

### Vínculos

- `GET /api/categories/{id}/links` → `{ transactions, bills, subscriptions }` (lançamentos não removidos, contas e assinaturas ativas). Categoria removida também responde; inexistente → 404.
- `GET /api/cards/{id}/links` → `{ transactions, subscriptions }` (lançamentos não removidos, assinaturas ativas); inexistente → 404.

### Transferência de vínculos (categorias e cartões)

`POST /api/categories/{id}/reassign` com `{ "target_id": número | null }` → 200 `{ "ok": true, "updated": { "transactions": N, "bills": N, "subscriptions": N } }`: move, atomicamente, os lançamentos não removidos e as contas e assinaturas ativas da categoria `{id}` para `target_id` (`null` = sem categoria). A origem pode estar ativa ou removida; inexistente → 404.

`POST /api/cards/{id}/reassign` com `{ "target_id": número | null }` → 200 `{ "ok": true, "updated": { "subscriptions": N, "transactions": N } }`, com as mesmas regras (cartões não têm tipo); desde a v1.2 também move os lançamentos não removidos do cartão (e, com eles, as faturas).

Erros em `target_id` (400): ausente → "Campo obrigatório."; não numérico ou ≤ 0 → "Valor inválido."; igual à origem → "Selecione uma categoria diferente da atual." / "Selecione um cartão diferente do atual."; inexistente ou removido → "Categoria de destino não encontrada ou removida." / "Cartão de destino não encontrado ou removido."; categoria de outro tipo → "A categoria de destino deve ser do mesmo tipo.".

## Configuração e cópia de segurança

- `PUT /api/settings`, `POST /api/setup`, `POST /api/setup/skip` → `{ "ok": true }`.
- `GET /api/backup` → JSON `{ version: 3, exported_at, data: { <tabela>: [linhas] } }` (inclui `subscription_charges` desde a migração 005 e `card_invoice_payments` desde a 006; backups anteriores sem essas tabelas continuam aceitos e as deixam vazias).
- `GET /api/backup/database` → arquivo SQLite consistente (`VACUUM INTO`), `application/vnd.sqlite3`, `lmm-finance-<AAAA-MM-DD>.db`.
- `POST /api/backup/restore` com um documento de backup (versão 2 ou 3): valida tabelas e colunas (coluna inexistente → 400 `tabela.coluna`), grava uma cópia de segurança em `<pasta do banco>/backups/antes-da-restauracao-<AAAAMMDD-HHmmss>.db` e substitui os dados atomicamente (chaves estrangeiras verificadas antes do commit). Tabelas ausentes são esvaziadas, exceto `settings`, `exchange_rates` e `market_indicators` (mantidas como estão; v1.3). Após a carga, `sqlite_sequence` de cada tabela é ajustada para `MAX(id)` (removida nas tabelas vazias), para que o próximo registro receba `MAX(id) + 1`. Resposta: `{ ok, safety_copy, restored: { <tabela>: <linhas> } }`.

Ao encerrar, a API executa `PRAGMA wal_checkpoint(TRUNCATE)` no banco e fecha o pool de conexões, deixando o `-wal` vazio ou ausente.

No ambiente de desenvolvimento, o contrato OpenAPI fica disponível em `/openapi/v1.json`.

---

## v1.2

Mensagens novas: `Moeda não suportada. Escolha uma moeda da lista.` (código bem formado fora do catálogo), `O lançamento deve usar a moeda da conta vinculada.`, `A conta escolhida usa outra moeda.`, `Não é possível trocar a moeda de uma conta com movimentações.`, `Informe a cotação usada ou atualize as cotações.`, `Informe uma cotação maior que zero.`, `Informe o valor recebido na conta de destino.`, `Entre contas da mesma moeda, o valor recebido deve ser igual ao enviado.`, `Use até 40 caracteres entre letras minúsculas, números, - e _.` (brand/icon), `Use uma cor no formato #RRGGBB.`, `Use uma imagem PNG, JPG, WEBP ou SVG de até 150 KB.`, `Escolha a conta que será debitada.` (contas a pagar), `Escolha a conta que será debitada ou um cartão.` (assinaturas), `O real é a moeda base e não tem cotação.`, `Esta meta acompanha o salário. Confirme para desligar o cálculo automático.`, `Informe o salário líquido e os meses de reserva para calcular a meta.`.

### Campos novos por módulo

| Módulo | Campos (todos opcionais) |
|---|---|
| transactions | `currency` (catálogo; com conta vinculada é a da conta e é herdada quando omitida), `exchange_rate` (texto decimal ou número > 0; BRL por 1 unidade), `brand`. Resposta também traz `base_amount_cents` (BRL na data; somente leitura) |
| bills | `auto_debit`, `account_id` (conta ativa na mesma moeda), `currency`, `icon`, `brand`. Resposta: `auto_debit_since`, `account_name` |
| subscriptions | `auto_debit`, `account_id`, `currency`, `icon`, `brand`. Resposta: `auto_debit_since`, `account_name` |
| bank-accounts | `currency` (só pode mudar enquanto a conta não tem movimentações), `brand`, `logo_data` |
| investments | `currency`, `brand`, `logo_data` |
| cards | `brand` (emissor), `network` (visa/mastercard/elo/amex/hipercard/other), `color` (`#rrggbb`); cartões são sempre BRL |
| categories | `icon`, `color` |
| goals | `currency` agora aceita só códigos do catálogo; `detach_auto` (controle, não é coluna — ver reserva) |

`brand`/`icon`: `^[a-z0-9_-]{1,40}$` (ids dos catálogos do frontend; ids desconhecidos são aceitos). `logo_data`: `data:image/(png|jpeg|webp|svg+xml);base64,…` com até 200 000 caracteres. Texto vazio ou `null` limpa esses campos. Nova forma de pagamento `auto_debit` ("Débito automático").

### Moedas (v1.2)

- `GET /api/currencies` → `[{ code, name, symbol, decimals, kind: "fiat"|"crypto" }]` (BRL, USD, EUR, GBP, JPY 0 casas, CHF, CAD, AUD, ARS, BTC/ETH/SOL 8 casas, USDT 2 casas). A moeda base é BRL.
- Todo `*_cents` guarda unidades mínimas da moeda do registro (0,005 BTC = `500000`).
- Lançamento: moeda enviada, senão a da conta vinculada (na criação ou quando a conta muda), senão a atual/BRL. Cotação: a enviada; na edição sem troca de moeda, a gravada no lançamento; senão a última conhecida (`/api/market`); sem cotação para moeda estrangeira → 400 `exchange_rate`. `base_amount_cents = round(valor / 10^casas × cotação × 100)` (meio para longe do zero). BRL grava cotação `"1"`. Resumo, relatórios, orçamentos e faturas usam `base_amount_cents`; compras no cartão em moeda estrangeira entram na fatura pelo valor em BRL.
- Pagamento de conta a pagar (checklist) e cobrança de assinatura criam o lançamento na moeda do registro; conta de débito de outra moeda → 400 `account_id`. `POST /api/subscriptions/{id}/charge` aceita também `exchange_rate`.
- Transferência (`transfer_out`) entre contas de moedas diferentes exige `related_amount_cents` (valor creditado no destino, em unidades da moeda de destino); entre contas da mesma moeda é opcional e, se enviado, deve ser igual a `amount_cents`. O estorno e o desfazer revertem os dois lados pelos deltas gravados.

### Mercado

- `GET /api/market` → `{ base: "BRL", auto_refresh, last_refresh_at, last_error, rates: [{ currency, rate_brl: "5.1245", change_pct, source, fetched_at, manual, stale }], indicators: [{ code: "selic"|"cdi"|"ipca_12m"|"ipca_month", label, value, unit: "% a.a."|"% em 12 meses"|"% no mês", reference_date, source, fetched_at, stale }] }`. `rates` na ordem do catálogo, só moedas com valor salvo; `stale` = buscado há mais de 24 h (cotação manual nunca fica `stale`). `source` já vem como texto de exibição: "AwesomeAPI", "CoinGecko", "Banco Central (SGS)" ou "Manual". Labels: "Selic", "CDI", "IPCA (12 meses)", "IPCA (mês)".
- `POST /api/market/refresh` → 200 com o mesmo formato + `refreshed: { rates, indicators }` (quantos foram gravados). Fontes: AwesomeAPI em dois lotes (moedas, cripto; lote que falha é refeito par a par), CoinGecko para a cripto que faltar, SGS séries 432/4389/13522/433; timeout de 8 s por requisição. Cotações manuais não são sobrescritas. Nada obtido → `last_error` = "Não foi possível atualizar as cotações agora. Os últimos valores salvos continuam valendo." e o cache e `last_refresh_at` são mantidos; qualquer sucesso limpa `last_error`.
- `PUT /api/market/rates/{moeda}` com `{ rate_brl: "5,50" | 5.5 }` → 200 com o formato de `GET /api/market` (cotação manual). `DELETE /api/market/rates/{moeda}` → 204 (desliga o manual; o valor fica até a próxima atualização). Moeda fora do catálogo ou sem valor salvo (DELETE) → 404; `BRL` → 400 `currency`.
- Serviço em segundo plano: ao iniciar e a cada `Market:RefreshHours` (appsettings, padrão 6) quando `settings.market_auto_refresh` está ligado.

### Débito automático

- Ligar `auto_debit` grava `auto_debit_since` = hoje (local) quando estava desligado; desligar limpa. Conta a pagar com débito automático exige `account_id`; assinatura exige `account_id` ou `card_id`.
- `POST /api/auto-debits/run` (também executado ao iniciar e a cada hora) → `{ created: [{ kind: "bill"|"subscription", id, name, date, amount_cents, currency, transaction_id }] }`. Idempotente.
  - Contas a pagar, só o mês atual (aberto): vencimento (dia limitado ao mês) ≤ hoje e ≥ `auto_debit_since`, não paga e não desmarcada no mês → pagamento igual ao do checklist (forma `auto_debit`, conta da conta a pagar, data = vencimento).
  - Desmarcar o pagamento (`POST /api/checklist` com `paid: false`) grava `auto_debit_skipped = 1` no mês; o débito automático não paga de novo.
  - Assinaturas: datas de cobrança (mensal no dia de cobrança limitado ao mês; anual no mês/dia de `next_billing_date`; semanal a cada 7 dias ancorado em `next_billing_date`) em [max(`auto_debit_since`, hoje − 62 dias), hoje] sem registro em `subscription_charges` → despesa (descrição = nome, categoria da assinatura, forma `card` com o cartão ativo da assinatura, senão `auto_debit` na conta; observação "Cobrança automática de <nome>"). Remover o lançamento gerado mantém o registro da cobrança (não é recriado). Meses fechados, conta inativa/de outra moeda e moeda estrangeira sem cotação são pulados.
- Checklist ganha `auto_debit`, `auto_debit_since`, `account_id`, `account_name`, `currency`, `icon`, `brand`, `auto_debit_skipped`.

### Relatórios e projeções

- `GET /api/reports?from=AAAA-MM&to=AAAA-MM` (padrão: 6 meses até o atual; só `from` vai até o mês atual; só `to` volta 5 meses; máximo 36; `to` < `from` → 400 `to`) → `{ from, to, months: [{ month, income_cents, expense_cents, investment_cents, net_cents }], totals: { income_cents, expense_cents, investment_cents, net_cents, avg_monthly_income_cents, avg_monthly_expense_cents, savings_rate_pct }, expense_categories: [{ category_id, name, total_cents, share_pct }], income_categories, payment_methods: [{ method, total_cents, count }], top_expenses: [{ id, date, description, category_id, category_name, amount_cents, currency, base_amount_cents }], net_worth: [{ month, total_cents, bank_cents, investments_cents }], currency_exposure: [{ currency, native_cents, base_cents, share_pct }] }`. Tudo em BRL via `base_amount_cents`; meses sem dados aparecem zerados; `net = receitas − despesas − investimentos`; `savings_rate_pct = (receitas − despesas) / receitas × 100` com 1 casa (null sem receitas); categorias de outro tipo ou ausentes = "Sem categoria" (`category_id: null`), como no resumo; `payment_methods` considera despesas; `top_expenses` = 10 maiores despesas; `net_worth` = fotografias gravadas no período; `currency_exposure` = contas + investimentos ativos por moeda (BRL incluído), na ordem do catálogo.
- `GET /api/reports/transactions.csv?from&to` (mesmas regras de período) → `text/csv; charset=utf-8` com BOM, separador `;`, fim de linha CRLF, cabeçalho `Data;Descrição;Tipo;Categoria;Forma de pagamento;Conta;Moeda;Valor;Valor em BRL;Observações`, datas `dd/MM/aaaa`, valores com vírgula decimal e sem separador de milhar, rótulos em português; `Conta` = conta ou, sem ela, o cartão; textos com `;`, aspas ou quebra de linha vão entre aspas e textos iniciados por `= + - @` recebem `'` (proteção contra fórmulas). Arquivo `lmm-lancamentos-<from>-a-<to>.csv`.
- `GET /api/projections/base` → `{ as_of, currency: "BRL", starting: { bank_cents, investments_cents, total_cents }, income: { planned_monthly_cents, avg_3m_cents, avg_6m_cents }, expenses: { planned_limit_cents, bills_monthly_cents, subscriptions_monthly_cents, avg_3m_cents, avg_6m_cents }, investment_contribution_avg_3m_cents, indicators: { selic_pct, cdi_pct, ipca_12m_pct }, goals: [{ id, name, target_cents, current_cents, currency, base_target_cents, base_current_cents, target_date }], emergency: { months_target, monthly_limit_cents, reserve_target_cents } }`. Médias sobre os 3/6 meses completos anteriores ao atual (soma ÷ 3 ou 6); assinaturas pelo equivalente mensal (anual ÷ 12, semanal × 52 ÷ 12) em BRL; `reserve_target_cents` = salário × meses.
- `net_worth_snapshots`: o patrimônio do mês atual (contas + investimentos ativos em BRL pela última cotação) é regravado a cada `GET /api/state`, `/api/reports` e `/api/projections/base`.
- `GET /api/summary` ganha `top_expenses` (10, mesmo formato dos relatórios) e `daily_expenses: [{ date, total_cents }]` (despesas em BRL por dia: até hoje no mês atual, o mês inteiro nos anteriores, lista vazia nos futuros). `bills.total_cents`/`paid_cents` convertem contas em outra moeda pela última cotação. O resumo congelado no fechamento inclui os dois campos.

### Configurações, preferências e reserva de emergência

- `PUT /api/settings` passa a validar como os demais módulos (tipo errado → "Valor inválido.", campo `null` mantém o valor atual) e aceita também `market_auto_refresh` (bool), `emergency_goal_auto` (bool) e `ui_preferences` (objeto parcial, mesclado ao salvo): `theme` noite|esmeralda|ouro|grafite|claro|sistema, `accent` indigo|esmeralda|ouro|violeta|ciano|rosa, `density` confortavel|compacto, `animations`, `hide_values`, `show_market_ticker` (bool) e `dashboard_widgets` (lista ordenada sem repetições de saldo, fluxo, contas, categorias, metas, mercado, assinaturas, patrimonio, maiores_gastos, ritmo, orcamento, pagamentos e, desde a v1.3, plano). Chave desconhecida → 400 `ui_preferences.<chave>` "Campo não permitido."; valor fora das opções → "Opção inválida.".
- `GET /api/state` → `settings` ganha `ui_preferences` (com padrões: noite, esmeralda, confortavel, animações ligadas, valores visíveis, ticker ligado; widgets padrão desde a v1.3, CR-13: saldo, contas, fluxo, ritmo, categorias, orcamento, metas, plano), `market_auto_refresh`, `emergency_reserve_target_cents` (salário × meses), `emergency_goal_id`, `emergency_goal_auto`, `emergency_goal_status` ("linked" | "removed" | "none").
- Reserva (MEL-43), na mesma transação de `PUT /api/settings` e `POST /api/setup`, com salário > 0, meses ≥ 1 e cálculo automático ligado: sem meta vinculada, vincula a meta ativa do tipo `emergency` com maior valor guardado ou cria "Reserva de emergência" (tipo `emergency`); meta vinculada ativa → atualiza só `target_cents`; meta vinculada removida → nada.
- `POST /api/settings/emergency-goal` → 200 `{ ok, goal_id }`: religa o cálculo automático e cria/vincula a meta agora (meta removida → outra meta ativa do tipo emergência ou uma nova). Sem salário/meses → 400 `monthly_net_income_cents`.
- `PUT /api/goals/{id}` da meta vinculada, com cálculo automático ligado, mudando `target_cents` → 400 `target_cents` "Esta meta acompanha o salário. Confirme para desligar o cálculo automático."; reenviar com `detach_auto: true` grava o alvo e desliga o cálculo (`emergency_goal_auto = false`). Demais campos continuam editáveis.

### Faturas (MEL-44)

- Estornar pelo extrato (`DELETE /api/bank-accounts/{id}/entries/{entryId}`) a saída de um pagamento de fatura apaga o pagamento (a fatura volta a ficar sem pagamento). Desfazer esse estorno refaz o pagamento; se a fatura já foi paga de novo → 400 `entry` "Esta fatura já foi paga.". Mês da fatura fechado → 400 `date`.
- `POST /api/cards/{id}/reassign` também move os lançamentos (ver acima).

### Backup

O backup (versão 3) inclui também `exchange_rates`, `market_indicators` e `net_worth_snapshots`; backups anteriores sem essas tabelas continuam aceitos: `net_worth_snapshots` fica vazia e, desde a v1.3, as cotações e os indicadores atuais são mantidos.

---

## v1.3

Mensagens novas: `Os percentuais devem somar 100%.`, `Informe o salário líquido para aplicar o plano.`, `Informe um valor entre 1 e 600.` (multiplicador), `Aplique o plano 70-20-10 para vincular o número da liberdade.`, `Escolha o cartão da compra.`.

### Plano 70-20-10 e número da liberdade (MEL-45)

`POST /api/plan` com `{ fixed_pct, fun_pct, invest_pct, emergency_months?, freedom_multiplier?, create_buckets?: false, monthly_net_income_cents? }` → 200 `{ "ok": true, "emergency_goal_id": 1 | null, "freedom_goal_id": 2 | null, "created_categories": ["Gastos fixos", …], "marked_categories": ["Lazer", …] }`.

- Validação: percentuais inteiros obrigatórios ≥ 0 (negativo → "O valor não pode ser negativo."; texto/decimal → "Valor inválido.") e a soma deve ser 100 → senão 400 `fixed_pct` "Os percentuais devem somar 100%."; `emergency_months` 1–120 ("Informe um valor entre 1 e 120.") e `freedom_multiplier` 1–600 ("Informe um valor entre 1 e 600."), ambos opcionais (valem os atuais: meses da reserva e multiplicador, 150 por padrão); `create_buckets` booleano. Campos desconhecidos são ignorados.
- Exige salário: `monthly_net_income_cents` enviado no corpo (gravado junto) ou o já salvo > 0 → senão 400 `monthly_net_income_cents` "Informe o salário líquido para aplicar o plano.". Nada é gravado quando há erro.
- Numa única transação: grava `plan_fixed_pct`/`plan_fun_pct`/`plan_invest_pct`, `emergency_months_target` e `freedom_multiplier`; teto `monthly_spending_limit_cents` = round(S × (fixos + lazer) / 100); sincroniza a reserva (regra MEL-43) e o **número da liberdade**; com `create_buckets`, cria as categorias-balde que faltam.
- Número da liberdade (mesmas regras da reserva, só com plano aplicado e cálculo automático ligado): meta vinculada ativa → atualiza só `target_cents` = S × multiplicador; vinculada removida → nada; sem meta vinculada → religa a meta ativa do tipo `retirement` chamada "Número da liberdade" ou "Independência financeira" (sem diferenciar caixa e acentos; a de maior valor guardado) ou cria "Número da liberdade" (tipo `retirement`, BRL). Repetir o `POST` nunca duplica metas.
- Categorias-balde: "Gastos fixos" (despesa, `fixo`), "Lazer" (despesa, `lazer`) e "Investimentos" (investimento, `investimento`). Nunca duplica pelo nome (sem caixa e acentos, entre as ativas de qualquer tipo): a existente sem balde recebe o balde (`marked_categories`); com balde, fica como está.
- Chame depois de `POST /api/setup` (o setup regrava teto e meses).

`DELETE /api/plan` → 204 (idempotente): percentuais voltam a `null`; metas, vínculos, teto e multiplicador ficam como estão. Sem plano a meta da liberdade não é sincronizada nem travada; reaplicar o plano volta a usar a mesma meta vinculada.

`POST /api/settings/freedom-goal` → 200 `{ ok, goal_id }` (espelho de `/api/settings/emergency-goal`): religa o cálculo automático e cria/vincula a meta agora (meta removida → outra meta elegível ou uma nova). Sem salário → 400 `monthly_net_income_cents` "Informe o salário líquido para aplicar o plano."; sem plano → 400 `plan` "Aplique o plano 70-20-10 para vincular o número da liberdade.".

`PUT /api/settings` aceita também `freedom_multiplier` (1–600) e `freedom_goal_auto` (bool). Mudanças de salário, meses ou multiplicador ressincronizam a reserva e o número da liberdade vinculados (o teto de gastos não é recalculado; reaplique o plano para isso). `PUT /api/goals/{id}` da meta da liberdade vinculada, com plano e cálculo automático, mudando `target_cents` → 400 `target_cents` "Esta meta acompanha o salário. Confirme para desligar o cálculo automático."; com `detach_auto: true` grava e desliga (`freedom_goal_auto = false`).

`GET /api/state` → `settings` ganha `plan_fixed_pct`, `plan_fun_pct`, `plan_invest_pct` (inteiros ou `null` = sem plano), `freedom_multiplier`, `freedom_target_cents` (salário × multiplicador, 0 sem salário), `freedom_goal_id`, `freedom_goal_auto`, `freedom_goal_status` ("linked" | "removed" | "none"). `categories[]` trazem `bucket`.

### Resumo do mês

`GET /api/summary` ganha:
- `plan`: `null` sem plano, ou `{ fixed_pct, fun_pct, invest_pct, fixed_limit_cents, fun_limit_cents, invest_min_cents, fixed_spent_cents, fun_spent_cents, invested_cents, unbucketed_expense_cents, out_of_plan_expense_cents }` em BRL. Limites = round(salário atual × percentual / 100). Realizado pelo balde da categoria do lançamento (ativa ou removida): despesas em `fixo` e `lazer`; `invested_cents` = lançamentos do tipo investimento + despesas em categorias do balde `investimento`; despesas em `fora` vão para `out_of_plan_expense_cents`; sem categoria ou sem balde, `unbucketed_expense_cents`.
- `payment_methods: [{ method, total_cents, count }]`: despesas do mês por forma de pagamento (BRL), valor desc e forma asc — mesmas regras de `/api/reports`.
- `categories[]` (e `income_categories`/`investment_categories`) trazem `bucket`.
O resumo congelado no fechamento inclui os campos novos.

`GET /api/reports` → cada item de `months` ganha `fixed_spent_cents`, `fun_spent_cents`, `invested_cents`, `unbucketed_expense_cents`, `out_of_plan_expense_cents` (mesmas regras do resumo; calculados mesmo sem plano) e a resposta ganha `missing_rate_currencies`.

`GET /api/projections/base` ganha `plan` (`{ fixed_pct, fun_pct, invest_pct, freedom_multiplier }` ou `null`), `freedom_target_cents` e `missing_rate_currencies`.

### Compra no cartão exige cartão (CR-06)

Na criação e na edição de lançamentos, o registro resultante com `payment_method = "card"` (enviado, mantido do registro atual ou o padrão da criação) precisa de `card_id` (enviado ou atual) → senão 400 `card_id` "Escolha o cartão da compra.". Lançamentos antigos no cartão sem cartão continuam listados e somados normalmente; editá-los exige escolher o cartão ou outra forma de pagamento. Remover/desfazer e os fluxos (checklist, cobrança de assinatura, débito automático) não mudaram.

### Data de referência dos indicadores (CR-23)

`reference_date` em `/api/market` nunca é futura: a série 432 do SGS (meta Selic) publica a meta vigente com datas até a próxima reunião do Copom; datas posteriores a hoje (fuso local) são gravadas e devolvidas como hoje. Valores já salvos com data futura também são devolvidos como hoje.

### Moedas sem cotação e restauração (MEL-46)

- `missing_rate_currencies: string[]` (ordem do catálogo) em `GET /api/state` (contas, investimentos, metas, contas a pagar e assinaturas ativas), `GET /api/reports` (contas e investimentos ativos) e `GET /api/projections/base` (todos os anteriores): moedas estrangeiras sem cotação salva. Esses valores ficam fora dos totais em BRL (patrimônio, fotografias, exposição cambial com `base_cents` 0) e a lista permite avisar "sem cotação" em vez de somar 0 em silêncio.
- `POST /api/backup/restore` mantém as cotações e os indicadores atuais quando o documento não traz `exchange_rates`/`market_indicators` (backups anteriores à v1.2); tabelas presentes, mesmo vazias, continuam substituindo o conteúdo.
- `POST /api/goals/{id}/restore` da meta vinculada à reserva ou ao número da liberdade (cálculo automático ligado) já ressincroniza o alvo pelo salário atual.

### Rodada R1 (correções)

Migração `009_bill_active_since` (aditiva): coluna `bills.active_since`.

**Conta a pagar só existe a partir do mês de cadastro (R1-BILLS-1).**
- `bills` ganha `active_since` (`AAAA-MM-DD` ou `null`) em `GET /api/state`, `GET /api/bills` e em cada item de `GET /api/checklist`. `POST /api/bills` aceita `active_since` opcional (data; omitido → hoje local); `PUT /api/bills/{id}` pode alterá-lo (`null` = sem restrição). Contas anteriores à 009 ficam com `null` (comportamento antigo).
- `GET /api/checklist?month=M` e o bloco `bills` de `GET /api/summary?month=M` — e, portanto, o resumo congelado por `POST /api/months/M/close` — só consideram contas com `active_since` nulo ou cujo mês (`AAAA-MM`) é ≤ M. Uma conta cadastrada em 18/09 não aparece (nem como vencida) em agosto.
- `POST /api/checklist` com `paid: true` num mês anterior ao de `active_since` → 400 `month` "Esta conta ainda não existia neste mês." (`paid: false` continua idempotente). O débito automático usa o mesmo checklist.

**Faturas de cartão a pagar (R1-BILLS-2).** `GET /api/card-invoices?month=AAAA-MM` (padrão: mês local atual; inválido → 400 `month`) → `[{ card_id, card_name, brand, network, color, month, period_start, period_end, closing_date, due_date, total_cents, items_count, status, paid }]` (mesmo formato de `/api/cards/{id}/invoices` mais os dados do cartão), só de cartões ativos, em ordem de vencimento e nome do cartão:
- as faturas que vencem em M (`month = M`) com `total_cents > 0` ou já pagas;
- com M ≥ mês atual, também todas as faturas anteriores (`month < M`) sem pagamento, com `total_cents > 0` e já fechadas (`fechada` ou `vencida`). Meses passados listam só as que vencem neles.
Pague com `POST /api/cards/{card_id}/invoices/{month}/pay`.

**Janela padrão das faturas (R1-CARD-1).** `GET /api/cards/{id}/invoices` sem `from`/`to` passa a trazer, antes da fatura anterior, a aberta e a seguinte, todas as faturas mais antigas sem pagamento com `total_cents > 0` (ordem crescente de mês). Com `from`/`to` nada mudou.

**Progresso do número da liberdade (decisão 3 do R1).**
- `GET /api/state` → `settings.freedom_progress_cents`: patrimônio investido = soma de `current_cents` dos investimentos ativos em BRL pela última cotação (moedas sem cotação ficam fora, como no patrimônio; igual a `starting.investments_cents` das projeções).
- A meta vinculada ao número da liberdade (`freedom_goal_status = "linked"`) é devolvida com `current_cents = freedom_progress_cents` em `GET /api/state` (`goals[]`), `GET /api/goals` e `GET /api/projections/base` (`goals[].current_cents` e `base_current_cents`), com ou sem plano e cálculo automático. `GET /api/projections/base` ganha `freedom_progress_cents`.
- Movimentações manuais na meta (`POST /api/goals/{id}/entries`) continuam aceitas e gravadas, mas não mudam o valor exibido enquanto ela estiver vinculada (a interface mostra "Patrimônio investido" e não oferece aporte). O valor gravado em `goals.current_cents` e no backup não é alterado.
