using FinanceControl.Application.Contracts;

namespace FinanceControl.Application.Ports;

/// <summary>Porta de saída para cotações e indicadores públicos (nenhum dado do usuário é enviado).</summary>
public interface IMarketDataSource
{
    /// <summary>Busca as cotações em BRL das moedas pedidas e os indicadores (Selic, CDI, IPCA). Nunca lança por falha de rede: os erros vêm em <see cref="MarketFetchResult.Errors"/>.</summary>
    Task<MarketFetchResult> FetchAsync(IReadOnlyCollection<string> currencies, CancellationToken cancellationToken);
}
