using System.Text;
using FinanceControl.Application.Ports;

namespace FinanceControl.Api.Adapters.Http;

/// <summary>Rotas da v1.2: moedas, mercado, débito automático, relatórios, projeções e reserva de emergência.</summary>
internal static class InsightEndpoints
{
    public static void MapInsights(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/currencies", (IFinanceUseCases useCases) => Results.Ok(useCases.ListCurrencies()));

        endpoints.MapGet("/api/market", (IFinanceUseCases useCases) => Results.Ok(useCases.GetMarket()));
        endpoints.MapPost("/api/market/refresh", async (IFinanceUseCases useCases, CancellationToken cancellationToken) =>
            Results.Ok(await useCases.RefreshMarketAsync(cancellationToken)));
        endpoints.MapPut("/api/market/rates/{currency}", (string currency, HttpRequest request, IFinanceUseCases useCases) =>
            FinanceEndpoints.WithOptionalBody(request, data => FinanceEndpoints.ToHttp(useCases.SetManualRate(currency, data), Results.Ok)));
        endpoints.MapDelete("/api/market/rates/{currency}", (string currency, IFinanceUseCases useCases) =>
            FinanceEndpoints.ToHttp(useCases.ClearManualRate(currency), _ => Results.NoContent()));

        endpoints.MapPost("/api/auto-debits/run", (IFinanceUseCases useCases) => Results.Ok(useCases.RunAutoDebits()));

        endpoints.MapGet("/api/reports", (string? from, string? to, IFinanceUseCases useCases) =>
            FinanceEndpoints.ToHttp(useCases.GetReport(from, to), Results.Ok));
        endpoints.MapGet("/api/reports/transactions.csv", (string? from, string? to, IFinanceUseCases useCases) =>
            FinanceEndpoints.ToHttp(useCases.ExportTransactionsCsv(from, to), csv =>
                Results.File([.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(csv.Content)], "text/csv; charset=utf-8", csv.FileName)));
        endpoints.MapGet("/api/projections/base", (IFinanceUseCases useCases) => Results.Ok(useCases.GetProjectionBase()));

        endpoints.MapPost("/api/settings/emergency-goal", (IFinanceUseCases useCases) =>
            FinanceEndpoints.ToHttp(useCases.EnsureEmergencyGoal(), goalId => Results.Ok(new { ok = true, goal_id = goalId })));
        endpoints.MapPost("/api/settings/freedom-goal", (IFinanceUseCases useCases) =>
            FinanceEndpoints.ToHttp(useCases.EnsureFreedomGoal(), goalId => Results.Ok(new { ok = true, goal_id = goalId })));
    }
}
