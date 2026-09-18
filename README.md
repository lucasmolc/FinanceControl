# LMM Finance Control

Controle financeiro pessoal local-first, construído com .NET 10, React 19 e SQLite. Os dados financeiros permanecem no computador do usuário e não dependem de serviços em nuvem.

## Stack

- ASP.NET Core Minimal APIs em .NET 10 LTS
- React 19 + TypeScript + Vite
- SQLite com `Microsoft.Data.Sqlite` e Dapper
- Migrações SQL versionadas
- xUnit, Vitest e ESLint

## Pré-requisitos

- [.NET SDK 10](https://dotnet.microsoft.com/download/dotnet/10.0)
- Node.js 20.19+ ou 22.12+
- npm 10+

## Executar em desenvolvimento

```powershell
npm install
npm run dev
```

A interface abre em `http://localhost:5173`; o Vite encaminha `/api` para a API em `http://localhost:5074`.

Também é possível executar cada parte separadamente:

```powershell
npm run dev:api
npm run dev:web
```

## Verificar o projeto

```powershell
npm run check
```

Esse comando executa lint, testes, compilação do frontend e compilação .NET em `Release`.

Depois do build, execute a aplicação integrada — API e frontend no mesmo processo — com:

```powershell
npm start
```

A aplicação ficará disponível em `http://localhost:5074`.

## Configuração

A configuração base está exclusivamente em `src/FinanceControl.Api/appsettings.json`.

O caminho padrão é `data/finance.db`, relativo ao diretório atual do processo. Como `dotnet run --project src/FinanceControl.Api` (usado por `npm run dev` e `npm start`) executa a partir da pasta do projeto, o banco em uso fica em `src/FinanceControl.Api/Data/finance.db`. O caminho absoluto real aparece em **Configurações → Cópia de segurança** e em `GET /api/about`. Para alterar o caminho, defina:

```powershell
$env:DATABASE_PATH = "C:\dados\finance-control.db"
npm run dev:api
```

## Banco e compatibilidade

- O banco existente é reutilizado automaticamente; migrações pendentes rodam na inicialização e ficam registradas em `schema_migrations` (atual: `009_bill_active_since`).
- Valores monetários são armazenados em centavos inteiros.
- Remoções são lógicas e podem ser desfeitas pela ação **Desfazer**; movimentações de metas, investimentos e contas podem ser estornadas pelo histórico.
- O banco (`Data/finance.db`) é criado e migrado automaticamente na primeira execução e **não é versionado**, assim como WAL, SHM e `Data/backups/`. Para levar seus dados a outra máquina, use a cópia de segurança.
- A aplicação é de uso local: não tem login e aceita apenas `localhost`. Não a exponha na internet.

### Cópia de segurança

Em **Configurações → Cópia de segurança**:

- **Exportar JSON** (`GET /api/backup`) — todos os dados em formato legível.
- **Baixar banco** (`GET /api/backup/database`) — cópia SQLite consistente.
- **Restaurar JSON** (`POST /api/backup/restore`) — substitui os dados atuais; antes, uma cópia automática é gravada em `Data/backups/antes-da-restauracao-*.db`.

## Primeiro uso

- A base inicia vazia: categorias, contas, metas, cartões e demais módulos só recebem registros criados pelo usuário.
- O setup inicial é opcional e aceita o nome em branco; nome e planejamento permanecem editáveis em Configurações.
- A meta da reserva de emergência é o salário líquido mensal multiplicado pelos meses de reserva; com salário e meses definidos, uma única meta "Reserva de emergência" é mantida automaticamente em Metas (sem duplicar).
- Exemplos aparecem apenas como sugestões nos formulários; nunca são gravados automaticamente.
- O tour é exibido automaticamente uma única vez após o primeiro acesso ao painel; para revê-lo, use **Configurações › Ajuda › Rever tour guiado**.
- O planejamento inicial pode ser refeito a qualquer momento em **Configurações › Ajuda › Revisar planejamento inicial** (ou editado diretamente em Perfil e planejamento).
- O setup sugere o **plano 70-20-10** (fixos · lazer · investimento mínimo, reserva de 6 salários e Número da liberdade de 150 salários). Aplicado, ele define o teto de gastos do mês (fixos + lazer), vincula as metas sem duplicar e pode criar as categorias-balde; tudo editável em **Configurações › Plano 70-20-10**.

## Uso diário

- Cada área tem endereço próprio (`#/painel`, `#/lancamentos`, `#/contas-a-pagar`, …), então Voltar e recarregar funcionam.
- Painel, Lançamentos, Contas a pagar e Categorias navegam entre meses pelo seletor do topo.
- Todos os registros podem ser editados; valores aceitam `1.234,56`, `1234,56` ou `12.50`, e entradas inválidas são recusadas em vez de virarem zero.
- Marcar uma conta como paga gera a despesa correspondente (desmarcar remove o lançamento); vincular um lançamento a uma conta bancária atualiza o saldo.
- Compras no cartão entram na fatura do ciclo (fechamento/vencimento do cartão); em **Cartões** é possível ver e pagar a fatura por uma conta bancária.
- **Novo lançamento** está disponível em qualquer tela (botão, `+` no celular ou tecla `N`); **Ctrl K** abre a paleta de comandos.
- **Fechar mês** (Painel, Lançamentos ou paleta) lista as pendências e congela o mês: alterações com data nele ficam bloqueadas até reabri-lo; os fechamentos ficam listados em Configurações.
- Movimentações estornadas e remoções podem ser desfeitas pela ação **Desfazer**.
- O app pode ser instalado pelo navegador (manifest e ícones em `src/FinanceControl.Web/public`); a fonte Inter é empacotada localmente, sem serviços externos.
- Sem conexão com o servidor local, um aviso único aparece no topo, as ações que gravam ficam bloqueadas e as telas recarregam sozinhas quando ele volta.
- Histórico das rodadas de melhoria e notas da crítica de design: [docs/MELHORIAS.md](docs/MELHORIAS.md).

## Estrutura

```text
src/
  FinanceControl.Domain/          núcleo de domínio
  FinanceControl.Application/     casos de uso, contratos e portas
  FinanceControl.Infrastructure/  adaptador SQLite e migrações
  FinanceControl.Api/             adaptador HTTP e composição
  FinanceControl.Web/             adaptador React/Vite
    src/components/ui/            biblioteca de componentes (uma pasta por componente)
    src/components/charts/        gráficos SVG acessíveis
    src/features/                 páginas e modelos por funcionalidade
    src/styles/                   CSS em camadas (tokens → base → app → components → adapt)
tests/
  FinanceControl.Api.Tests/       testes de domínio, migrações e integração HTTP
docs/                             arquitetura, API, migrações, especificação e melhorias
.claude/skills/impeccable/        skill de design usada pelo Claude Code
.impeccable/critique/             histórico das críticas de design
```

Consulte [Arquitetura](docs/ARCHITECTURE.md), [API](docs/API.md) e [Migrações](docs/MIGRATIONS.md).

## Licença

[MIT](LICENSE) © 2026 Lucas Mol.
