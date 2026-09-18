using System.Globalization;
using System.Text.Json;
using FinanceControl.Application.Common;
using FinanceControl.Application.Contracts;
using FinanceControl.Application.Ports;

namespace FinanceControl.Api.Adapters.Http;

public static class FinanceEndpoints
{
    internal const string ValidationTitle = "Dados inválidos.";
    internal const string NotFoundTitle = "Registro não encontrado.";
    internal const string RouteNotFoundTitle = "Recurso não encontrado.";
    internal const string ServerErrorTitle = "Não foi possível concluir a operação.";

    private static readonly string[] RecordModules = ["transactions", "bills", "goals", "investments", "cards", "bank-accounts", "categories", "subscriptions"];
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();
    private static readonly JsonSerializerOptions BackupJson = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower, WriteIndented = true };

    public static IEndpointRouteBuilder MapFinanceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
        endpoints.MapGet("/api/state", (IFinanceUseCases useCases) => Results.Ok(useCases.GetState()));
        endpoints.MapGet("/api/summary", (string? month, IFinanceUseCases useCases) => ToHttp(useCases.GetSummary(month), Results.Ok));
        endpoints.MapGet("/api/about", (IFinanceUseCases useCases) => Results.Ok(useCases.GetAbout()));
        MapRecordModules(endpoints);
        MapFlows(endpoints);
        MapMovements(endpoints);
        MapUsability(endpoints);
        MapClosings(endpoints);
        MapCardInvoices(endpoints);
        MapBackup(endpoints);
        InsightEndpoints.MapInsights(endpoints);
        endpoints.MapFallback("/api/{**path}", () => Results.Problem(statusCode: StatusCodes.Status404NotFound, title: RouteNotFoundTitle));
        return endpoints;
    }

    private static void MapRecordModules(IEndpointRouteBuilder endpoints)
    {
        foreach (var moduleName in RecordModules)
        {
            var module = moduleName;
            var group = endpoints.MapGroup($"/api/{module}");
            if (module == "transactions")
                group.MapGet("/", (string? month, IFinanceUseCases useCases) => ToHttp(useCases.ListTransactions(month), Results.Ok));
            else
                group.MapGet("/", (IFinanceUseCases useCases) => Results.Ok(useCases.ListRecords(module)));
            group.MapPost("/", (JsonElement body, IFinanceUseCases useCases) =>
                WithBody(body, data => ToHttp(useCases.CreateRecord(module, data), id => Results.Created($"/api/{module}/{id}", new { ok = true, id }))));
            group.MapPut("/{id:long}", (long id, JsonElement body, IFinanceUseCases useCases) =>
                WithBody(body, data => ToHttp(useCases.UpdateRecord(module, id, data), _ => Ok())));
            group.MapDelete("/{id:long}", (long id, IFinanceUseCases useCases) => ToHttp(useCases.RemoveRecord(module, id), _ => Results.NoContent()));
            group.MapPost("/{id:long}/restore", (long id, IFinanceUseCases useCases) => ToHttp(useCases.RestoreRecord(module, id), _ => Ok()));
        }
    }

    private static void MapFlows(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPut("/api/settings", (JsonElement body, IFinanceUseCases useCases) => WithBody(body, data => ToHttp(useCases.UpdateSettings(data), _ => Ok())));
        endpoints.MapPost("/api/setup", (SetupCommand command, IFinanceUseCases useCases) => ToHttp(useCases.CompleteSetup(command), _ => Ok()));
        endpoints.MapPost("/api/setup/skip", (IFinanceUseCases useCases) => ToHttp(useCases.SkipSetup(), _ => Ok()));
        endpoints.MapPost("/api/plan", (JsonElement body, IFinanceUseCases useCases) =>
            WithBody(body, data => ToHttp(useCases.ApplyPlan(data), plan => Results.Ok(new
            {
                ok = true,
                emergency_goal_id = plan.EmergencyGoalId,
                freedom_goal_id = plan.FreedomGoalId,
                created_categories = plan.CreatedCategories,
                marked_categories = plan.MarkedCategories
            }))));
        endpoints.MapDelete("/api/plan", (IFinanceUseCases useCases) => ToHttp(useCases.ClearPlan(), _ => Results.NoContent()));
        endpoints.MapGet("/api/checklist", (string? month, IFinanceUseCases useCases) => ToHttp(useCases.GetChecklist(month), Results.Ok));
        endpoints.MapPost("/api/checklist", (JsonElement body, IFinanceUseCases useCases) =>
            WithBody(body, data => ToHttp(useCases.SetChecklist(data), transactionId => Results.Ok(new { ok = true, transaction_id = transactionId }))));
    }

    private static void MapMovements(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/goals/{goalId:long}/entries", (long goalId, string? limit, string? offset, HttpResponse response, IFinanceUseCases useCases) =>
            ToHttp(useCases.ListGoalEntries(goalId, limit, offset), page => PageResult(response, page)));
        endpoints.MapPost("/api/goals/{goalId:long}/entries", (long goalId, JsonElement body, IFinanceUseCases useCases) =>
            WithBody(body, data => ToHttp(useCases.AddGoalEntry(goalId, data), id => Results.Created($"/api/goals/{goalId}/entries/{id}", new { ok = true, id }))));
        endpoints.MapDelete("/api/goals/{goalId:long}/entries/{entryId:long}", (long goalId, long entryId, IFinanceUseCases useCases) =>
            ToHttp(useCases.ReverseGoalEntry(goalId, entryId), _ => Results.NoContent()));
        endpoints.MapPost("/api/goals/{goalId:long}/entries/{entryId:long}/restore", (long goalId, long entryId, IFinanceUseCases useCases) =>
            ToHttp(useCases.RestoreGoalEntry(goalId, entryId), _ => Ok()));

        endpoints.MapGet("/api/investments/{investmentId:long}/entries", (long investmentId, string? limit, string? offset, HttpResponse response, IFinanceUseCases useCases) =>
            ToHttp(useCases.ListInvestmentEntries(investmentId, limit, offset), page => PageResult(response, page)));
        endpoints.MapPost("/api/investments/{investmentId:long}/entries", (long investmentId, JsonElement body, IFinanceUseCases useCases) =>
            WithBody(body, data => ToHttp(useCases.AddInvestmentEntry(investmentId, data), id => Results.Created($"/api/investments/{investmentId}/entries/{id}", new { ok = true, id }))));
        endpoints.MapDelete("/api/investments/{investmentId:long}/entries/{entryId:long}", (long investmentId, long entryId, IFinanceUseCases useCases) =>
            ToHttp(useCases.ReverseInvestmentEntry(investmentId, entryId), _ => Results.NoContent()));
        endpoints.MapPost("/api/investments/{investmentId:long}/entries/{entryId:long}/restore", (long investmentId, long entryId, IFinanceUseCases useCases) =>
            ToHttp(useCases.RestoreInvestmentEntry(investmentId, entryId), _ => Ok()));

        endpoints.MapGet("/api/bank-accounts/{accountId:long}/entries", (long accountId, string? limit, string? offset, HttpResponse response, IFinanceUseCases useCases) =>
            ToHttp(useCases.ListBankStatement(accountId, limit, offset), page => PageResult(response, page)));
        endpoints.MapPost("/api/bank-accounts/{accountId:long}/entries", (long accountId, JsonElement body, IFinanceUseCases useCases) =>
            WithBody(body, data => ToHttp(useCases.AddBankEntry(accountId, data), id => Results.Created($"/api/bank-accounts/{accountId}/entries/{id}", new { ok = true, id }))));
        endpoints.MapDelete("/api/bank-accounts/{accountId:long}/entries/{entryId:long}", (long accountId, long entryId, IFinanceUseCases useCases) =>
            ToHttp(useCases.ReverseBankEntry(accountId, entryId), _ => Results.NoContent()));
        endpoints.MapPost("/api/bank-accounts/{accountId:long}/entries/{entryId:long}/restore", (long accountId, long entryId, IFinanceUseCases useCases) =>
            ToHttp(useCases.RestoreBankEntry(accountId, entryId), _ => Ok()));
    }

    private static void MapUsability(IEndpointRouteBuilder endpoints)
    {
        // Corpo opcional: sem corpo valem os padrões (hoje, valor da assinatura, forma de pagamento pelo cartão).
        endpoints.MapPost("/api/subscriptions/{subscriptionId:long}/charge", async (long subscriptionId, HttpRequest request, IFinanceUseCases useCases) =>
        {
            var body = await ReadOptionalBodyAsync(request);
            if (body is null) return Validation(new Dictionary<string, string[]> { ["body"] = [Messages.InvalidBody] });
            return WithBody(body.Value, data => ToHttp(useCases.ChargeSubscription(subscriptionId, data), charge =>
                Results.Created($"/api/subscriptions/{subscriptionId}/charge?date={charge.ChargeDate}", new { ok = true, transaction_id = charge.TransactionId, charge_date = charge.ChargeDate })));
        });
        endpoints.MapDelete("/api/subscriptions/{subscriptionId:long}/charge", (long subscriptionId, string? date, IFinanceUseCases useCases) =>
            ToHttp(useCases.UndoSubscriptionCharge(subscriptionId, date), _ => Results.NoContent()));

        endpoints.MapPost("/api/categories/{categoryId:long}/reassign", (long categoryId, JsonElement body, IFinanceUseCases useCases) =>
            WithBody(body, data => ToHttp(useCases.ReassignCategory(categoryId, data), counts =>
                Results.Ok(new { ok = true, updated = new { transactions = counts.Transactions, bills = counts.Bills, subscriptions = counts.Subscriptions } }))));
        endpoints.MapPost("/api/cards/{cardId:long}/reassign", (long cardId, JsonElement body, IFinanceUseCases useCases) =>
            WithBody(body, data => ToHttp(useCases.ReassignCard(cardId, data), moved =>
                Results.Ok(new { ok = true, updated = new { subscriptions = moved.Subscriptions, transactions = moved.Transactions } }))));

        endpoints.MapGet("/api/categories/{categoryId:long}/links", (long categoryId, IFinanceUseCases useCases) => ToHttp(useCases.GetCategoryLinks(categoryId), Results.Ok));
        endpoints.MapGet("/api/cards/{cardId:long}/links", (long cardId, IFinanceUseCases useCases) => ToHttp(useCases.GetCardLinks(cardId), Results.Ok));
    }

    private static void MapClosings(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/months/closings", (IFinanceUseCases useCases) => Results.Ok(useCases.ListClosings().Select(closing => new
        {
            month = closing.Month,
            closed_at = closing.ClosedAt,
            notes = closing.Notes,
            summary = closing.SummaryJson is null ? (JsonElement?)null : JsonDocument.Parse(closing.SummaryJson).RootElement.Clone()
        })));
        // Corpo opcional: { notes?: texto ≤ 500 }.
        endpoints.MapPost("/api/months/{month}/close", (string month, HttpRequest request, IFinanceUseCases useCases) =>
            WithOptionalBody(request, data => ToHttp(useCases.CloseMonth(month, data), closing => Results.Ok(new { ok = true, month = closing.Month, closed_at = closing.ClosedAt }))));
        endpoints.MapPost("/api/months/{month}/reopen", (string month, IFinanceUseCases useCases) => ToHttp(useCases.ReopenMonth(month), _ => Ok()));
    }

    private static void MapCardInvoices(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/cards/{cardId:long}/invoices", (long cardId, string? from, string? to, IFinanceUseCases useCases) =>
            ToHttp(useCases.ListCardInvoices(cardId, from, to), Results.Ok));
        endpoints.MapGet("/api/card-invoices", (string? month, IFinanceUseCases useCases) => ToHttp(useCases.ListInvoicesToPay(month), Results.Ok));
        endpoints.MapGet("/api/cards/{cardId:long}/invoices/{month}", (long cardId, string month, IFinanceUseCases useCases) =>
            ToHttp(useCases.GetCardInvoice(cardId, month), Results.Ok));
        endpoints.MapPost("/api/cards/{cardId:long}/invoices/{month}/pay", (long cardId, string month, HttpRequest request, IFinanceUseCases useCases) =>
            WithOptionalBody(request, data => ToHttp(useCases.PayCardInvoice(cardId, month, data), entryId =>
                Results.Created($"/api/cards/{cardId}/invoices/{month}", new { ok = true, bank_entry_id = entryId }))));
        endpoints.MapDelete("/api/cards/{cardId:long}/invoices/{month}/pay", (long cardId, string month, IFinanceUseCases useCases) =>
            ToHttp(useCases.UnpayCardInvoice(cardId, month), _ => Results.NoContent()));
    }

    private static void MapBackup(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/backup", (IFinanceUseCases useCases, TimeProvider time) =>
        {
            var bytes = JsonSerializer.SerializeToUtf8Bytes(useCases.CreateBackup(), BackupJson);
            return Results.File(bytes, "application/json", $"lmm-finance-backup-{LocalDate(time)}.json");
        });
        endpoints.MapGet("/api/backup/database", (IFinanceUseCases useCases, TimeProvider time) =>
            Results.File(useCases.CreateDatabaseSnapshot(), "application/vnd.sqlite3", $"lmm-finance-{LocalDate(time)}.db"));
        endpoints.MapPost("/api/backup/restore", (JsonElement body, IFinanceUseCases useCases) =>
            JsonInput.TryConvert(body, out var document)
                ? ToHttp(useCases.RestoreBackup(document), Results.Ok)
                : Validation(new Dictionary<string, string[]> { ["body"] = [Messages.InvalidBody] }));
    }

    private static string LocalDate(TimeProvider time) => time.GetLocalNow().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>Corpo JSON opcional: vazio vale como objeto vazio; JSON malformado devolve null.</summary>
    private static async Task<JsonElement?> ReadOptionalBodyAsync(HttpRequest request)
    {
        using var buffer = new MemoryStream();
        await request.Body.CopyToAsync(buffer, request.HttpContext.RequestAborted);
        var bytes = buffer.ToArray();
        if (string.IsNullOrWhiteSpace(System.Text.Encoding.UTF8.GetString(bytes))) return EmptyObject;
        try
        {
            using var document = JsonDocument.Parse(bytes);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IResult Ok() => Results.Ok(new { ok = true });

    /// <summary>Página de movimentações: o corpo continua sendo a lista; o total vai no cabeçalho X-Total-Count.</summary>
    private static IResult PageResult<T>(HttpResponse response, Domain.Entities.EntryPage<T> page)
    {
        response.Headers["X-Total-Count"] = page.Total.ToString(CultureInfo.InvariantCulture);
        return Results.Ok(page.Items);
    }

    internal static async Task<IResult> WithOptionalBody(HttpRequest request, Func<RecordData, IResult> handle)
    {
        var body = await ReadOptionalBodyAsync(request);
        return body is null ? Validation(new Dictionary<string, string[]> { ["body"] = [Messages.InvalidBody] }) : WithBody(body.Value, handle);
    }

    private static IResult WithBody(JsonElement body, Func<RecordData, IResult> handle)
    {
        if (!JsonInput.TryConvert(body, out var value)) return Validation(new Dictionary<string, string[]> { ["body"] = [Messages.InvalidBody] });
        return value is Dictionary<string, object?> values
            ? handle(new RecordData(values))
            : Validation(new Dictionary<string, string[]> { ["body"] = [Messages.BodyObject] });
    }

    internal static IResult ToHttp<T>(OperationResult<T> result, Func<T, IResult> success) => result.Status switch
    {
        OperationStatus.Success => success(result.Value!),
        OperationStatus.NotFound => Results.Problem(statusCode: StatusCodes.Status404NotFound, title: NotFoundTitle),
        OperationStatus.ValidationError => Validation(result.Errors ?? new Dictionary<string, string[]> { ["body"] = [ValidationTitle] }),
        _ => Results.Problem(statusCode: StatusCodes.Status500InternalServerError, title: ServerErrorTitle)
    };

    private static IResult Validation(IReadOnlyDictionary<string, string[]> errors) =>
        Results.ValidationProblem(errors.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal), title: ValidationTitle);
}
