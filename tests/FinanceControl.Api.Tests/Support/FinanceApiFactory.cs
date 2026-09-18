using FinanceControl.Api.Adapters.Background;
using FinanceControl.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FinanceControl.Api.Tests.Support;

/// <summary>Sobe a API com um banco temporário exclusivo (um diretório por instância) e um relógio controlável.</summary>
public sealed class FinanceApiFactory : WebApplicationFactory<Program>
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "finance-control-tests", Guid.NewGuid().ToString("N"));

    public FinanceApiFactory() => DatabasePath = Path.Combine(_directory, "finance.db");

    public string DatabasePath { get; }
    /// <summary>Falso para inspecionar os arquivos do banco depois de encerrar o host (o teste apaga o diretório).</summary>
    public bool DeleteOnDispose { get; init; } = true;
    public TestTimeProvider Time { get; } = new();
    /// <summary>Respostas falsas das APIs de mercado (nenhum teste acessa a rede).</summary>
    public FakeMarketHandler Http { get; } = new();

    public SqliteConnection OpenDatabase()
    {
        var connection = new SqliteConnection($"Data Source={DatabasePath};Pooling=False");
        connection.Open();
        return connection;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DatabaseOptions>();
            services.AddSingleton(new DatabaseOptions { Path = DatabasePath });
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Time);
            // Sem serviços em segundo plano (cotações e débito automático): os testes chamam os endpoints.
            foreach (var hosted in services.Where(item => item.ServiceType == typeof(IHostedService)
                         && (item.ImplementationType == typeof(MarketRefreshHostedService) || item.ImplementationType == typeof(AutoDebitHostedService))).ToList())
                services.Remove(hosted);
            services.ConfigureHttpClientDefaults(client => client.ConfigurePrimaryHttpMessageHandler(() => Http));
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing || !DeleteOnDispose) return;
        try { Directory.Delete(_directory, recursive: true); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}

/// <summary>Relógio de teste: fuso fixo UTC−3 (como o do usuário) e instante opcionalmente congelado.</summary>
public sealed class TestTimeProvider : TimeProvider
{
    private static readonly TimeZoneInfo SaoPaulo = TimeZoneInfo.CreateCustomTimeZone("teste-utc-3", TimeSpan.FromHours(-3), "UTC-3", "UTC-3");

    public DateTimeOffset? FixedUtcNow { get; set; }
    public override DateTimeOffset GetUtcNow() => FixedUtcNow ?? base.GetUtcNow();
    public override TimeZoneInfo LocalTimeZone => SaoPaulo;
}
