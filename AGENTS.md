# LMM Finance Control — Instruções para agentes

## Produto

Gerenciador financeiro pessoal, local-first, com armazenamento SQLite. A interface é escura, moderna, modular e integralmente em português brasileiro.

## Stack obrigatória

- .NET 10 LTS e ASP.NET Core Minimal APIs.
- React 19 + TypeScript + Vite.
- SQLite via `Microsoft.Data.Sqlite` e Dapper.
- Testes de backend com xUnit e de frontend com Vitest.
- Sem dependência de nuvem para os dados financeiros principais.

## Arquitetura hexagonal

- `FinanceControl.Domain`: entidades e regras de domínio sem dependências externas.
- `FinanceControl.Application`: casos de uso, contratos e portas; depende apenas de `Domain`.
- `FinanceControl.Infrastructure`: adaptadores de saída, SQLite e migrações; implementa portas de `Application`.
- `FinanceControl.Api`: adaptador de entrada HTTP e composição de dependências; não contém SQL nem regras de negócio.
- `FinanceControl.Web`: adaptador de entrada React organizado por funcionalidades.
- Dependências sempre apontam para dentro: `Api/Web → Application → Domain`; `Infrastructure → Application/Domain`.
- Nunca referencie `Api` ou `Infrastructure` a partir de `Domain` ou `Application`.

## Configuração

- Existe somente `src/FinanceControl.Api/appsettings.json`; não crie variantes por ambiente nem arquivos `.example`.
- Todo arquivo de configuração versionado deve ser utilizado diretamente pela aplicação.
- Sobrescritas sensíveis ou específicas do ambiente usam variáveis de ambiente.
- `DATABASE_PATH` sobrescreve `Database:Path`.

## Dados e persistência

- O repositório é público: nunca versione o banco local (`src/FinanceControl.Api/Data/finance.db`), arquivos WAL, SHM, journal, `Data/backups/` nem dados pessoais. O banco é criado e migrado automaticamente na primeira execução.
- O caminho relativo do banco é resolvido a partir do diretório atual do processo; não altere essa resolução sem migrar os dados existentes.
- Valores monetários são inteiros de 64 bits em centavos.
- Datas de negócio usam texto ISO `YYYY-MM-DD`; competências usam `YYYY-MM`.
- Toda alteração de schema exige uma migração incremental em `Infrastructure/Persistence/Migrations`.
- Migrações aplicadas nunca devem ser editadas; crie uma nova migração.
- Preserve compatibilidade com bancos criados por versões anteriores.
- Registros financeiros não devem ser apagados fisicamente. Exclusões são lógicas e exigem confirmação na UI.
- Operações que alteram mais de um saldo ou agregado devem ser atômicas.

## API e frontend

- Novos módulos expõem CRUD em `/api/<module>`.
- Validação e mensagens de erro são em português brasileiro.
- Componentes React devem ser pequenos, tipados e organizados por funcionalidade.
- O setup inicial permanece opcional e pode ser reaberto em Configurações.
- Preserve tema escuro, contraste acessível, labels e navegação responsiva.
- Componentes reutilizáveis ficam em `src/FinanceControl.Web/src/components/ui/<Componente>/` e são importados pela pasta (não há barril `components/ui/index.ts`; `components/ui` resolve para as primitivas de `components/ui.tsx`). Gráficos ficam em `components/charts`.
- Helpers compartilhados moram em `src/lib` (dinheiro, datas, rótulos e plurais, moedas, marcas, ícones); regras de uma única tela ficam em `features/<feature>/*Model.ts`. Não duplique formatação de dinheiro, datas ou status entre páginas.
- Estilos: `src/styles.css` define as camadas `theme, base, app, components, adapt`; toda regra nova fica dentro de uma camada. A biblioteca de componentes usa `src/styles/ui/*.css` (classes `ui-*`); remova regras CSS quando a classe deixar de ser emitida.
- Feedback de ações usa toasts (`useToast`), não banners.

## Ferramentas do repositório

- A skill de design Impeccable fica apenas em `.claude/skills/impeccable` (hooks em `.claude/settings.local.json`). As cópias do Codex (`.codex/` e `.agents/`) foram removidas; não as recrie.
- Críticas de design ficam em `.impeccable/critique/` na raiz; o sidecar do design system fica em `src/FinanceControl.Web/.impeccable/` (`design.json` e `config.json`, lidos pela skill ao lado do `DESIGN.md`).
- Configurações de IDE (`.idea/`) e artefatos gerados (`dist`, `bin/obj`, `.vitest`, WAL/SHM, backups) não são versionados.

## Qualidade

- Execute `npm run check` após alterações relevantes.
- Adicione testes para regras financeiras, migrações e contratos HTTP alterados.
- Atualize README e documentação arquitetural quando comandos, configuração ou fronteiras mudarem.
