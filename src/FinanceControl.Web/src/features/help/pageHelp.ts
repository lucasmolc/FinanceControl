import type { PageId } from "../../types";

/** Um assunto da ajuda: o que a função faz e como usá-la bem. */
export interface HelpTopic {
  title: string;
  body: string;
}

export interface PageHelp {
  /** Uma frase sobre para que a tela serve. */
  intro: string;
  topics: HelpTopic[];
  /** Cuidados e erros comuns, em uma linha cada. */
  watch?: string[];
}

/**
 * Ajuda de cada tela: o que a função faz e a melhor forma de usá-la. O texto descreve o comportamento real do
 * sistema — quando uma regra mudar, esta é a fonte que precisa mudar junto.
 */
export const PAGE_HELP: Partial<Record<PageId, PageHelp>> = {
  dashboard: {
    intro: "O resumo do mês escolhido: o que entrou, o que saiu, quanto ainda vai sair e como está o ritmo dos gastos.",
    topics: [
      { title: "Escolha o mês no topo", body: "Quase tudo aqui é do mês selecionado. Trocar o mês muda os totais, o orçamento e os vencimentos — inclusive de meses futuros, para planejar." },
      { title: "Saldo do mês x saldo da conta", body: "O saldo do mês é receitas − despesas − investimentos pelas datas dos lançamentos. O saldo das contas bancárias é o dinheiro que já entrou ou saiu de verdade; compras no cartão só saem da conta quando você paga a fatura." },
      { title: "Personalize os blocos", body: "Os blocos podem ser reordenados e ocultados. Se esconder algo sem querer, é possível restaurar tudo em Configurações → Aparência." },
      { title: "Clique nos números", body: "Os gráficos e blocos levam para a lista por trás deles já filtrada — por exemplo, a fatia de uma categoria abre os lançamentos dela no mês." },
    ],
    watch: ["Um mês fechado aparece marcado e não aceita alterações até ser reaberto."],
  },
  transactions: {
    intro: "Tudo o que entrou e saiu no mês, agrupado por dia. É aqui que se registra, importa e organiza o dia a dia.",
    topics: [
      { title: "Importar fatura ou extrato", body: "Em \"Importar fatura\" você envia o arquivo que o banco exporta (CSV, OFX ou QIF) e vira um lançamento por linha. Antes de gravar, a conferência mostra o que é novo, o que já existe e o que já foi importado. Reimportar o mesmo arquivo não duplica nada." },
      { title: "A data é a do gasto, não a da fatura", body: "Uma compra de setembro que vem na fatura de outubro continua sendo gasto de setembro — é assim que o total do mês reflete o que você gastou. A fatura de outubro é quem cobra, e ela aparece em Cartões e em Contas a pagar." },
      { title: "Revisar o que foi importado", body: "Depois de importar, use \"Só importados\" e selecione as linhas para definir a categoria e o cartão de uma vez em \"Categorizar\". É a forma rápida de acertar os gastos da fatura." },
      { title: "Compra parcelada", body: "No formulário, escolha \"Parcelado\", informe em qual parcela você está (ex.: 6 de 10) e se o valor digitado é o da parcela ou o da compra inteira. As dez parcelas são lançadas de uma vez, nos meses passados e futuros, cada uma na sua fatura." },
      { title: "Gasto mensal sem prazo", body: "Para academia, streaming e afins, escolha \"Todo mês, sem prazo\": vira uma assinatura, que se repete até você desativar. Mudar o valor lá vale só para as próximas cobranças, nunca para as que já passaram." },
      { title: "Forma de pagamento muda o efeito", body: "Compra no cartão entra na fatura e não mexe no saldo da conta. Pix, débito, boleto e transferência vinculados a uma conta ajustam o saldo dela." },
    ],
    watch: [
      "Lançamento com data futura só entra no saldo da conta no dia em que a data chega.",
      "Linhas de \"pagamento de fatura\" no arquivo importado ficam de fora: o pagamento é registrado na tela de cartões.",
    ],
  },
  bills: {
    intro: "O checklist do mês: o que vence, o que já foi pago e o que está atrasado — contas fixas e faturas de cartão no mesmo lugar.",
    topics: [
      { title: "Pagar gera a despesa", body: "Ao marcar uma conta como paga, o lançamento da despesa é criado automaticamente na data do vencimento. Desmarcar remove o lançamento." },
      { title: "Débito automático", body: "Com débito automático e uma conta escolhida, a conta é paga sozinha no vencimento e a despesa é lançada. Serve para o que já sai da conta sem a sua ação." },
      { title: "Conta que não existia antes", body: "Uma conta cadastrada hoje não aparece como vencida em meses anteriores. Se precisar, ajuste a data a partir da qual ela existe na edição." },
      { title: "Faturas de cartão", body: "As faturas fechadas e não pagas aparecem nesta lista junto com as contas, pelo vencimento, e são pagas pela tela de cartões." },
    ],
  },
  subscriptions: {
    intro: "Serviços que se repetem — o custo mensal equivalente de cada um e a próxima cobrança.",
    topics: [
      { title: "É aqui que mora o gasto sem prazo", body: "Uma assinatura se repete indefinidamente até ser desativada. É o lugar certo para academia, streaming e mensalidades." },
      { title: "Alterar o valor vale para o futuro", body: "Mudar o valor de uma assinatura afeta as próximas cobranças; as já lançadas ficam como estão, preservando o histórico." },
      { title: "Aparece na fatura antes de acontecer", body: "Uma assinatura no cartão é mostrada nas faturas que ainda não fecharam como cobrança prevista, em um total à parte do que já foi gasto." },
      { title: "Cobrança automática ou manual", body: "Com débito automático, a cobrança é lançada sozinha no dia. Sem ele, use \"Lançar cobrança\" quando ela acontecer." },
    ],
    watch: ["Se você importar a fatura do cartão onde a assinatura já foi lançada, a linha repetida vem marcada como \"pode repetir\" e não entra sem a sua confirmação."],
  },
  accounts: {
    intro: "Bancos, corretoras e carteiras: o saldo de cada um, o extrato e o que ainda vai sair no mês.",
    topics: [
      { title: "O saldo é o que já aconteceu", body: "O saldo conta apenas lançamentos e movimentações com data até hoje. Parcelas e lançamentos futuros entram no saldo no dia em que vencem." },
      { title: "Saldo projetado", body: "Abaixo do saldo, a tela mostra o que ainda deve sair até o fim do mês (contas a pagar e débitos automáticos) e o saldo previsto depois disso." },
      { title: "Transferências", body: "Uma transferência entre contas sai de uma e entra na outra em uma única operação; entre moedas diferentes, informe o valor recebido no destino." },
      { title: "Estorno", body: "Qualquer movimentação pode ser estornada, e o estorno pode ser desfeito. Nada é apagado de verdade — o histórico fica." },
    ],
  },
  investments: {
    intro: "Quanto foi aplicado, quanto vale hoje e o resultado de cada aplicação.",
    topics: [
      { title: "Aporte, resgate, rendimento e ajuste", body: "Aporte e resgate mexem no valor aplicado; rendimento só no valor atual; ajuste define o saldo atual de uma vez, útil para copiar o valor do extrato da corretora." },
      { title: "Resgate usa custo médio", body: "Ao resgatar, o valor aplicado cai proporcionalmente ao que foi retirado, para o resultado continuar correto." },
      { title: "Moeda estrangeira", body: "Investimentos em outras moedas entram nos totais em reais pela cotação mais recente. Sem cotação salva, ficam de fora e a tela avisa, em vez de somar zero em silêncio." },
    ],
  },
  cards: {
    intro: "Limites, ciclo de cada cartão e as faturas: a aberta, as fechadas e as futuras.",
    topics: [
      { title: "Fechamento e vencimento", body: "A fatura junta as compras do período que termina no fechamento e vence depois. Por isso uma compra de setembro costuma cair na fatura de outubro — o gasto continua sendo de setembro nas outras telas." },
      { title: "Importar a fatura", body: "Pela tela de lançamentos você envia o arquivo da fatura e cada linha vira um lançamento no cartão, já na fatura certa." },
      { title: "Últimos 4 dígitos", body: "Preencha os 4 últimos dígitos de cada cartão. É por eles que a importação identifica, em uma fatura com cartões adicionais, qual cartão fez cada compra." },
      { title: "Pagar a fatura", body: "O pagamento registra uma saída na conta bancária escolhida. Desfazer o pagamento estorna essa saída e a fatura volta a ficar em aberto." },
      { title: "Previsto na fatura", body: "Faturas que ainda não fecharam mostram as assinaturas do cartão esperadas no ciclo, somadas à parte do que já foi gasto." },
    ],
  },
  goals: {
    intro: "Seus objetivos: quanto já foi guardado, quanto falta e quanto aportar por mês para chegar no prazo.",
    topics: [
      { title: "Aportes e resgates", body: "Cada movimentação entra no histórico da meta e pode ser estornada. O valor guardado é a soma delas." },
      { title: "Metas do planejamento", body: "A reserva de emergência e o número da liberdade acompanham o seu planejamento sozinhas: o alvo é recalculado quando o salário muda." },
      { title: "Removeu sem querer?", body: "Metas do planejamento removidas não voltam sozinhas. Quando isso acontece, um aviso aparece no topo desta tela com a opção de criar de novo, já com o cálculo automático." },
      { title: "Prazo muda a sugestão", body: "Com uma data-alvo, a tela calcula quanto aportar por mês. Sem prazo, mostra apenas quanto falta." },
    ],
  },
  categories: {
    intro: "O orçamento do mês por categoria de despesa e o balde de cada uma no plano 70-20-10.",
    topics: [
      { title: "Limite por categoria", body: "O limite mensal é comparado ao que já foi gasto no mês escolhido, para mostrar quem está perto de estourar." },
      { title: "Baldes do plano", body: "Com o plano 70-20-10 aplicado, cada categoria de despesa entra em gastos fixos, lazer ou investimento. É isso que permite comparar o plano com a realidade." },
      { title: "Categorizar em lote", body: "Se muitos lançamentos estão sem categoria (comum depois de importar uma fatura), a tela de lançamentos organiza vários de uma vez." },
      { title: "Remover uma categoria", body: "Ao remover, você escolhe para onde vão os lançamentos, contas e assinaturas ligados a ela, sem perder histórico." },
    ],
  },
  reports: {
    intro: "Um período inteiro em números: entradas, saídas, categorias e os maiores gastos.",
    topics: [
      { title: "Escolha o período", body: "Os relatórios cobrem um intervalo de meses, não apenas um mês, para comparar temporadas e ver tendências." },
      { title: "Exportar em CSV", body: "A exportação traz os lançamentos do período em um arquivo que abre em qualquer planilha." },
      { title: "Valores em reais", body: "Lançamentos em outras moedas entram pelo valor em reais da data em que foram registrados." },
    ],
  },
  projections: {
    intro: "Para onde o seu dinheiro vai se o ritmo atual continuar.",
    topics: [
      { title: "De onde vêm os números", body: "A projeção parte do patrimônio de hoje e das médias dos últimos meses, mais as contas e assinaturas já cadastradas." },
      { title: "Teste cenários", body: "Alterar as premissas muda apenas a simulação na tela; nenhum dado é gravado." },
      { title: "Metas no gráfico", body: "As metas com prazo aparecem na linha do tempo, mostrando se o ritmo atual chega lá." },
    ],
  },
  market: {
    intro: "Cotações e indicadores usados para converter moedas e comparar rendimentos.",
    topics: [
      { title: "Atualização automática", body: "Com a atualização ligada, as cotações são buscadas de tempos em tempos. Se a busca falhar, os últimos valores salvos continuam valendo." },
      { title: "Cotação manual", body: "Você pode fixar a cotação de uma moeda. O valor manual é preservado nas atualizações automáticas até você limpá-lo." },
      { title: "Sem cotação, sem palpite", body: "Uma moeda sem cotação salva fica de fora dos totais em reais, e as telas avisam, em vez de somar zero." },
    ],
  },
  settings: {
    intro: "Perfil, plano, aparência, cópia de segurança e as ações que mexem em tudo.",
    topics: [
      { title: "Salário e teto de gastos", body: "O salário líquido alimenta a reserva de emergência, o número da liberdade e o plano 70-20-10. Vale a pena mantê-lo atualizado." },
      { title: "Cópia de segurança", body: "Exporte o JSON antes de mudanças grandes. Restaurar substitui todos os dados atuais, e uma cópia automática é gravada antes." },
      { title: "Fechar e reabrir meses", body: "Um mês fechado trava alterações naquele período. Para corrigir algo antigo — ou lançar uma compra parcelada que alcança meses antigos — reabra o mês." },
      { title: "Zerar a conta", body: "Apaga todos os dados financeiros e devolve o app ao primeiro acesso. Exige confirmação por escrito, grava uma cópia do banco antes e mantém o seu usuário e senha." },
    ],
  },
};

export const helpFor = (page: PageId): PageHelp | undefined => PAGE_HELP[page];
