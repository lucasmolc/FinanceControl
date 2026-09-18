# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pessoas que administram as próprias finanças no computador e precisam acompanhar orçamento, contas, patrimônio e objetivos sem depender de planilhas ou informações dispersas. Na mesma casa, várias pessoas podem usar um único servidor local, cada uma com a própria conta e os próprios dados, pelo computador ou pelo celular.

## Product Purpose

O LMM Finance Control centraliza o controle financeiro pessoal. Ele permite registrar e acompanhar receitas, despesas, contas recorrentes, metas, investimentos, contas bancárias, cartões, categorias e assinaturas, oferecendo uma visão mensal consolidada para apoiar decisões cotidianas.

O produto tem sucesso quando a pessoa entende sua situação financeira com clareza, mantém os compromissos em dia e acompanha a evolução de orçamento, patrimônio e objetivos com seus próprios dados.

## Positioning

O diferencial central é o funcionamento local-first: os dados financeiros permanecem sob controle do usuário em um computador da casa, sem serviço de nuvem, enquanto todo o ciclo financeiro pessoal fica reunido em uma única aplicação. A conta de usuário é local (criada no próprio servidor) e serve para separar os dados de cada pessoa, não para sincronizar com terceiros.

## Operating Context

- Uso em navegador, com a aplicação e os bancos executados localmente: só no próprio computador ou como servidor na rede de casa (Windows), acessado por outros computadores e celulares da mesma rede.
- Login obrigatório com cadastro livre na tela de entrada; cada conta começa vazia e vê apenas os próprios dados.
- Sessão de 30 dias renovada com o uso; "Sair" fica em Configurações › Conta.
- Configuração inicial opcional e reaberta pelas Configurações quando necessário.
- Revisão recorrente do painel mensal, do checklist de contas e do consumo do orçamento por categoria.
- Cadastro manual apenas dos módulos e dados relevantes para cada pessoa; exemplos de formulário não criam registros automaticamente.
- Exportação de backup JSON antes de atualizações ou para guarda independente dos dados.

## Capabilities and Constraints

- Interface e mensagens em português brasileiro.
- SQLite é a fonte de verdade local; os dados financeiros principais não dependem de nuvem.
- Um banco SQLite por usuário (isolamento físico) e um banco de contas com apenas nome de usuário e hash da senha.
- Toda a API exige sessão; alterações exigem o cabeçalho anti-CSRF; login e cadastro têm limite de tentativas.
- O servidor local é feito para a rede de casa (HTTP) e não deve ser exposto na internet.
- Valores monetários são armazenados como inteiros de 64 bits em centavos.
- Datas de negócio usam `YYYY-MM-DD` e competências usam `YYYY-MM`.
- Registros financeiros usam exclusão lógica para preservar o histórico.
- Operações que afetam múltiplos saldos ou agregados devem ser atômicas.
- O banco e bancos criados por versões anteriores devem permanecer compatíveis por meio de migrações incrementais.
- A aplicação acompanha lançamentos, contas recorrentes, metas, investimentos, cartões, contas bancárias, categorias e assinaturas.
- O painel consolida renda, gastos, orçamento disponível, patrimônio acompanhado, compromissos mensais e progresso de metas.
- O setup é opcional, aceita o nome em branco e não cria dados financeiros automaticamente.

## Brand Commitments

- Nome oficial: LMM Finance Control.
- Comunicação direta, clara e segura, integralmente em português brasileiro.
- O produto não deve sugerir que dados financeiros são enviados ou sincronizados com serviços externos quando isso não ocorre.

## Evidence on Hand

- Descrição do produto, execução e comportamento local-first em `../../README.md`.
- Arquitetura, responsabilidades e decisões de persistência em `../../docs/ARCHITECTURE.md`.
- Fluxos e módulos reais em `src/App.tsx` e `src/features/`.
- Navegação e terminologia do produto em `src/components/navigation.ts`.
- Não há depoimentos, clientes, benchmarks, prêmios ou alegações comerciais documentados; trabalhos futuros não devem fabricá-los.

## Product Principles

1. Manter os dados financeiros sob controle do usuário, separados por pessoa.
2. Tornar a situação do mês compreensível em uma única visão.
3. Permitir adoção gradual, sem cadastros obrigatórios ou dados fictícios.
4. Preservar histórico, integridade monetária e compatibilidade do banco.
5. Usar linguagem financeira clara e adequada ao contexto brasileiro.

## Accessibility & Inclusion

A interface deve preservar contraste acessível, labels claros, navegação responsiva e mensagens compreensíveis em português brasileiro.
