using FinanceControl.Application.Ports;
using FinanceControl.Infrastructure.Persistence;

namespace FinanceControl.Api.Adapters.Background;

/// <summary>Atualiza cotações e indicadores ao iniciar e a cada <c>Market:RefreshHours</c> (padrão 6) para cada usuário com
/// <c>settings.market_auto_refresh</c> ligado. Falhas são registradas no log e nunca derrubam a aplicação.</summary>
public sealed class MarketRefreshHostedService(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<MarketRefreshHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var hours = configuration.GetValue("Market:RefreshHours", 6.0);
        var interval = TimeSpan.FromHours(hours > 0 ? hours : 6);
        using var timer = new PeriodicTimer(interval);
        do
        {
            await PerUser.RunAsync(scopes, logger, "Falha ao atualizar as cotações em segundo plano (usuário {UserId}).",
                useCases => useCases.RefreshMarketIfEnabledAsync(stoppingToken), stoppingToken);
        } while (await WaitAsync(timer, stoppingToken));
    }

    internal static async Task<bool> WaitAsync(PeriodicTimer timer, CancellationToken stoppingToken)
    {
        try { return await timer.WaitForNextTickAsync(stoppingToken); }
        catch (OperationCanceledException) { return false; }
    }
}

/// <summary>Executa o débito automático de cada usuário ao iniciar e a cada hora (idempotente; mesma regra de POST /api/auto-debits/run).</summary>
public sealed class AutoDebitHostedService(IServiceScopeFactory scopes, ILogger<AutoDebitHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            await PerUser.RunAsync(scopes, logger, "Falha ao executar o débito automático (usuário {UserId}).", useCases =>
            {
                var run = useCases.RunAutoDebits();
                if (run.Created.Count > 0) logger.LogInformation("Débito automático lançou {Count} cobrança(s).", run.Created.Count);
                return Task.CompletedTask;
            }, stoppingToken);
        } while (await MarketRefreshHostedService.WaitAsync(timer, stoppingToken));
    }
}

/// <summary>Executa um job no banco de cada usuário, em escopos separados; a falha de um usuário não impede os demais.</summary>
internal static class PerUser
{
    public static async Task RunAsync(IServiceScopeFactory scopes, ILogger logger, string failureMessage, Func<IFinanceUseCases, Task> job, CancellationToken stoppingToken)
    {
        IReadOnlyList<long> userIds;
        try
        {
            using var scope = scopes.CreateScope();
            userIds = scope.ServiceProvider.GetRequiredService<IAccountUseCases>().ListUserIds();
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Falha ao listar os usuários para o job em segundo plano.");
            return;
        }

        foreach (var userId in userIds)
        {
            if (stoppingToken.IsCancellationRequested) return;
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<UserDatabaseScope>().EnterAsync(userId);
                await job(scope.ServiceProvider.GetRequiredService<IFinanceUseCases>());
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, failureMessage, userId);
            }
        }
    }
}
