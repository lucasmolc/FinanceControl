using System.Globalization;
using System.Security.Claims;
using System.Threading.RateLimiting;
using FinanceControl.Application.Common;
using FinanceControl.Application.Ports;
using FinanceControl.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;

namespace FinanceControl.Api.Adapters.Http;

/// <summary>
/// Autenticação por cookie, autorização obrigatória em toda a API (exceto os endpoints marcados como anônimos), limite
/// de tentativas de login/cadastro, verificação anti-CSRF, cabeçalhos de segurança e escolha do banco do usuário.
/// </summary>
public static class Security
{
    /// <summary>Cabeçalho exigido em requisições que alteram dados: formulários de outros sites não conseguem enviá-lo.</summary>
    public const string RequestHeader = "X-Requested-With";
    public const string RequestHeaderValue = "FinanceControl";

    public static IServiceCollection AddFinanceSecurity(this IServiceCollection services, string dataDirectory)
    {
        // Chaves que cifram o cookie de sessão: persistidas na pasta de dados (sessões sobrevivem a reinícios) e, no Windows,
        // protegidas pelo DPAPI do usuário que executa o servidor.
        var dataProtection = services.AddDataProtection()
            .SetApplicationName("LMM Finance Control")
            .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataDirectory, "keys")));
        if (OperatingSystem.IsWindows()) dataProtection.ProtectKeysWithDpapi();

        services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
        {
            options.Cookie.Name = "fc_session";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
            options.ExpireTimeSpan = TimeSpan.FromDays(30);
            options.SlidingExpiration = true;
            // A validade da sessão segue o relógio real, não o relógio de negócio (que os testes congelam).
            options.TimeProvider = TimeProvider.System;
            options.Events.OnRedirectToLogin = context => WriteProblemAsync(context.HttpContext, StatusCodes.Status401Unauthorized, Messages.SessionRequired);
            options.Events.OnRedirectToAccessDenied = context => WriteProblemAsync(context.HttpContext, StatusCodes.Status403Forbidden, Messages.RequestRejected);
            options.Events.OnValidatePrincipal = async context =>
            {
                var accounts = context.HttpContext.RequestServices.GetRequiredService<IAccountUseCases>();
                if (TryGetUserId(context.Principal, out var userId) && accounts.IsSessionValid(userId, context.Principal!.FindFirstValue(AuthEndpoints.StampClaim))) return;
                context.RejectPrincipal();
                await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            };
        });

        services.AddAuthorization(options => options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

        services.AddRateLimiter(options =>
        {
            options.AddPolicy(AuthEndpoints.RateLimitPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "desconhecido",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
            options.OnRejected = async (context, _) =>
            {
                context.HttpContext.Response.Headers.RetryAfter = "60";
                await WriteProblemAsync(context.HttpContext, StatusCodes.Status429TooManyRequests, Messages.TooManyAttempts);
            };
        });
        return services;
    }

    /// <summary>Cabeçalhos de segurança e verificação anti-CSRF: antes de tudo, inclusive dos arquivos estáticos.</summary>
    public static WebApplication UseSecurityHeaders(this WebApplication app)
    {
        app.Use(async (context, next) =>
        {
            var headers = context.Response.Headers;
            headers.XContentTypeOptions = "nosniff";
            headers.XFrameOptions = "DENY";
            headers["Referrer-Policy"] = "no-referrer";
            headers.ContentSecurityPolicy = "frame-ancestors 'none'";
            var isApi = context.Request.Path.StartsWithSegments("/api");
            // Dados financeiros nunca ficam no cache do navegador ou de proxies.
            if (isApi) headers.CacheControl = "no-store";
            if (isApi && !IsSafe(context.Request.Method) && context.Request.Headers[RequestHeader] != RequestHeaderValue)
            {
                await WriteProblemAsync(context, StatusCodes.Status403Forbidden, Messages.RequestRejected);
                return;
            }
            await next();
        });
        return app;
    }

    /// <summary>
    /// Sessão, limite de tentativas e autorização. Vem depois dos arquivos estáticos da interface (públicos): a política
    /// padrão exige usuário autenticado inclusive em requisições sem endpoint.
    /// </summary>
    public static WebApplication UseFinanceAuthentication(this WebApplication app)
    {
        app.UseRouting();
        app.UseRateLimiter();
        app.UseAuthentication();
        app.Use(async (context, next) =>
        {
            if (TryGetUserId(context.User, out var userId))
                await context.RequestServices.GetRequiredService<UserDatabaseScope>().EnterAsync(userId);
            await next();
        });
        app.UseAuthorization();
        return app;
    }

    private static bool IsSafe(string method) => HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);

    private static bool TryGetUserId(ClaimsPrincipal? principal, out long userId)
    {
        userId = 0;
        return principal?.Identity?.IsAuthenticated == true
            && long.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), NumberStyles.None, CultureInfo.InvariantCulture, out userId);
    }

    private static async Task WriteProblemAsync(HttpContext context, int status, string title)
    {
        context.Response.StatusCode = status;
        await context.RequestServices.GetRequiredService<IProblemDetailsService>().WriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = new ProblemDetails { Status = status, Title = title }
        });
    }
}
