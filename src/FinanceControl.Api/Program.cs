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

// DATABASE_PATH (variável de ambiente) sobrescreve Database:Path; caminhos relativos resolvem a partir do diretório atual do processo.
var databasePath = builder.Configuration["DATABASE_PATH"] is { Length: > 0 } environmentPath
    ? environmentPath
    : builder.Configuration[$"{DatabaseOptions.SectionName}:Path"] ?? "data/finance.db";
builder.Services.AddSingleton(new DatabaseOptions { Path = databasePath });
builder.Services.TryAddSingleton(TimeProvider.System);
builder.Services.AddSingleton<SqliteConnectionFactory>();
builder.Services.AddSingleton<DatabaseMigrator>();
builder.Services.AddSingleton<IFinanceStore, SqliteFinanceStore>();
builder.Services.AddScoped<IFinanceUseCases, FinanceService>();
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

await app.Services.GetRequiredService<DatabaseMigrator>().MigrateAsync();

// Ao encerrar, consolida o WAL no arquivo .db (checkpoint TRUNCATE) e fecha as conexões do pool (o usuário versiona o banco).
// Limpa apenas o pool deste banco: ClearAllPools derrubaria conexões de outros hosts no mesmo processo (ex.: testes).
var connectionFactory = app.Services.GetRequiredService<SqliteConnectionFactory>();
app.Lifetime.ApplicationStopping.Register(() =>
{
    if (!connectionFactory.CheckpointAndClearPool()) app.Logger.LogWarning("Não foi possível consolidar o WAL ao encerrar.");
});

app.MapFinanceEndpoints();

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
    app.MapFallback(async context => await context.Response.SendFileAsync(Path.Combine(webRoot, "index.html")));
}

app.Run();

public partial class Program;
