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
- v1.3, parcial `Plan` de `FinanceService`: aplicar/remover o plano 70-20-10 (`POST`/`DELETE /api/plan`), número da liberdade, realizado do mês por balde e por forma de pagamento no resumo e moedas sem cotação (`missing_rate_currencies`). A exigência de cartão para a forma "cartão" (CR-06) fica junto das regras de compra no cartão (`Platform`) e a data de referência nunca futura dos indicadores (CR-23) em `Market`.

### FinanceControl.Infrastructure

Implementa `IFinanceStore` usando Dapper e `Microsoft.Data.Sqlite`: mapeamento módulo → tabela (os campos graváveis vêm do esquema da aplicação), verificação de chaves estrangeiras e persistência atômica. Operações que mexem em mais de um saldo (lançamento vinculado, pagamento de conta, transferência, estorno, restauração) rodam em uma única transação SQL e usam as regras do domínio para calcular os deltas. As metas vinculadas ao salário (reserva de emergência e número da liberdade) são sincronizadas na mesma transação que grava configurações, setup, plano ou a restauração da meta (`SqliteFinanceStore.V12`/`.Plan`). Também abre conexões (WAL, chaves estrangeiras, `busy_timeout`, pool) a partir de `DatabaseOptions` e executa migrações versionadas.

`Market/PublicMarketDataSource` implementa `IMarketDataSource` como cliente HTTP tipado (IHttpClientFactory, timeout de 8 s): AwesomeAPI em dois lotes (moedas e cripto; se o lote falhar, par a par), CoinGecko para a cripto que faltar e Banco Central SGS para Selic, CDI e IPCA. Nenhum dado do usuário é enviado; falhas de rede viram erros no resultado, nunca exceções.

### FinanceControl.Api

É o adaptador HTTP. Faz binding de JSON (convertendo o corpo em valores neutros para a aplicação), converte resultados dos casos de uso em Problem Details em português e compõe as dependências. Não contém SQL nem regras de negócio.

Na composição, `DATABASE_PATH` (variável de ambiente) sobrescreve `Database:Path` e o resultado vai para `DatabaseOptions.Path`; caminhos relativos resolvem a partir do diretório atual do processo. `AllowedHosts` aceita apenas `localhost`, `127.0.0.1` e `[::1]` (proteção contra DNS rebinding de uma API local sem autenticação). Rotas `/api/*` desconhecidas respondem 404 JSON. Dois serviços em segundo plano (`Adapters/Background`) chamam os casos de uso: `MarketRefreshHostedService` (ao iniciar e a cada `Market:RefreshHours`, padrão 6, se `settings.market_auto_refresh` estiver ligado) e `AutoDebitHostedService` (ao iniciar e a cada hora); falhas só vão para o log. Os testes removem os dois serviços e trocam o handler HTTP por um falso. Ao encerrar, o pool de conexões do banco é liberado para que o WAL seja consolidado no arquivo `.db`.

### FinanceControl.Web

É o adaptador visual React. Está organizado em `api`, `components`, `features`, `hooks` e `lib`. Durante o desenvolvimento, o Vite usa proxy para a API; no build, os ativos podem ser servidos pelo ASP.NET Core.

- **API:** `api/client.ts` (CRUD dos módulos, movimentações paginadas, faturas, fechamentos, backup; `ApiError` com erros por campo em português) e `api/insights.ts` (relatórios, projeções, cotações e indicadores). Todo endpoint `/api/*` tem consumidor no cliente, exceto `GET /api/health` (verificação de saúde).
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

## Decisões de dados

- SQLite é a fonte de verdade local.
- Dinheiro usa `INTEGER` em unidades mínimas da moeda do registro (`long` no .NET): centavos para BRL/USD/EUR…, 0 casas para JPY e 8 casas para BTC/ETH/SOL. Os nomes `*_cents` foram mantidos por compatibilidade. Lançamentos guardam também `base_amount_cents` (BRL na data) e `exchange_rate`; resumos, relatórios, orçamentos e faturas somam o valor em BRL. Saldos de contas, investimentos e metas são convertidos pela última cotação quando agregados (patrimônio).
- Datas usam ISO `YYYY-MM-DD` e competências `YYYY-MM`.
- Transferências, aportes, movimentações e lançamentos vinculados a contas usam transações SQL.
- Movimentações guardam o delta aplicado para permitir estorno exato; transferências ligam as duas pontas.
- Exclusões são lógicas para preservar histórico financeiro e podem ser desfeitas (`restore`).
- O schema legado é mantido e evoluído somente por migrações incrementais.
