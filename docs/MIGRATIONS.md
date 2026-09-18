# Migrações SQLite

São dois conjuntos independentes, incorporados no assembly, cada um com o próprio `schema_migrations`:

| Pasta (`src/FinanceControl.Infrastructure/Persistence/…`) | Banco | Aplicada |
|---|---|---|
| `Migrations` | financeiro de cada usuário (`users/<id>/finance.db`) | no cadastro do usuário e, para os já cadastrados, a cada inicialização |
| `AccountMigrations` | contas (`accounts.db`) | a cada inicialização |

## Convenção

Use nomes crescentes e imutáveis, como `003_descricao_curta.sql`, numerados dentro de cada pasta.

`DatabaseMigrator` ativa WAL, cria `schema_migrations`, identifica os scripts pendentes da pasta, executa cada script em uma transação e registra a versão aplicada.

Nunca altere um script já distribuído. Crie uma nova migração e preserve os dados existentes. Antes de mudanças de schema, valide tanto um banco vazio quanto uma cópia de um banco legado.

A migração `003_remove_placeholder_data.sql` remove apenas categorias-padrão exatas que não estejam referenciadas por lançamentos, contas ou assinaturas. Categorias utilizadas ou personalizadas são preservadas.

## 004_links_and_movement_history

Somente alterações aditivas (colunas com padrão `NULL` e índices `IF NOT EXISTS`); nenhum dado existente é modificado.

| Tabela | Coluna | Uso |
|---|---|---|
| `transactions` | `account_id` → `bank_accounts` (`ON DELETE SET NULL`) | lançamento que movimenta o saldo de uma conta |
| `bill_payments` | `transaction_id` → `transactions` (`ON DELETE SET NULL`) | despesa criada ao pagar a conta no checklist |
| `goal_entries` | `deleted_at` | estorno de aporte |
| `investment_entries` | `deleted_at`, `invested_delta_cents`, `current_delta_cents` | estorno exato de movimentações |
| `bank_entries` | `deleted_at`, `delta_cents`, `transfer_entry_id` → `bank_entries` | estorno exato; liga os dois lados de uma transferência |

Índices: `transactions(account_id)`, `bill_payments(month)`, `goal_entries(goal_id)`, `investment_entries(investment_id)`, `bank_entries(account_id)`.

Linhas criadas antes da 004 ficam com deltas nulos. Entradas, saídas e rendimentos têm o delta derivado do tipo e continuam estornáveis; ajustes e transferências antigas não são estornáveis (a API responde 400 explicando o motivo).

Validação feita: banco vazio (testes automatizados) e cópia do banco real — contagens de todas as tabelas de dados idênticas antes e depois, com `schema_migrations` passando de 3 para 4 linhas.

## 005_usability

Somente alterações aditivas; nenhuma linha existente é modificada.

| Objeto | Alteração | Uso |
|---|---|---|
| `goal_entries.kind` | `TEXT NOT NULL DEFAULT 'contribution'`, `CHECK (kind IN ('contribution','withdrawal'))` | aporte ou resgate em metas; linhas antigas passam a valer como aporte |
| `subscription_charges` | nova tabela `(id, subscription_id → subscriptions ON DELETE CASCADE, charge_date, transaction_id → transactions ON DELETE SET NULL, created_at, UNIQUE(subscription_id, charge_date))` | cobranças lançadas de assinaturas e o lançamento criado |

Índice: `subscription_charges(transaction_id)`. Assinaturas anuais/semanais existentes sem `next_billing_date` não são migradas; a exigência da data vale apenas para gravações feitas pela API.

Validação feita: banco vazio e banco no estado da v1.1 (testes automatizados, incluindo aportes antigos lidos como `contribution`) e cópia do banco real (`finance.db` + `-wal`/`-shm`): contagens de todas as tabelas de dados idênticas antes e depois (`goal_entries` 2, `goals` 3, `subscriptions` 2, `transactions` 2, `bills` 1, `bill_payments` 2, `categories` 1), `subscription_charges` criada vazia, `schema_migrations` de 4 para 5 linhas, `integrity_check` ok e sem violações de chave estrangeira.

## 006_closings_and_card_invoices

Somente alterações aditivas; nenhuma linha existente é modificada.

| Objeto | Alteração | Uso |
|---|---|---|
| `transactions.card_id` | `INTEGER REFERENCES cards(id) ON DELETE SET NULL` (nulo) | compra no cartão de crédito; entra na fatura do ciclo da data |
| `monthly_closings.summary_json` | `TEXT` (nulo) | resumo de `/api/summary` congelado no fechamento do mês |
| `card_invoice_payments` | nova tabela `(id, card_id → cards ON DELETE CASCADE, month, amount_cents, paid_at, date, account_id → bank_accounts ON DELETE SET NULL, bank_entry_id → bank_entries ON DELETE SET NULL, created_at, UNIQUE(card_id, month))` | pagamento de fatura (identificada pelo mês de vencimento) e a saída criada na conta |

Índice: `transactions(card_id, date)`. Lançamentos existentes ficam sem cartão (`card_id` nulo) e continuam fora das faturas; fechamentos antigos (se houver) ficam sem resumo guardado (`summary: null`). O backup JSON passa a incluir `card_invoice_payments`; backups anteriores sem a tabela continuam aceitos e a deixam vazia.

Validação feita: banco vazio e banco no estado da v1.2 (testes automatizados: colunas nulas sem padrão, chave estrangeira `SET NULL`, unicidade de `card_id`+`month`, linhas e fechamentos antigos preservados) e cópia do banco real (`finance.db` + `-wal`/`-shm`): contagens de todas as tabelas de dados idênticas antes e depois (`transactions` 3, `goals` 3, `goal_entries` 2, `subscriptions` 2, `bill_payments` 2, `bills` 1, `categories` 1, `settings` 1, demais 0), `card_invoice_payments` criada vazia, `schema_migrations` de 5 para 6 linhas, soma de `goals.current_cents` inalterada, `integrity_check` ok e sem violações de chave estrangeira.

## 007_v12

Aditiva: três tabelas e colunas novas com padrões que preservam o comportamento anterior. Dados existentes só são tocados para preencher as colunas novas.

| Objeto | Alteração | Uso |
|---|---|---|
| `exchange_rates` | nova `(currency PK, rate_brl TEXT, change_pct REAL, source, fetched_at, manual INTEGER DEFAULT 0)` | cotações (BRL por unidade); BRL nunca é gravado |
| `market_indicators` | nova `(code PK, value REAL, reference_date, source, fetched_at)` | Selic, CDI, IPCA 12 meses e do mês |
| `net_worth_snapshots` | nova `(month PK, bank_cents, investments_cents, total_cents, updated_at)` | patrimônio mensal em BRL |
| `settings` | `ui_preferences TEXT`, `market_auto_refresh INTEGER NOT NULL DEFAULT 1`, `market_last_refresh_at TEXT`, `market_last_error TEXT`, `emergency_goal_id → goals (SET NULL)`, `emergency_goal_auto INTEGER NOT NULL DEFAULT 1` | preferências, mercado, reserva vinculada |
| `bank_accounts`, `investments` | `currency TEXT NOT NULL DEFAULT 'BRL'`, `brand`, `logo_data` | moeda e marca/logo |
| `cards` | `brand`, `network`, `color` | cartão visual |
| `categories` | `icon`, `color` | ícones (MEL-39) |
| `transactions` | `currency TEXT NOT NULL DEFAULT 'BRL'`, `base_amount_cents`, `exchange_rate`, `brand` | valor em BRL e cotação; **backfill**: `base_amount_cents = amount_cents`, `exchange_rate = '1'` |
| `bills`, `subscriptions` | `auto_debit INTEGER NOT NULL DEFAULT 0`, `auto_debit_since`, `account_id → bank_accounts (SET NULL)`, `currency TEXT NOT NULL DEFAULT 'BRL'`, `icon`, `brand` | débito automático |
| `bill_payments` | `auto_debit_skipped INTEGER NOT NULL DEFAULT 0` | pagamento desmarcado no mês |
| `bank_entries` | `invoice_card_id → cards (SET NULL)`, `invoice_month` | saída que pagou uma fatura; **backfill** a partir de `card_invoice_payments.bank_entry_id` |

Índices: `bills(auto_debit, active)`, `subscriptions(auto_debit, active)`, `bank_entries(invoice_card_id, invoice_month)`.

Reserva de emergência: com salário > 0, a migração vincula (`settings.emergency_goal_id`) a única meta ativa do tipo `emergency`; sem nenhuma desse tipo, a única meta ativa cujo nome começa com "Reserva de emerg" (bancos anteriores ao tipo). Em qualquer outro caso (nenhuma, várias ou salário zero) nada é vinculado; o próximo salvamento das configurações escolhe ou cria a meta. Metas não são alteradas pela migração.

`*_cents` passa a significar unidades mínimas da moeda do registro (10^casas; BTC com 8); os nomes foram mantidos por compatibilidade. Linhas existentes ficam em BRL.

Validação feita: banco vazio e banco no estado da 006 (testes automatizados: colunas, padrões, chaves estrangeiras, backfill de lançamentos e de pagamentos de fatura, regras de vínculo da reserva) e cópia do banco real (`finance.db` + `-wal`/`-shm`, nunca o original): contagens de todas as tabelas de dados idênticas antes e depois (`transactions` 3, `goals` 3, `goal_entries` 2, `subscriptions` 2, `bill_payments` 2, `bills` 1, `categories` 1, `settings` 1, demais 0), `exchange_rates`/`market_indicators`/`net_worth_snapshots` criadas vazias, `schema_migrations` de 6 para 7 linhas, soma de `goals.current_cents` inalterada (6 101 200), lançamentos com `base_amount_cents = amount_cents` e cotação "1", a meta ativa "Reserva de Emergência" (tipo `custom`) vinculada pela regra do nome, `integrity_check` ok e sem violações de chave estrangeira. A API também subiu nessa cópia pelo migrador real (`schema_version` 007_v12).

## 008_plan

Somente alterações aditivas; nenhuma linha existente é modificada.

| Objeto | Alteração | Uso |
|---|---|---|
| `settings` | `plan_fixed_pct`, `plan_fun_pct`, `plan_invest_pct` (`INTEGER`, nulos = sem plano) | plano 70-20-10 (MEL-45) |
| `settings` | `freedom_multiplier INTEGER NOT NULL DEFAULT 150` | número da liberdade = salário × multiplicador |
| `settings` | `freedom_goal_id → goals (SET NULL)`, `freedom_goal_auto INTEGER NOT NULL DEFAULT 1` | meta "Número da liberdade" vinculada e cálculo automático |
| `categories` | `bucket TEXT` (nulo) com `CHECK (bucket IS NULL OR bucket IN ('fixo','lazer','investimento','fora'))` | balde do plano |

Bancos existentes ficam sem plano, com multiplicador 150, sem meta da liberdade vinculada e com todas as categorias sem balde. A meta da liberdade só é criada ou religada por `POST /api/plan` (ou `POST /api/settings/freedom-goal`), nunca pela migração.

Validação feita: banco vazio e banco no estado da 007 (testes automatizados: colunas, tipos, padrões, chave estrangeira `SET NULL`, `CHECK` do balde, dados preservados, `integrity_check` e `foreign_key_check`) e cópias (nunca os originais), aplicadas pelo `DatabaseMigrator` real:
- `src/FinanceControl.Api/Data/finance.db` (recém-zerado): contagens de todas as tabelas idênticas antes e depois (`bank_accounts` 1, `exchange_rates` 12, `market_indicators` 4, `net_worth_snapshots` 1, `settings` 1, demais 0), `schema_migrations` de 7 para 8 linhas, colunas novas com os padrões, `integrity_check` ok e sem violações de chave estrangeira.
- `Data/backups/antes-do-reset-20260918-020109.db` (dados reais anteriores ao reset): contagens idênticas (`transactions` 3, `goals` 3, `goal_entries` 2, `subscriptions` 2, `bill_payments` 2, `bills` 1, `categories` 1, `exchange_rates` 12, `market_indicators` 4, `net_worth_snapshots` 1, `settings` 1), somas de `goals.current_cents` (6 101 200) e de `transactions.amount_cents`/`base_amount_cents` (489 800) inalteradas, `schema_migrations` de 7 para 8, `integrity_check` ok, sem violações. A API subiu nessa cópia (`schema_version` 008_plan) e `POST /api/plan` 70/20/10 com salário de R$ 11.000 vinculou a reserva existente (R$ 66.000), criou "Número da liberdade" (R$ 1.650.000), marcou "Lazer" e criou "Gastos fixos" e "Investimentos"; o lançamento antigo no cartão sem cartão continuou listado e a edição respondeu 400 `card_id`.

## 009_bill_active_since

Somente aditiva: `bills.active_since TEXT` (nula, sem padrão). Contas existentes ficam com `NULL` = sem restrição de mês (comportamento anterior); nenhuma linha é modificada. Contas novas recebem a data de hoje pela aplicação (R1-BILLS-1): checklist, resumo do mês e fechamento só consideram a conta a partir do mês de `active_since`.

Validação feita: banco vazio e banco no estado da 008 com uma conta (teste automatizado: coluna `TEXT` nula sem padrão, linha preservada com `active_since` nulo, `schema_migrations` = 009) e cópia de `Data/backups/antes-do-reset-20260918-020109.db` (nunca o original), migrada pelo `DatabaseMigrator` real ao subir a API: `schema_migrations` 7 → 9, a conta existente "Internet" continua com os mesmos valores e `active_since` nulo (aparece em agosto), `goals.current_cents` (soma 6 101 200) e lançamentos (3, soma 489 800) inalterados, `integrity_check` ok e sem violações de chave estrangeira; uma conta criada pela API recebeu `active_since` = hoje e ficou fora do resumo de agosto.

## Contas: AccountMigrations/001_users

Cria o banco de contas (`accounts.db`) com a tabela `users` (`username` único sem diferenciar maiúsculas, `password_hash` PBKDF2, `security_stamp` e `created_at`; `id` com `AUTOINCREMENT`, para que um id — e o banco `users/<id>/finance.db` associado — nunca seja reutilizado).

Não altera nenhum banco financeiro. O `finance.db` de versões sem login continua intacto na pasta de dados, mas sem dono: cada conta começa com um banco novo e vazio, migrado pelas mesmas migrações 001–009. Para usar os dados antigos, copie o arquivo para `users/<id>/finance.db` com o servidor parado ou restaure um backup JSON (passo a passo no README, seção "Contas de usuário e segurança").

Validação feita: testes automatizados de integração (cadastro cria `accounts.db` e `users/<id>/finance.db` já no `schema_version` 009, dois usuários com arquivos separados, hash no formato `pbkdf2-sha256$600000$…`, troca do `security_stamp` invalida a sessão) e subida real da API em pasta de dados vazia (cadastro, login, sessão e isolamento pela interface).
