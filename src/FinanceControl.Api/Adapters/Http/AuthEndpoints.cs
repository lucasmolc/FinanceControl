using System.Security.Claims;
using FinanceControl.Application.Common;
using FinanceControl.Application.Ports;
using FinanceControl.Domain.Entities;
using FinanceControl.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace FinanceControl.Api.Adapters.Http;

/// <summary>Cadastro livre, login, logout e usuário atual. A sessão é um cookie HttpOnly/SameSite=Strict de 30 dias renovado no uso.</summary>
public static class AuthEndpoints
{
    public const string StampClaim = "fc:stamp";
    public const string RateLimitPolicy = "auth";

    public sealed record Credentials(string? Username, string? Password);

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/auth");
        group.MapPost("/register", async (Credentials body, IAccountUseCases accounts, UserDatabaseScope database, HttpContext context) =>
        {
            var result = accounts.Register(body.Username, body.Password);
            if (!result.IsSuccess) return FinanceEndpoints.ToHttp(result, _ => Results.Empty);
            // O banco do usuário nasce com a conta (vazio e migrado), antes da primeira sessão.
            await database.EnterAsync(result.Value!.Id);
            await SignInAsync(context, result.Value!);
            return Results.Created("/api/auth/me", Me(result.Value!));
        }).AllowAnonymous().RequireRateLimiting(RateLimitPolicy);

        group.MapPost("/login", async (Credentials body, IAccountUseCases accounts, HttpContext context) =>
        {
            if (accounts.Authenticate(body.Username, body.Password) is not { } account)
                return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: Messages.InvalidCredentials);
            await SignInAsync(context, account);
            return Results.Ok(Me(account));
        }).AllowAnonymous().RequireRateLimiting(RateLimitPolicy);

        group.MapPost("/logout", async (HttpContext context) =>
        {
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        }).AllowAnonymous();

        group.MapGet("/me", (ClaimsPrincipal user) => Results.Ok(new
        {
            id = long.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!, System.Globalization.CultureInfo.InvariantCulture),
            username = user.Identity!.Name
        }));
        return endpoints;
    }

    private static object Me(UserAccount account) => new { id = account.Id, username = account.Username };

    private static Task SignInAsync(HttpContext context, UserAccount account)
    {
        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, account.Id.ToString(System.Globalization.CultureInfo.InvariantCulture)),
            new Claim(ClaimTypes.Name, account.Username),
            new Claim(StampClaim, account.SecurityStamp)
        ], CookieAuthenticationDefaults.AuthenticationScheme);
        return context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity), new AuthenticationProperties { IsPersistent = true });
    }
}
