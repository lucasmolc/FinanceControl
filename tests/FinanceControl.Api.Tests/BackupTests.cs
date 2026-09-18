using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

public sealed class BackupTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Backup_restore_round_trip_restores_data_and_keeps_a_safety_copy()
    {
        var category = await _client.CreateAsync("/api/categories", new { name = "Backup", kind = "expense" });
        var account = await _client.CreateAccountAsync("Conta backup", 1000);
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-07-01", description = "Antes", kind = "expense", amount_cents = 100, category_id = category, account_id = account });
        await _client.CreateAsync($"/api/bank-accounts/{account}/entries", new { date = "2026-07-02", kind = "deposit", amount_cents = 500 });

        var original = await DownloadBackupAsync();
        Assert.Equal(3, original["version"]!.GetValue<int>());

        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-07-03", description = "Depois", kind = "income", amount_cents = 999, account_id = account });
        await _client.DeleteAsync($"/api/categories/{category}");
        await _client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { display_name = "Mudou" });

        var result = await _client.SendJsonAsync(HttpMethod.Post, "/api/backup/restore", original);
        Assert.True(result.GetProperty("ok").GetBoolean());
        var safetyCopy = result.GetProperty("safety_copy").GetString()!;
        Assert.True(File.Exists(safetyCopy), safetyCopy);
        Assert.StartsWith(Path.Combine(Path.GetDirectoryName(factory.DatabasePath)!, "backups", "antes-da-restauracao-"), safetyCopy);
        Assert.Equal(1, result.GetProperty("restored").GetProperty("transactions").GetInt64());
        Assert.Equal(1, result.GetProperty("restored").GetProperty("settings").GetInt64());

        var restored = await DownloadBackupAsync();
        Assert.Equal(DataWithoutMigrations(original), DataWithoutMigrations(restored));
        Assert.Equal(1400, await _client.AccountBalanceAsync(account));
    }

    [Fact]
    public async Task Restore_with_unknown_column_is_rejected_without_changing_data()
    {
        await _client.CreateAsync("/api/bills", new { name = "Conta fixa", amount_cents = 1000 });
        var before = await DownloadBackupAsync();
        var tampered = JsonNode.Parse(before.ToJsonString())!.AsObject();
        tampered["data"]!["bills"]![0]!["bogus"] = 1;
        tampered["data"]!["transactions"] = new JsonArray();

        var response = await _client.PostAsync("/api/backup/restore", new StringContent(tampered.ToJsonString(), Encoding.UTF8, "application/json"));
        Assert.Equal("Coluna inexistente no banco atual.", await response.AssertValidationAsync("bills.bogus"));
        Assert.Equal(DataWithoutMigrations(before), DataWithoutMigrations(await DownloadBackupAsync()));
    }

    [Theory]
    [InlineData("{\"version\":1,\"data\":{}}", "version")]
    [InlineData("{\"version\":3}", "data")]
    [InlineData("{\"version\":3,\"data\":{\"hackers\":[]}}", "data.hackers")]
    [InlineData("{\"version\":3,\"data\":{\"bills\":{}}}", "data.bills")]
    [InlineData("{\"version\":3,\"data\":{\"settings\":[{\"id\":2}]}}", "data.settings")]
    [InlineData("{\"version\":3,\"data\":{\"bills\":[{\"name\":{\"x\":1}}]}}", "bills.name")]
    [InlineData("[]", "body")]
    public async Task Invalid_backup_documents_are_rejected(string document, string field)
    {
        var response = await _client.PostAsync("/api/backup/restore", new StringContent(document, Encoding.UTF8, "application/json"));
        await response.AssertValidationAsync(field);
    }

    [Fact]
    public async Task Restore_with_broken_references_rolls_back()
    {
        await _client.CreateAsync("/api/categories", new { name = "Fica", kind = "expense" });
        var before = await DownloadBackupAsync();
        var broken = JsonNode.Parse(before.ToJsonString())!.AsObject();
        broken["data"]!["transactions"] = new JsonArray(new JsonObject
        {
            ["id"] = 1, ["date"] = "2026-01-01", ["description"] = "Órfã", ["kind"] = "expense", ["amount_cents"] = 10, ["category_id"] = 424242
        });

        var response = await _client.PostAsync("/api/backup/restore", new StringContent(broken.ToJsonString(), Encoding.UTF8, "application/json"));
        Assert.Equal("O backup contém referências inválidas entre registros.", await response.AssertValidationAsync("data"));
        Assert.Equal(DataWithoutMigrations(before), DataWithoutMigrations(await DownloadBackupAsync()));
    }

    [Fact]
    public async Task Database_backup_is_a_sqlite_file_attachment()
    {
        var response = await _client.GetAsync("/api/backup/database");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/vnd.sqlite3", response.Content.Headers.ContentType?.MediaType);
        Assert.Matches(@"^lmm-finance-\d{4}-\d{2}-\d{2}\.db$", response.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal("SQLite format 3\0", Encoding.ASCII.GetString(bytes, 0, 16));
    }

    private async Task<JsonObject> DownloadBackupAsync()
    {
        var response = await _client.GetAsync("/api/backup");
        response.EnsureSuccessStatusCode();
        return JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
    }

    private static string DataWithoutMigrations(JsonObject document)
    {
        var data = JsonNode.Parse(document["data"]!.ToJsonString())!.AsObject();
        data.Remove("schema_migrations");
        return data.ToJsonString(new JsonSerializerOptions { WriteIndented = false });
    }
}
