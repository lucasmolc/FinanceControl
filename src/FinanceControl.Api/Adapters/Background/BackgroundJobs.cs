using FinanceControl.Application.Ports;

namespace FinanceControl.Api.Adapters.Background;

/// <summary>Atualiza cotações e indicadores ao iniciar e a cada <c>Market:RefreshHours</c> (padrão 6) quando
/// <c>settings.market_auto_refresh</c> está ligado. Falhas são registradas no log e nunca derrubam a aplicação.</summary>
public sealed class MarketRefreshHostedService(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<MarketRefreshHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var hours = configuration.GetValue("Market:RefreshHours", 6.0);
        var interval = TimeSpan.FromHours(hours > 0 ? hours : 6);
        using var timer = new PeriodicTimer(interval);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<IFinanceUseCases>().RefreshMarketIfEnabledAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Falha ao atualizar as cotações em segundo plano.");
            }
        } while (await WaitAsync(timer, stoppingToken));
    }

    internal static async Task<bool> WaitAsync(PeriodicTimer timer, CancellationToken stoppingToken)
    {
        try { return await timer.WaitForNextTickAsync(stoppingToken); }
        catch (OperationCanceledException) { return false; }
    }
}

/// <summary>Executa o débito automático ao iniciar e a cada hora (idempotente; mesma regra de POST /api/auto-debits/run).</summary>
public sealed class AutoDebitHostedService(IServiceScopeFactory scopes, ILogger<AutoDebitHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var run = scope.ServiceProvider.GetRequiredService<IFinanceUseCases>().RunAutoDebits();
                if (run.Created.Count > 0) logger.LogInformation("Débito automático lançou {Count} cobrança(s).", run.Created.Count);
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Falha ao executar o débito automático.");
            }
        } while (await MarketRefreshHostedService.WaitAsync(timer, stoppingToken));
    }
}
