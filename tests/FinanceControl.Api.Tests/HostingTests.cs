using System.Net;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

public sealed class HostingTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Theory]
    [InlineData("/api/nope")]
    [InlineData("/api/transactions/abc")]
    [InlineData("/api/deep/unknown/route")]
    public async Task Unknown_api_routes_return_json_404(string url)
    {
        var response = await _client.GetAsync(url);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(404, problem.GetProperty("status").GetInt32());
        Assert.False(string.IsNullOrEmpty(problem.GetProperty("title").GetString()));
    }

    [Fact]
    public async Task About_reports_database_path_and_schema_version()
    {
        var about = await _client.GetJsonAsync("/api/about");
        Assert.Equal(Path.GetFullPath(factory.DatabasePath), about.GetProperty("database_path").GetString());
        Assert.Equal("010_imports_and_installments", about.GetProperty("schema_version").GetString());
    }

    [Fact]
    public async Task Stopping_the_host_checkpoints_the_wal_into_the_database_file()
    {
        var host = new FinanceApiFactory { DeleteOnDispose = false };
        var directory = Path.GetDirectoryName(host.DatabasePath)!;
        try
        {
            var client = host.CreateClient();
            for (var index = 0; index < 20; index++)
                await client.CreateAsync("/api/bills", new { name = $"Conta WAL {index}", amount_cents = 100 + index });
            Assert.True(new FileInfo(host.DatabasePath + "-wal") is { Exists: true, Length: > 0 }, "o WAL deveria ter conteúdo antes do encerramento");

            host.Dispose();

            var wal = new FileInfo(host.DatabasePath + "-wal");
            Assert.True(!wal.Exists || wal.Length == 0, "o WAL deveria estar vazio ou ausente após encerrar");
            using var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={host.DatabasePath};Pooling=False");
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT COUNT(*) FROM bills WHERE name LIKE 'Conta WAL %'";
            Assert.Equal(20L, (long)command.ExecuteScalar()!);
        }
        finally
        {
            host.Dispose();
            try { Directory.Delete(directory, recursive: true); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    [Fact]
    public async Task Requests_with_foreign_host_header_are_rejected()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/health");
        request.Headers.Host = "attacker.example";
        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var local = new HttpRequestMessage(HttpMethod.Get, "/api/health");
        local.Headers.Host = "127.0.0.1:5074";
        Assert.Equal(HttpStatusCode.OK, (await _client.SendAsync(local)).StatusCode);
    }
}
