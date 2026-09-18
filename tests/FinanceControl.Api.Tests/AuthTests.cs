using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using FinanceControl.Application.Security;
using Microsoft.Data.Sqlite;
using Xunit;

namespace FinanceControl.Api.Tests;

public sealed class AuthTests
{
    private const string SessionRequired = "Sua sessão expirou ou não foi iniciada. Entre novamente.";

    [Theory]
    [InlineData("GET", "/api/state")]
    [InlineData("GET", "/api/about")]
    [InlineData("GET", "/api/backup/database")]
    [InlineData("POST", "/api/transactions")]
    [InlineData("GET", "/api/auth/me")]
    [InlineData("GET", "/api/nope")]
    public async Task Api_requires_a_session(string method, string url)
    {
        using var api = new FinanceApiFactory();
        var response = await api.CreateAnonymousClient().SendAsync(new HttpRequestMessage(new HttpMethod(method), url) { Content = JsonContent.Create(new { }) });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(SessionRequired, await TitleAsync(response));
    }

    [Fact]
    public async Task Health_and_the_login_page_are_public()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateAnonymousClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/health")).StatusCode);

        // A interface (tela de login) abre sem sessão, como HTML: com nosniff o navegador não adivinha o tipo.
        // Sem o build do frontend (dist ausente) não há página a servir.
        var page = await client.GetAsync("/");
        if (page.StatusCode == HttpStatusCode.NotFound) return;
        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        Assert.Equal("text/html", page.Content.Headers.ContentType?.MediaType);
        Assert.Equal("text/html", (await client.GetAsync("/#/configuracoes")).Content.Headers.ContentType?.MediaType);
        var icon = await client.GetAsync("/favicon.svg");
        Assert.Equal(HttpStatusCode.OK, icon.StatusCode);
        Assert.Equal("image/svg+xml", icon.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Register_signs_in_and_logout_ends_the_session()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateAnonymousClient();

        var register = await client.PostAsJsonAsync("/api/auth/register", new { username = "  Ana.Silva ", password = "uma senha longa" });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);
        var cookie = Assert.Single(register.Headers.GetValues("Set-Cookie"), value => value.StartsWith("fc_session=", StringComparison.Ordinal)).ToLowerInvariant();
        Assert.Contains("httponly", cookie);
        Assert.Contains("samesite=strict", cookie);
        Assert.Contains("expires=", cookie);

        var me = await client.GetJsonAsync("/api/auth/me");
        Assert.Equal("ana.silva", me.GetProperty("username").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/state")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/state")).StatusCode);
    }

    [Fact]
    public async Task Login_accepts_only_the_right_password_without_revealing_which_part_failed()
    {
        using var api = new FinanceApiFactory();
        _ = api.CreateClient();
        var client = api.CreateAnonymousClient();

        var wrongPassword = await client.PostAsJsonAsync("/api/auth/login", new { username = FinanceApiFactory.DefaultUsername, password = "senha-errada" });
        var unknownUser = await client.PostAsJsonAsync("/api/auth/login", new { username = "ninguem", password = "senha-errada" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownUser.StatusCode);
        Assert.Equal("Usuário ou senha inválidos.", await TitleAsync(wrongPassword));
        Assert.Equal(await TitleAsync(wrongPassword), await TitleAsync(unknownUser));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/state")).StatusCode);

        var login = await client.PostAsJsonAsync("/api/auth/login", new { username = "TESTE", password = FinanceApiFactory.DefaultPassword });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/state")).StatusCode);
    }

    [Theory]
    [InlineData("ab", "senha-valida", "username", "Use de 3 a 32 caracteres entre letras minúsculas, números, ponto, - e _.")]
    [InlineData("com espaco", "senha-valida", "username", "Use de 3 a 32 caracteres entre letras minúsculas, números, ponto, - e _.")]
    [InlineData("", "senha-valida", "username", "Campo obrigatório.")]
    [InlineData("valido", "curta", "password", "A senha deve ter entre 8 e 128 caracteres.")]
    [InlineData("valido", "", "password", "Campo obrigatório.")]
    public async Task Register_validates_username_and_password(string username, string password, string field, string message)
    {
        using var api = new FinanceApiFactory();
        var response = await api.CreateAnonymousClient().PostAsJsonAsync("/api/auth/register", new { username, password });
        Assert.Equal(message, await response.AssertValidationAsync(field));
    }

    [Fact]
    public async Task Usernames_are_unique_ignoring_case()
    {
        using var api = new FinanceApiFactory();
        _ = api.CreateClient();
        var response = await api.CreateAnonymousClient().PostAsJsonAsync("/api/auth/register", new { username = "Teste", password = "outra-senha-longa" });
        Assert.Equal("Este nome de usuário já está em uso.", await response.AssertValidationAsync("username"));
    }

    [Fact]
    public async Task Each_user_sees_and_changes_only_their_own_data()
    {
        using var api = new FinanceApiFactory();
        var owner = api.CreateClient();
        var other = await api.CreateUserClientAsync("outra");

        var ownerAccount = await owner.CreateAccountAsync("Conta da dona", 50_000);
        var ownerTransaction = await owner.CreateAsync("/api/transactions", new { date = "2026-09-01", description = "Mercado da dona", kind = "expense", amount_cents = 1000, payment_method = "pix" });
        await owner.SendJsonAsync(HttpMethod.Put, "/api/settings", new { display_name = "Dona" });

        Assert.Empty((await other.GetJsonAsync("/api/bank-accounts")).EnumerateArray());
        Assert.Empty((await other.GetJsonAsync("/api/transactions")).EnumerateArray());
        Assert.NotEqual("Dona", (await other.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("display_name").GetString());

        // Ids de outro usuário não existem para quem não é dono: nem leitura, nem alteração, nem remoção.
        await (await other.PutAsJsonAsync($"/api/transactions/{ownerTransaction}", new { description = "invadido" })).AssertNotFoundAsync();
        await (await other.DeleteAsync($"/api/transactions/{ownerTransaction}")).AssertNotFoundAsync();
        await (await other.PostAsJsonAsync($"/api/bank-accounts/{ownerAccount}/entries", new { date = "2026-09-01", description = "x", kind = "withdrawal", amount_cents = 1 })).AssertNotFoundAsync();

        var otherTransaction = await other.CreateAsync("/api/transactions", new { date = "2026-09-02", description = "Da outra", kind = "expense", amount_cents = 500, payment_method = "pix" });
        Assert.Equal(["Mercado da dona"], (await owner.GetJsonAsync("/api/transactions")).EnumerateArray().Select(item => item.GetProperty("description").GetString()));
        Assert.Equal(50_000, await owner.AccountBalanceAsync(ownerAccount));
        Assert.Equal("Da outra", (await other.RecordAsync("transactions", otherTransaction)).GetProperty("description").GetString());

        // Arquivos separados: backup e "sobre" mostram só o banco do próprio usuário.
        var ownerPath = (await owner.GetJsonAsync("/api/about")).GetProperty("database_path").GetString();
        var otherPath = (await other.GetJsonAsync("/api/about")).GetProperty("database_path").GetString();
        Assert.Equal(Path.GetFullPath(api.DatabasePath), ownerPath);
        Assert.Equal(Path.Combine(api.DataDirectory, "users", "2", "finance.db"), otherPath);
    }

    [Fact]
    public async Task Changing_requests_without_the_app_header_are_rejected()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/bills") { Content = JsonContent.Create(new { name = "Conta", amount_cents = 100 }) };
        request.Headers.Remove("X-Requested-With");
        client.DefaultRequestHeaders.Remove("X-Requested-With");

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Requisição recusada.", await TitleAsync(response));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/bills")).StatusCode);
        Assert.Empty((await client.GetJsonAsync("/api/bills")).EnumerateArray());
    }

    [Fact]
    public async Task Repeated_login_attempts_are_rate_limited()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateAnonymousClient();
        HttpResponseMessage last = null!;
        for (var attempt = 0; attempt < 11; attempt++)
            last = await client.PostAsJsonAsync("/api/auth/login", new { username = "alguem", password = "senha-errada" });

        Assert.Equal(HttpStatusCode.TooManyRequests, last.StatusCode);
        Assert.Equal("60", last.Headers.RetryAfter?.ToString());
        Assert.Equal("Muitas tentativas seguidas. Aguarde um minuto e tente novamente.", await TitleAsync(last));
    }

    [Fact]
    public async Task Responses_carry_security_headers_and_api_data_is_never_cached()
    {
        using var api = new FinanceApiFactory();
        var response = await api.CreateClient().GetAsync("/api/state");
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("no-referrer", response.Headers.GetValues("Referrer-Policy").Single());
        Assert.True(response.Headers.CacheControl?.NoStore);
    }

    [Fact]
    public async Task Passwords_are_stored_hashed_and_a_new_security_stamp_ends_existing_sessions()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/state")).StatusCode);

        await using (var accounts = new SqliteConnection($"Data Source={Path.Combine(api.DataDirectory, "accounts.db")};Pooling=False"))
        {
            await accounts.OpenAsync();
            var command = accounts.CreateCommand();
            command.CommandText = "SELECT password_hash FROM users WHERE id = 1";
            var hash = (string)(await command.ExecuteScalarAsync())!;
            Assert.StartsWith("pbkdf2-sha256$600000$", hash);
            Assert.DoesNotContain(FinanceApiFactory.DefaultPassword, hash);
            Assert.True(PasswordHasher.Verify(FinanceApiFactory.DefaultPassword, hash));
            Assert.False(PasswordHasher.Verify("senha-errada", hash));

            command.CommandText = "UPDATE users SET security_stamp = 'novo' WHERE id = 1";
            await command.ExecuteNonQueryAsync();
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/state")).StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("md5$abc")]
    [InlineData("pbkdf2-sha256$x$AAAA$AAAA")]
    [InlineData("pbkdf2-sha256$1000$não-base64$AAAA")]
    public void Malformed_hashes_never_verify(string stored) => Assert.False(PasswordHasher.Verify("qualquer-senha", stored));

    private static async Task<string?> TitleAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("title").GetString();
}
