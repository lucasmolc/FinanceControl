using System.Text.Json;
using FinanceControl.Api.Adapters.Background;
using FinanceControl.Api.Adapters.Http;
using FinanceControl.Application.Ports;
using FinanceControl.Application.UseCases;
using FinanceControl.Infrastructure.Market;
using FinanceControl.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    options.SerializerOptions.DictionaryKeyPolicy = null;
});
builder.Services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddOpenApi();

// DATA_DIRECTORY (variável de ambiente) sobrescreve Database:Directory; caminhos relativos resolvem a partir do diretório atual do processo.
var dataDirectory = builder.Configuration["DATA_DIRECTORY"] is { Length: > 0 } environmentDirectory
    ? environmentDirectory
    : builder.Configuration[$"{DataOptions.SectionName}:Directory"] ?? "data";
builder.Services.AddSingleton(new DataOptions { Directory = dataDirectory });
builder.Services.TryAddSingleton(TimeProvider.System);
builder.Services.AddSingleton<UserDatabases>();
builder.Services.AddSingleton<IAccountStore, SqliteAccountStore>();
builder.Services.AddSingleton<IAccountUseCases, AccountService>();
// Dados financeiros: o banco do usuário autenticado (ou do job em segundo plano) — ver UserDatabaseScope.
builder.Services.AddScoped<UserDatabaseScope>();
builder.Services.AddScoped(services => services.GetRequiredService<UserDatabaseScope>().Database);
builder.Services.AddScoped<IFinanceStore, SqliteFinanceStore>();
builder.Services.AddScoped<IFinanceUseCases, FinanceService>();
builder.Services.AddFinanceSecurity(Path.GetFullPath(dataDirectory, Directory.GetCurrentDirectory()));
// Cotações e indicadores públicos (AwesomeAPI, CoinGecko, BCB SGS): timeout de 8 s por requisição.
builder.Services.AddHttpClient<IMarketDataSource, PublicMarketDataSource>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(8);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("LMM-Finance-Control/1.2");
    client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
});
builder.Services.AddHostedService<MarketRefreshHostedService>();
builder.Services.AddHostedService<AutoDebitHostedService>();

var app = builder.Build();

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Migra o banco de contas e o de cada usuário já cadastrado (o banco de um usuário novo nasce no cadastro).
var userDatabases = app.Services.GetRequiredService<UserDatabases>();
await userDatabases.MigrateAccountsAsync();
foreach (var userId in app.Services.GetRequiredService<IAccountUseCases>().ListUserIds())
    await userDatabases.OpenAsync(userId);

// Ao encerrar, consolida o WAL nos arquivos .db (checkpoint TRUNCATE) e fecha as conexões do pool (o usuário versiona o banco).
// Limpa apenas o pool destes bancos: ClearAllPools derrubaria conexões de outros hosts no mesmo processo (ex.: testes).
app.Lifetime.ApplicationStopping.Register(() =>
{
    if (!userDatabases.CheckpointAll()) app.Logger.LogWarning("Não foi possível consolidar o WAL ao encerrar.");
});

app.UseSecurityHeaders();

// A interface (inclusive a tela de login) é pública; os dados só saem pela API, que exige sessão.
var webRoot = new[]
{
    Path.Combine(AppContext.BaseDirectory, "web"),
    Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", "FinanceControl.Web", "dist"))
}.FirstOrDefault(Directory.Exists);

if (webRoot is not null)
{
    var files = new PhysicalFileProvider(webRoot);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = files });
}

app.UseFinanceAuthentication();
app.MapAuthEndpoints();
app.MapFinanceEndpoints();

if (webRoot is not null)
{
    app.MapFallback(async context =>
    {
        // Tipo explícito: com X-Content-Type-Options: nosniff o navegador não adivinha que é HTML.
        context.Response.ContentType = "text/html; charset=utf-8";
        await context.Response.SendFileAsync(Path.Combine(webRoot, "index.html"));
    }).AllowAnonymous();
}

app.Run();

public partial class Program;
