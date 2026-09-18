# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pessoas que administram as próprias finanças no computador e precisam acompanhar orçamento, contas, patrimônio e objetivos sem depender de planilhas ou informações dispersas.

## Product Purpose

O LMM Finance Control centraliza o controle financeiro pessoal. Ele permite registrar e acompanhar receitas, despesas, contas recorrentes, metas, investimentos, contas bancárias, cartões, categorias e assinaturas, oferecendo uma visão mensal consolidada para apoiar decisões cotidianas.

O produto tem sucesso quando a pessoa entende sua situação financeira com clareza, mantém os compromissos em dia e acompanha a evolução de orçamento, patrimônio e objetivos com seus próprios dados.

## Positioning

O diferencial central é o funcionamento local-first: os dados financeiros permanecem sob controle do usuário no próprio computador, sem conta ou serviço de nuvem obrigatório, enquanto todo o ciclo financeiro pessoal fica reunido em uma única aplicação.

## Operating Context

- Uso individual em navegador, com a aplicação e o banco executados localmente.
- Configuração inicial opcional e reaberta pelas Configurações quando necessário.
- Revisão recorrente do painel mensal, do checklist de contas e do consumo do orçamento por categoria.
- Cadastro manual apenas dos módulos e dados relevantes para cada pessoa; exemplos de formulário não criam registros automaticamente.
- Exportação de backup JSON antes de atualizações ou para guarda independente dos dados.

## Capabilities and Constraints

- Interface e mensagens em português brasileiro.
- SQLite é a fonte de verdade local; os dados financeiros principais não dependem de nuvem.
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

1. Manter os dados financeiros sob controle do usuário.
2. Tornar a situação do mês compreensível em uma única visão.
3. Permitir adoção gradual, sem cadastros obrigatórios ou dados fictícios.
4. Preservar histórico, integridade monetária e compatibilidade do banco.
5. Usar linguagem financeira clara e adequada ao contexto brasileiro.

## Accessibility & Inclusion

A interface deve preservar contraste acessível, labels claros, navegação responsiva e mensagens compreensíveis em português brasileiro.
