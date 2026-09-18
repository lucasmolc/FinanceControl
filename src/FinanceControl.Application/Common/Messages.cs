namespace FinanceControl.Application.Common;

/// <summary>Mensagens de validação e de regra de negócio em português brasileiro.</summary>
public static class Messages
{
    public const string Required = "Campo obrigatório.";
    public const string NotAllowed = "Campo não permitido.";
    public const string InvalidValue = "Valor inválido.";
    public const string InvalidOption = "Opção inválida.";
    public const string Positive = "O valor deve ser maior que zero.";
    public const string NonNegative = "O valor não pode ser negativo.";
    public const string DayRange = "O dia deve estar entre 1 e 31.";
    public const string MonthsRange = "Informe um valor entre 1 e 120.";
    public const string Date = "Use uma data válida no formato AAAA-MM-DD.";
    public const string Month = "Use uma competência válida no formato AAAA-MM.";
    public const string Currency = "Use o código da moeda com 3 letras maiúsculas, como BRL.";
    public const string BodyObject = "Envie um objeto JSON.";
    public const string InvalidBody = "O corpo da requisição não é um JSON válido.";
    public const string EmptyUpdate = "Informe ao menos um campo para atualização.";
    public const string CategoryNotFound = "Categoria não encontrada.";
    public const string CardNotFound = "Cartão não encontrado.";
    public const string AccountNotFound = "Conta bancária não encontrada ou inativa.";
    public const string Identifier = "Identificador inválido.";
    public const string TargetAccountRequired = "Selecione a conta de destino.";
    public const string SameAccount = "A conta de destino deve ser diferente da origem.";
    public const string NegativeInvestment = "A movimentação deixaria o investimento com saldo negativo.";
    public const string NegativeGoal = "O estorno deixaria o valor acumulado da meta negativo.";
    public const string LegacyEntry = "Esta movimentação foi registrada antes do histórico detalhado e não pode ser estornada.";
    public const string GoalWithdrawalTooLarge = "O resgate é maior que o valor guardado na meta.";
    public const string InvestmentWithdrawalTooLarge = "O resgate é maior que o saldo atual.";
    public const string ChargeAlreadyRegistered = "Esta cobrança já foi lançada.";
    public const string NextBillingDateRequired = "Informe a data da próxima cobrança.";
    public const string ReassignSameCategory = "Selecione uma categoria diferente da atual.";
    public const string ReassignCategoryUnavailable = "Categoria de destino não encontrada ou removida.";
    public const string ReassignCategoryKind = "A categoria de destino deve ser do mesmo tipo.";
    public const string ReassignSameCard = "Selecione um cartão diferente do atual.";
    public const string ReassignCardUnavailable = "Cartão de destino não encontrado ou removido.";
    public const string BackupVersion = "Versão de backup não suportada. Use um arquivo exportado nas versões 2 ou 3.";
    public const string BackupData = "O backup deve conter o objeto \"data\".";
    public const string BackupUnknownTable = "Tabela desconhecida.";
    public const string BackupRows = "Envie uma lista de registros (objetos).";
    public const string BackupSettings = "O backup deve conter exatamente uma configuração com id 1.";
    public const string BackupUnknownColumn = "Coluna inexistente no banco atual.";
    public const string BackupInvalidRows = "O backup contém registros inválidos para esta tabela.";
    public const string BackupForeignKeys = "O backup contém referências inválidas entre registros.";

    public const string ActiveCardNotFound = "Cartão não encontrado ou inativo.";
    public const string AccountRemoved = "A conta vinculada foi removida. Restaure a conta ou escolha outra.";
    public const string CardPurchaseAccount = "Compras no cartão não movimentam a conta; o pagamento é feito pela fatura.";
    public const string CardPurchasePaymentMethod = "Compras no cartão usam a forma de pagamento Cartão de crédito.";
    public const string LimitRange = "Informe um valor entre 1 e 200.";
    public const string MonthAlreadyClosed = "Este mês já está fechado.";
    public const string FutureMonth = "Não é possível fechar um mês que ainda não começou.";
    public const string InvoiceAlreadyPaid = "Esta fatura já foi paga.";
    public const string BillNotActiveYet = "Esta conta ainda não existia neste mês.";
    public const string InvoiceWithoutAmount = "A fatura não tem valor a pagar. Informe o valor do pagamento.";
    public const string MonthRangeOrder = "A competência final deve ser igual ou posterior à inicial.";
    public const string MonthRangeSize = "Informe um intervalo de até 36 meses.";

    // v1.2
    public const string CurrencyUnsupported = "Moeda não suportada. Escolha uma moeda da lista.";
    public const string CurrencyMismatchAccount = "O lançamento deve usar a moeda da conta vinculada.";
    public const string AccountCurrencyMismatch = "A conta escolhida usa outra moeda.";
    public const string AccountCurrencyLocked = "Não é possível trocar a moeda de uma conta com movimentações.";
    public const string ExchangeRateRequired = "Informe a cotação usada ou atualize as cotações.";
    public const string ExchangeRate = "Informe uma cotação maior que zero.";
    public const string RelatedAmountRequired = "Informe o valor recebido na conta de destino.";
    public const string RelatedAmountSameCurrency = "Entre contas da mesma moeda, o valor recebido deve ser igual ao enviado.";
    public const string Identifier40 = "Use até 40 caracteres entre letras minúsculas, números, - e _.";
    public const string Color = "Use uma cor no formato #RRGGBB.";
    public const string LogoData = "Use uma imagem PNG, JPG, WEBP ou SVG de até 150 KB.";
    public const string AutoDebitAccountRequired = "Escolha a conta que será debitada.";
    public const string AutoDebitSourceRequired = "Escolha a conta que será debitada ou um cartão.";
    public const string BaseCurrencyRate = "O real é a moeda base e não tem cotação.";
    public const string MarketRefreshFailed = "Não foi possível atualizar as cotações agora. Os últimos valores salvos continuam valendo.";
    public const string ReserveTargetLinked = "Esta meta acompanha o salário. Confirme para desligar o cálculo automático.";
    public const string ReserveIncomeRequired = "Informe o salário líquido e os meses de reserva para calcular a meta.";

    // v1.3
    public const string PlanSum = "Os percentuais devem somar 100%.";
    public const string PlanIncomeRequired = "Informe o salário líquido para aplicar o plano.";
    public const string PlanRequired = "Aplique o plano 70-20-10 para vincular o número da liberdade.";
    public const string MultiplierRange = "Informe um valor entre 1 e 600.";
    public const string CardRequired = "Escolha o cartão da compra.";

    // Contas de usuário
    public const string Username = "Use de 3 a 32 caracteres entre letras minúsculas, números, ponto, - e _.";
    public const string UsernameTaken = "Este nome de usuário já está em uso.";
    public const string PasswordLength = "A senha deve ter entre 8 e 128 caracteres.";
    public const string InvalidCredentials = "Usuário ou senha inválidos.";
    public const string SessionRequired = "Sua sessão expirou ou não foi iniciada. Entre novamente.";
    public const string TooManyAttempts = "Muitas tentativas seguidas. Aguarde um minuto e tente novamente.";
    public const string RequestRejected = "Requisição recusada.";

    public static string MaxLength(int length) => $"Use no máximo {length} caracteres.";

    /// <summary>Operação que alteraria um mês fechado (<paramref name="month"/> no formato AAAA-MM).</summary>
    public static string MonthClosed(string month) => $"O mês {month[5..7]}/{month[..4]} está fechado. Reabra-o para alterar.";
}
