# Arquitetura

## Visão geral

O Finance Control usa arquitetura hexagonal para manter regras financeiras independentes de HTTP, React e SQLite.

```text
                       portas de entrada
                 ┌────────────────────────┐
                 │ ASP.NET API | React UI │
                 └───────────┬────────────┘
                             │
                    ┌────────▼────────┐
                    │   Application   │
                    │ casos de uso e  │
                    │     portas      │
                    └────────┬────────┘
                             │
                       ┌─────▼─────┐
                       │  Domain   │
                       └─────▲─────┘
                             │
                 ┌───────────┴───────────┐
                 │ Infrastructure/SQLite │
                 │  adaptador de saída   │
                 └───────────────────────┘
```

## Projetos e responsabilidades

### FinanceControl.Domain

Contém entidades, modelos de leitura e regras financeiras puras, sem I/O e sem dependências externas:

- `Rules/FinanceEnums`: valores aceitos por campo enumerado (tipos de lançamento, meios de pagamento, tipos de conta, metas, investimentos, frequências e movimentações).
- `Rules/BalanceRules`: efeito de um lançamento no saldo da conta (`TransactionRules`), movimentações e estornos de investimentos (`InvestmentRules`, `InvestmentPosition`), movimentações e estornos bancários (`BankRules`) e aportes em metas (`GoalRules`).
- `Rules/CardInvoiceRules`: ciclo, status e limite disponível das faturas de cartão.
- `Rules/Currencies` (v1.2): catálogo único de moedas (código, nome, símbolo, casas decimais, fiat/cripto) e `CurrencyRules` (conversão para BRL com `decimal` e arredondamento do meio para longe do zero, leitura/formatação de cotações).
- `Rules/AutoDebitRules` (v1.2): datas de cobrança de assinaturas (mensal/anual/semanal), vencimento de contas no mês e valor mensal equivalente; `ReserveRules`: reserva de emergência = salário × meses.
- `Rules/UiPreferenceRules` (v1.2): valores aceitos e padrões das preferências de interface.
- `Rules/PlanRules` (v1.3): plano 70-20-10 — baldes de categoria (`fixo`, `lazer`, `investimento`, `fora`), divisão do salário por percentual, número da liberdade (salário × multiplicador), nomes aceitos para religar a meta e categorias-balde padrão.

As regras são cobertas por testes unitários.

### FinanceControl.Application

Contém contratos de comandos, resultados, casos de uso e as portas `IFinanceUseCases`, `IFinanceStore` e `IMarketDataSource` (cotações e indicadores públicos). É a camada responsável por validações e coordenação das operações:

- `Validation/ModuleSchemas`: fonte única dos campos aceitos por módulo e por comando (obrigatoriedade, tipo, limites, enums e referências).
- `Validation/InputValidator`: normaliza a entrada (textos aparados, booleanos 0/1) e produz erros por campo em português; a existência das referências é conferida pela porta `IFinanceStore.FindMissingReferences`.
- `UseCases/FinanceService`: valida antes de chamar a porta, aplica padrões (data de pagamento, descrições, assistente inicial) e usa `TimeProvider` injetado para "hoje" e "mês atual" no fuso local.
- `UseCases/BackupRestoreValidator`: valida a estrutura de um backup antes de qualquer alteração.
- v1.2, em parciais de `FinanceService`: `Currency` (moeda herdada da conta, cotação e valor em BRL dos lançamentos, débito automático no cadastro, trava da meta da reserva), `Market` (cache de cotações/indicadores, cotação manual, "desatualizado" após 24 h), `AutoDebit` (execução idempotente), `Reports` (relatórios, CSV pt-BR, base das projeções, fotografia mensal do patrimônio, gráficos do resumo) e `Settings` (preferências de interface).
- Contas de usuário: porta `IAccountStore`, caso de uso `IAccountUseCases`/`AccountService` (cadastro livre com validação do nome e da senha, autenticação sem revelar se o usuário existe, validade da sessão pelo carimbo de segurança) e `Security/PasswordHasher` (PBKDF2-SHA256, 600.000 iterações, comparação em tempo constante). Os casos de uso financeiros não conhecem usuários: o isolamento acontece na escolha do banco.
- v1.3, parcial `Plan` de `FinanceService`: aplicar/remover o plano 70-20-10 (`POST`/`DELETE /api/plan`), número da liberdade, realizado do mês por balde e por forma de pagamento no resumo e moedas sem cotação (`missing_rate_currencies`). A exigência de cartão para a forma "cartão" (CR-06) fica junto das regras de compra no cartão (`Platform`) e a data de referência nunca futura dos indicadores (CR-23) em `Market`.

### FinanceControl.Infrastructure

Implementa `IFinanceStore` usando Dapper e `Microsoft.Data.Sqlite`: mapeamento módulo → tabela (os campos graváveis vêm do esquema da aplicação), verificação de chaves estrangeiras e persistência atômica. Operações que mexem em mais de um saldo (lançamento vinculado, pagamento de conta, transferência, estorno, restauração) rodam em uma única transação SQL e usam as regras do domínio para calcular os deltas. As metas vinculadas ao salário (reserva de emergência e número da liberdade) são sincronizadas na mesma transação que grava configurações, setup, plano ou a restauração da meta (`SqliteFinanceStore.V12`/`.Plan`). Também abre conexões (WAL, chaves estrangeiras, `busy_timeout`, pool) a partir de `DatabaseOptions` e executa migrações versionadas (`DatabaseMigrator`, com a pasta `Migrations` para o banco financeiro e `AccountMigrations` para o de contas).

**Um banco por usuário.** `UserDatabases` (singleton) resolve a pasta de dados (`DataOptions.Directory`), abre `accounts.db` e cria/migra `users/<id>/finance.db` na primeira abertura de cada usuário (uma vez por processo; falhas não ficam em cache). `UserDatabaseScope` (por requisição) guarda o usuário e o banco dele; o `SqliteConnectionFactory` injetado em `SqliteFinanceStore` vem desse escopo, então o mesmo código de consulta atende qualquer usuário sem filtro por dono. `SqliteAccountStore` implementa `IAccountStore` sobre `accounts.db` (`INSERT … ON CONFLICT DO NOTHING RETURNING id` para nomes únicos sem diferenciar maiúsculas; `AUTOINCREMENT` impede reutilizar ids e, com eles, bancos de outro usuário).

`Market/PublicMarketDataSource` implementa `IMarketDataSource` como cliente HTTP tipado (IHttpClientFactory, timeout de 8 s): AwesomeAPI em dois lotes (moedas e cripto; se o lote falhar, par a par), CoinGecko para a cripto que faltar e Banco Central SGS para Selic, CDI e IPCA. Nenhum dado do usuário é enviado; falhas de rede viram erros no resultado, nunca exceções.

### FinanceControl.Api

É o adaptador HTTP. Faz binding de JSON (convertendo o corpo em valores neutros para a aplicação), converte resultados dos casos de uso em Problem Details em português e compõe as dependências. Não contém SQL nem regras de negócio.

Na composição, `DATA_DIRECTORY` (variável de ambiente) sobrescreve `Database:Directory` e o resultado vai para `DataOptions.Directory`; caminhos relativos resolvem a partir do diretório atual do processo. Ao iniciar, migra `accounts.db` e o banco de cada usuário já cadastrado. `AllowedHosts` aceita por padrão apenas `localhost`, `127.0.0.1` e `[::1]` (DNS rebinding); o servidor local amplia a lista com o nome e os IPs da máquina. Rotas `/api/*` desconhecidas respondem 404 JSON (401 sem sessão).

Pipeline (`Adapters/Http/Security.cs`), nesta ordem:

1. `UseSecurityHeaders`: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`, `Cache-Control: no-store` em `/api`, e recusa (403) de métodos que alteram dados sem `X-Requested-With: FinanceControl` (anti-CSRF).
2. Arquivos estáticos da interface (públicos: a tela de login precisa carregar).
3. `UseFinanceAuthentication`: roteamento, limite de tentativas (`auth`: 10 por minuto por IP em login e cadastro, 429 com `Retry-After`), autenticação por cookie (`fc_session`: HttpOnly, `SameSite=Strict`, 30 dias com renovação; relógio real, não o `TimeProvider` de negócio; o carimbo de segurança é conferido a cada requisição), entrada no `UserDatabaseScope` do usuário e autorização com política padrão "usuário autenticado" (401/403 em ProblemDetails, nunca redirecionamento).

As chaves do Data Protection que cifram o cookie ficam em `<dados>/keys` (DPAPI no Windows), então as sessões sobrevivem a reinícios. `AuthEndpoints` expõe `/api/auth/register` (cria a conta, o banco vazio do usuário e a sessão), `/login`, `/logout` e `/me`.

Dois serviços em segundo plano (`Adapters/Background`) chamam os casos de uso **para cada usuário**, cada um em um escopo com o banco dele (`PerUser.RunAsync`; a falha de um usuário não impede os demais): `MarketRefreshHostedService` (ao iniciar e a cada `Market:RefreshHours`, padrão 6, se `settings.market_auto_refresh` estiver ligado) e `AutoDebitHostedService` (ao iniciar e a cada hora); falhas só vão para o log. Os testes removem os dois serviços e trocam o handler HTTP por um falso; `FinanceApiFactory` cadastra um usuário padrão e devolve clientes já autenticados. Ao encerrar, o WAL de todos os bancos abertos é consolidado nos arquivos `.db`.

### FinanceControl.Web

É o adaptador visual React. Está organizado em `api`, `components`, `features`, `hooks` e `lib`. Durante o desenvolvimento, o Vite usa proxy para a API; no build, os ativos podem ser servidos pelo ASP.NET Core.

- **Sessão:** `features/auth/AuthGate` envolve o `App` em `main.tsx`: consulta `/api/auth/me`, mostra `LoginPage` (entrar ou criar conta, com as regras espelhadas em `authModel.ts`) sem sessão e expõe o usuário e o `logout` por `SessionContext` (seção **Conta** das Configurações). Qualquer 401 depois do login (`api/session.ts`) e o "Sair" recarregam a página, para que nada do usuário anterior fique em memória.
- **API:** `api/client.ts` (CRUD dos módulos, movimentações paginadas, faturas, fechamentos, backup; `ApiError` com erros por campo em português; `json()` envia o cabeçalho anti-CSRF em toda alteração), `api/auth.ts` (conta e sessão) e `api/insights.ts` (relatórios, projeções, cotações e indicadores). Todo endpoint `/api/*` tem consumidor no cliente, exceto `GET /api/health` (verificação de saúde).
- **Bibliotecas puras (`lib`):** `money.ts` é a única porta de entrada de valores digitados (`parseMoney` → unidades mínimas ou `null`) e formata cada moeda; `date.ts` usa sempre horário local (datas ISO, competências, `daysBetween`/`monthsBetween`); `labels.ts` traduz os códigos de enum e concentra os rótulos com plural (`countLabel`, `daysLabel`, `monthsLabel`); `currencies.ts`, `brands.ts`, `icons.ts`, `projection.ts` e `preferences.ts` completam os catálogos e cálculos compartilhados. Regras específicas de uma tela ficam em módulos `*Model.ts` da própria feature, cobertos por testes.
- **Biblioteca de componentes (`components/ui/<Componente>/`):** cada pasta exporta o componente pelo seu `index.ts` e é importada pelo caminho da pasta (`components/ui/Select`), sem barril geral; `components/ui/shared/` tem utilitários comuns (cores, datas do seletor, listbox, camadas modais). `components/ui.tsx` reúne as primitivas legadas de página (`Field`, `MoneyInput`, `Money`, `PageHeader`, `StatStrip`, `RowActions`, `MonthSwitcher`, `EmptyState`). A galeria `#/componentes` (`features/gallery`) só existe em desenvolvimento (`import.meta.env.DEV`) e nunca entra no build de produção.
- **Gráficos (`components/charts`):** `AreaChart`, `BarChart`, `DonutChart` e `Sparkline` em SVG próprio (sem biblioteca externa), todos sobre `ChartFrame` (figura com foco por teclado, tooltip, tabela acessível e resumo para leitores de tela); cálculos de escala em `chartMath.ts`, cor por série via `--series` inline e respeito ao modo de valores ocultos.
- **Rotas e carregamento:** rota por hash (`useHashRoute`, endereços em `components/navigation.ts`); cada página é carregada sob demanda com `React.lazy` (páginas do mesmo arquivo compartilham o chunk) enquanto a transição da marca (`BrandIntro`) cobre o carregamento.
- **Estado da aplicação:** `App.tsx` concentra mês selecionado, modais de registro, confirmação (`useConfirm`), remoção com **Desfazer**, reatribuição de vínculos e o fluxo do checklist; páginas recebem `PageProps` e buscam dados próprios (`useMonthTransactions`, `useStatement`, `usePagedList`) atrelados a `version`.
- **Formulários:** cada tipo é uma definição em `features/<feature>/forms.tsx` (validação, payload, edição a partir do registro, mensagem de sucesso), registrada em `features/records/registry.ts` e renderizada por `RecordModal`; os campos ficam em `formFields.tsx` sobre os componentes de `features/records/fields.tsx`.
- **Feedback:** resultados de ações usam toasts (`components/Toast.tsx`, `useToast`), com ação **Desfazer** quando aplicável; confirmações usam `ConfirmDialog`. O único banner restante é o `.error-banner` de falha de carregamento em Lançamentos.
- **Preferências de interface:** aparência, densidade, animações, valores ocultos e widgets do painel são salvos na API (`ui_preferences` em `/api/settings`), mantidos em um store de módulo (`lib/preferencesStore.ts`, lido por `hooks/usePreferences.ts`) e espelhados no `localStorage` para que `main.tsx` aplique tema e densidade antes da primeira renderização.
- **Estilos:** `src/styles.css` declara as camadas `@layer theme, base, app, components, adapt` e importa `styles/tokens.css` e `themes.css` (tema), `base.css` e `motion.css` (base), os arquivos de aplicação (`shell`, `components`, `forms`, `tables`, `feedback`, `dataviz`, `finance`, `features`, `appearance`, `pages-a`, `pages-b`), a biblioteca de componentes (`styles/ui.css` → `styles/ui/*.css`, camada `components`) e `touch.css` (alvos de toque e alto contraste, camada `adapt`). Tokens documentados em `DESIGN.md`; regras novas sempre dentro de uma camada.

## Fluxo de uma operação

```text
React → endpoint HTTP → IFinanceUseCases → IFinanceStore (porta) → SQLite (adaptador)
```

As dependências de código apontam para o núcleo. A infraestrutura conhece a porta que implementa; a aplicação não conhece SQLite.

## Invariantes de dados (v1.4)

- **A data do lançamento é a data do fato.** A competência (`transactions.date`), a fatura (derivada do ciclo do
  cartão) e o caixa (saída bancária) são eixos distintos e nenhum deles desloca a data da compra. A exceção é a
  parcela, que é um fato do próprio mês. Ver `docs/FLUXOS.md` §1.1 e §4.
- **O saldo da conta reflete o que já aconteceu.** `bank_accounts.current_balance_cents` só considera lançamentos com
  data até hoje; os futuros ficam pendentes (`transactions.balance_applied = 0`) e são aplicados no dia pela rotina de
  débito automático. O invariante vive no adaptador SQLite, que é quem possui o saldo.
- **Uma compra parcelada é uma operação só.** As N parcelas são gravadas em uma única transação de banco e
  compartilham `installment_group`; qualquer mês fechado na série recusa a compra inteira.
- **Importação é determinística e sem estado.** A conferência não grava nada; a confirmação relê o mesmo arquivo. A
  marca de origem (`transactions.import_fingerprint`) é o que impede importar a mesma linha duas vezes.
- **Previsão não é lançamento.** As cobranças de assinatura esperadas em uma fatura aberta ficam em um total à parte
  (`projected_cents`), fora de resumos, relatórios e orçamentos.

### Onde cada regra mora

| Assunto | Arquivo |
|---|---|
| Ciclo e situação de fatura | `Domain/Rules/CardInvoiceRules.cs` |
| Parcelamento (datas e rateio) | `Domain/Rules/InstallmentRules.cs` |
| Leitura de fatura/extrato (valores, datas, parcela, portador) | `Domain/Rules/StatementRules.cs` |
| Formatos de arquivo (CSV, OFX, QIF) | `Application/Import/StatementReader.cs` |
| Casos de uso da importação | `Application/UseCases/FinanceService.Imports.cs` |
| Série de parcelas | `Application/UseCases/FinanceService.Installments.cs` |
| Previsão nas faturas abertas | `Application/UseCases/FinanceService.InvoiceForecast.cs` |
| Saldo por data | `Infrastructure/Persistence/SqliteFinanceStore.cs` |
| Ajuda das telas | `Web/src/features/help/pageHelp.ts` |

## Decisões de dados

- SQLite é a fonte de verdade local, com um arquivo por usuário (`users/<id>/finance.db`) e um banco de contas (`accounts.db`, só nome e hash da senha). O isolamento entre usuários é físico: nenhuma consulta precisa filtrar por dono, e backup, restauração e cópias automáticas (`users/<id>/backups/`) são naturalmente por usuário.
- Dinheiro usa `INTEGER` em unidades mínimas da moeda do registro (`long` no .NET): centavos para BRL/USD/EUR…, 0 casas para JPY e 8 casas para BTC/ETH/SOL. Os nomes `*_cents` foram mantidos por compatibilidade. Lançamentos guardam também `base_amount_cents` (BRL na data) e `exchange_rate`; resumos, relatórios, orçamentos e faturas somam o valor em BRL. Saldos de contas, investimentos e metas são convertidos pela última cotação quando agregados (patrimônio).
- Datas usam ISO `YYYY-MM-DD` e competências `YYYY-MM`.
- Transferências, aportes, movimentações e lançamentos vinculados a contas usam transações SQL.
- Movimentações guardam o delta aplicado para permitir estorno exato; transferências ligam as duas pontas.
- Exclusões são lógicas para preservar histórico financeiro e podem ser desfeitas (`restore`).
- O schema legado é mantido e evoluído somente por migrações incrementais.
