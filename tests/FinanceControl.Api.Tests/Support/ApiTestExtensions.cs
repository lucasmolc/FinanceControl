using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace FinanceControl.Api.Tests.Support;

public static class ApiTestExtensions
{
    public static async Task<long> CreateAsync(this HttpClient client, string url, object body)
    {
        var response = await client.PostAsJsonAsync(url, body);
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Created, $"POST {url} → {(int)response.StatusCode}: {content}");
        var json = JsonDocument.Parse(content).RootElement;
        Assert.True(json.GetProperty("ok").GetBoolean());
        return json.GetProperty("id").GetInt64();
    }

    public static async Task<JsonElement> GetJsonAsync(this HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"GET {url} → {(int)response.StatusCode}: {content}");
        return JsonDocument.Parse(content).RootElement.Clone();
    }

    public static async Task<JsonElement> SendJsonAsync(this HttpClient client, HttpMethod method, string url, object? body = null, HttpStatusCode expected = HttpStatusCode.OK)
    {
        using var request = new HttpRequestMessage(method, url) { Content = body is null ? null : JsonContent.Create(body) };
        var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"{method} {url} → {(int)response.StatusCode} (esperado {(int)expected}): {content}");
        return content.Length == 0 ? default : JsonDocument.Parse(content).RootElement.Clone();
    }

    /// <summary>Confere um 400 ValidationProblem em pt-BR que nomeia o campo e devolve a mensagem.</summary>
    public static async Task<string> AssertValidationAsync(this HttpResponseMessage response, string field)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, $"esperado 400 para '{field}', recebido {(int)response.StatusCode}: {content}");
        var json = JsonDocument.Parse(content).RootElement;
        Assert.Equal("Dados inválidos.", json.GetProperty("title").GetString());
        Assert.True(json.GetProperty("errors").TryGetProperty(field, out var messages), $"campo '{field}' ausente em {content}");
        return messages[0].GetString()!;
    }

    public static async Task AssertNotFoundAsync(this HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.NotFound, $"esperado 404, recebido {(int)response.StatusCode}: {content}");
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("Registro não encontrado.", JsonDocument.Parse(content).RootElement.GetProperty("title").GetString());
    }

    public static Task<HttpResponseMessage> PostRawAsync(this HttpClient client, string url, string json) =>
        client.PostAsync(url, new StringContent(json, System.Text.Encoding.UTF8, "application/json"));

    public static async Task<long> AccountBalanceAsync(this HttpClient client, long accountId)
    {
        var accounts = await client.GetJsonAsync("/api/bank-accounts");
        return accounts.EnumerateArray().Single(account => account.GetProperty("id").GetInt64() == accountId).GetProperty("current_balance_cents").GetInt64();
    }

    public static async Task<JsonElement> RecordAsync(this HttpClient client, string module, long id)
    {
        var records = await client.GetJsonAsync($"/api/{module}");
        return records.EnumerateArray().Single(record => record.GetProperty("id").GetInt64() == id);
    }

    public static Task<long> CreateAccountAsync(this HttpClient client, string name, long balance = 0) =>
        client.CreateAsync("/api/bank-accounts", new { name, institution = "Banco Teste", current_balance_cents = balance });

    public static long? NullableInt64(this JsonElement element, string property) =>
        element.GetProperty(property).ValueKind == JsonValueKind.Null ? null : element.GetProperty(property).GetInt64();
}
