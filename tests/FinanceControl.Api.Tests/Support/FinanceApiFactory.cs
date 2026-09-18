using System.Net;
using System.Net.Http.Json;
using FinanceControl.Api.Adapters.Background;
using FinanceControl.Api.Adapters.Http;
using FinanceControl.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FinanceControl.Api.Tests.Support;

/// <summary>
/// Sobe a API com uma pasta de dados temporária exclusiva (um diretório por instância) e um relógio controlável.
/// <see cref="WebApplicationFactory{TEntryPoint}.CreateClient()"/> devolve um cliente já autenticado como o usuário
/// padrão (o primeiro cadastrado, id 1); <see cref="CreateAnonymousClient"/> e <see cref="CreateUserClientAsync"/>
/// cobrem os demais casos.
/// </summary>
public sealed class FinanceApiFactory : WebApplicationFactory<Program>
{
    public const string DefaultUsername = "teste";
    public const string DefaultPassword = "senha-de-teste";

    private readonly string _directory = Path.Combine(Path.GetTempPath(), "finance-control-tests", Guid.NewGuid().ToString("N"));
    private readonly Lazy<string> _defaultCookie;
    private bool _anonymous;

    public FinanceApiFactory()
    {
        DatabasePath = Path.Combine(_directory, "users", "1", "finance.db");
        ClientOptions.HandleCookies = false;
        _defaultCookie = new Lazy<string>(() => RegisterAsync(DefaultUsername, DefaultPassword).GetAwaiter().GetResult());
    }

    /// <summary>Banco financeiro do usuário padrão.</summary>
    public string DatabasePath { get; }
    public string DataDirectory => _directory;
    /// <summary>Falso para inspecionar os arquivos do banco depois de encerrar o host (o teste apaga o diretório).</summary>
    public bool DeleteOnDispose { get; init; } = true;
    public TestTimeProvider Time { get; } = new();
    /// <summary>Respostas falsas das APIs de mercado (nenhum teste acessa a rede).</summary>
    public FakeMarketHandler Http { get; } = new();

    public SqliteConnection OpenDatabase()
    {
        _ = _defaultCookie.Value;
        var connection = new SqliteConnection($"Data Source={DatabasePath};Pooling=False");
        connection.Open();
        return connection;
    }

    /// <summary>Cliente sem sessão (guarda cookies: o login feito por ele vale nas requisições seguintes).</summary>
    public HttpClient CreateAnonymousClient()
    {
        _anonymous = true;
        try { return CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true }); }
        finally { _anonymous = false; }
    }

    /// <summary>Cadastra outro usuário e devolve um cliente autenticado como ele.</summary>
    public async Task<HttpClient> CreateUserClientAsync(string username, string password = DefaultPassword)
    {
        var cookie = await RegisterAsync(username, password);
        var client = CreateAnonymousClient();
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return client;
    }

    protected override void ConfigureClient(HttpClient client)
    {
        base.ConfigureClient(client);
        client.DefaultRequestHeaders.Add(Security.RequestHeader, Security.RequestHeaderValue);
        if (!_anonymous) client.DefaultRequestHeaders.Add("Cookie", _defaultCookie.Value);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DataOptions>();
            services.AddSingleton(new DataOptions { Directory = _directory });
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Time);
            // Sem serviços em segundo plano (cotações e débito automático): os testes chamam os endpoints.
            foreach (var hosted in services.Where(item => item.ServiceType == typeof(IHostedService)
                         && (item.ImplementationType == typeof(MarketRefreshHostedService) || item.ImplementationType == typeof(AutoDebitHostedService))).ToList())
                services.Remove(hosted);
            services.ConfigureHttpClientDefaults(client => client.ConfigurePrimaryHttpMessageHandler(() => Http));
        });
    }

    /// <summary>Cadastra pela API e devolve o cookie de sessão (<c>nome=valor</c>).</summary>
    private async Task<string> RegisterAsync(string username, string password)
    {
        using var client = Server.CreateClient();
        client.DefaultRequestHeaders.Add(Security.RequestHeader, Security.RequestHeaderValue);
        var response = await client.PostAsJsonAsync("/api/auth/register", new { username, password });
        if (response.StatusCode != HttpStatusCode.Created)
            throw new InvalidOperationException($"Cadastro de '{username}' falhou: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        return response.Headers.GetValues("Set-Cookie").Single(value => value.StartsWith("fc_session=", StringComparison.Ordinal)).Split(';')[0];
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
