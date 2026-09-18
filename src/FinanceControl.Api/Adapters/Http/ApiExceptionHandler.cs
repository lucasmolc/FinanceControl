using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace FinanceControl.Api.Adapters.Http;

/// <summary>Traduz falhas de leitura do corpo (400) e erros inesperados (500) para Problem Details em português.</summary>
internal sealed class ApiExceptionHandler(IProblemDetailsService problemDetails, ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        ProblemDetails problem;
        if (exception is BadHttpRequestException badRequest)
        {
            var field = FieldFromJsonPath(badRequest.InnerException as JsonException);
            httpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
            problem = new ValidationProblemDetails(new Dictionary<string, string[]> { [field] = [field == "body" ? Application.Common.Messages.InvalidBody : Application.Common.Messages.InvalidValue] })
            {
                Title = FinanceEndpoints.ValidationTitle,
                Status = StatusCodes.Status400BadRequest
            };
        }
        else
        {
            logger.LogError(exception, "Falha não tratada em {Path}.", httpContext.Request.Path);
            httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
            problem = new ProblemDetails { Title = FinanceEndpoints.ServerErrorTitle, Status = StatusCodes.Status500InternalServerError };
        }

        return await problemDetails.TryWriteAsync(new ProblemDetailsContext { HttpContext = httpContext, ProblemDetails = problem, Exception = exception });
    }

    private static string FieldFromJsonPath(JsonException? exception)
    {
        var path = exception?.Path;
        if (string.IsNullOrEmpty(path) || path == "$") return "body";
        return path.StartsWith("$.", StringComparison.Ordinal) ? path[2..] : path.TrimStart('$');
    }
}
