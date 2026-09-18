using System.Net;
using System.Net.Http.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

public sealed class ValidationTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Theory]
    [InlineData("bills", "{\"name\":\"Luz\",\"amount_cents\":-5}", "amount_cents", "O valor deve ser maior que zero.")]
    [InlineData("transactions", "{\"date\":\"2026-01-01\",\"description\":\"X\",\"kind\":\"expense\",\"amount_cents\":0}", "amount_cents", "O valor deve ser maior que zero.")]
    [InlineData("categories", "{\"name\":\"C\",\"kind\":\"expense\",\"monthly_budget_cents\":-1}", "monthly_budget_cents", "O valor não pode ser negativo.")]
    [InlineData("cards", "{\"name\":\"C\",\"real_limit_cents\":-1}", "real_limit_cents", "O valor não pode ser negativo.")]
    [InlineData("goals", "{\"name\":\"G\",\"target_cents\":100,\"current_cents\":-1}", "current_cents", "O valor não pode ser negativo.")]
    [InlineData("transactions", "{\"date\":\"2026-01-01\",\"description\":\"X\",\"kind\":\"salary\",\"amount_cents\":10}", "kind", "Opção inválida.")]
    [InlineData("transactions", "{\"date\":\"2026-01-01\",\"description\":\"X\",\"kind\":\"expense\",\"amount_cents\":10,\"payment_method\":\"bitcoin\"}", "payment_method", "Opção inválida.")]
    [InlineData("bank-accounts", "{\"name\":\"A\",\"institution\":\"B\",\"account_type\":\"offshore\"}", "account_type", "Opção inválida.")]
    [InlineData("goals", "{\"name\":\"G\",\"target_cents\":100,\"type\":\"yacht\"}", "type", "Opção inválida.")]
    [InlineData("investments", "{\"name\":\"I\",\"type\":\"nft\"}", "type", "Opção inválida.")]
    [InlineData("subscriptions", "{\"name\":\"S\",\"amount_cents\":10,\"frequency\":\"daily\"}", "frequency", "Opção inválida.")]
    [InlineData("categories", "{\"name\":\"C\",\"kind\":\"other\"}", "kind", "Opção inválida.")]
    [InlineData("transactions", "{\"date\":\"2026-02-30\",\"description\":\"X\",\"kind\":\"expense\",\"amount_cents\":10}", "date", "Use uma data válida no formato AAAA-MM-DD.")]
    [InlineData("goals", "{\"name\":\"G\",\"target_cents\":100,\"target_date\":\"31/12/2026\"}", "target_date", "Use uma data válida no formato AAAA-MM-DD.")]
    [InlineData("subscriptions", "{\"name\":\"S\",\"amount_cents\":10,\"next_billing_date\":\"2026-1-5\"}", "next_billing_date", "Use uma data válida no formato AAAA-MM-DD.")]
    [InlineData("transactions", "{\"date\":\"2026-01-01\",\"description\":\"X\",\"kind\":\"expense\",\"amount_cents\":10,\"category_id\":999999}", "category_id", "Categoria não encontrada.")]
    [InlineData("subscriptions", "{\"name\":\"S\",\"amount_cents\":10,\"card_id\":999999}", "card_id", "Cartão não encontrado.")]
    [InlineData("transactions", "{\"date\":\"2026-01-01\",\"description\":\"X\",\"kind\":\"expense\",\"amount_cents\":10,\"account_id\":999999}", "account_id", "Conta bancária não encontrada ou inativa.")]
    [InlineData("bills", "{\"name\":\"Luz\",\"amount_cents\":10,\"category_id\":0}", "category_id", "Categoria não encontrada.")]
    [InlineData("bills", "{\"name\":\"Luz\",\"amount_cents\":10,\"due_day\":32}", "due_day", "O dia deve estar entre 1 e 31.")]
    [InlineData("cards", "{\"name\":\"C\",\"closing_day\":0}", "closing_day", "O dia deve estar entre 1 e 31.")]
    [InlineData("goals", "{\"name\":\"G\",\"target_cents\":100,\"currency\":\"brl\"}", "currency", "Use o código da moeda com 3 letras maiúsculas, como BRL.")]
    [InlineData("bills", "{\"name\":\"Luz\",\"amount_cents\":\"100\"}", "amount_cents", "Valor inválido.")]
    [InlineData("bills", "{\"name\":\"Luz\",\"amount_cents\":10.5}", "amount_cents", "Valor inválido.")]
    [InlineData("bills", "{\"name\":\"Luz\",\"amount_cents\":10,\"recurring\":\"sim\"}", "recurring", "Valor inválido.")]
    [InlineData("bills", "{\"name\":123,\"amount_cents\":10}", "name", "Valor inválido.")]
    [InlineData("bills", "{\"name\":\"Luz\",\"amount_cents\":10,\"due_day\":[1]}", "due_day", "Valor inválido.")]
    [InlineData("bills", "{\"name\":\"Luz\",\"amount_cents\":10,\"category_id\":\"1\"}", "category_id", "Valor inválido.")]
    [InlineData("bills", "{\"name\":\"Luz\",\"amount_cents\":10,\"paid\":true}", "paid", "Campo não permitido.")]
    [InlineData("transactions", "{\"id\":5,\"date\":\"2026-01-01\",\"description\":\"X\",\"kind\":\"expense\",\"amount_cents\":10}", "id", "Campo não permitido.")]
    [InlineData("bills", "{\"name\":\"   \",\"amount_cents\":10}", "name", "Campo obrigatório.")]
    [InlineData("bank-accounts", "{\"name\":\"Conta\"}", "institution", "Campo obrigatório.")]
    public async Task Invalid_record_input_returns_portuguese_field_error(string module, string body, string field, string message)
    {
        var response = await _client.PostRawAsync($"/api/{module}", body);
        Assert.Equal(message, await response.AssertValidationAsync(field));
    }

    [Fact]
    public async Task Text_limits_are_enforced()
    {
        var longName = new string('a', 121);
        Assert.Equal("Use no máximo 120 caracteres.", await (await _client.PostAsJsonAsync("/api/bills", new { name = longName, amount_cents = 10 })).AssertValidationAsync("name"));
        Assert.Equal("Use no máximo 160 caracteres.", await (await _client.PostAsJsonAsync("/api/transactions", new { payment_method = "pix", date = "2026-01-01", description = new string('d', 161), kind = "expense", amount_cents = 10 })).AssertValidationAsync("description"));
        Assert.Equal("Use no máximo 500 caracteres.", await (await _client.PostAsJsonAsync("/api/goals", new { name = "G", target_cents = 10, notes = new string('n', 501) })).AssertValidationAsync("notes"));
        Assert.Equal("Use no máximo 80 caracteres.", await (await _client.PostAsJsonAsync("/api/investments", new { name = "I", benchmark = new string('b', 81) })).AssertValidationAsync("benchmark"));
    }

    [Fact]
    public async Task Create_requires_every_mandatory_field_and_reports_all()
    {
        var response = await _client.PostRawAsync("/api/transactions", "{}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("errors");
        foreach (var field in new[] { "date", "description", "kind", "amount_cents" })
            Assert.Equal("Campo obrigatório.", errors.GetProperty(field)[0].GetString());
    }

    [Fact]
    public async Task Strings_are_trimmed_and_optional_blanks_become_null()
    {
        var id = await _client.CreateAsync("/api/goals", new { name = "  Reserva  ", target_cents = 1000, notes = "   ", target_date = "" });
        var goal = await _client.RecordAsync("goals", id);
        Assert.Equal("Reserva", goal.GetProperty("name").GetString());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, goal.GetProperty("notes").ValueKind);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, goal.GetProperty("target_date").ValueKind);
        Assert.Equal("custom", goal.GetProperty("type").GetString());
        Assert.Equal("BRL", goal.GetProperty("currency").GetString());
    }

    [Fact]
    public async Task Update_validates_only_provided_fields()
    {
        var id = await _client.CreateAsync("/api/bills", new { name = "Água", amount_cents = 5000 });
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/bills/{id}", new { due_day = 15 });
        Assert.Equal("Informe ao menos um campo para atualização.", await (await _client.PutAsJsonAsync($"/api/bills/{id}", new { })).AssertValidationAsync("body"));
        Assert.Equal("Campo obrigatório.", await (await _client.PutAsJsonAsync($"/api/bills/{id}", new { name = (string?)null })).AssertValidationAsync("name"));
        Assert.Equal("Campo obrigatório.", await (await _client.PutAsJsonAsync($"/api/bills/{id}", new { due_day = (int?)null })).AssertValidationAsync("due_day"));
        Assert.Equal("O valor deve ser maior que zero.", await (await _client.PutAsJsonAsync($"/api/bills/{id}", new { amount_cents = 0 })).AssertValidationAsync("amount_cents"));
        var bill = await _client.RecordAsync("bills", id);
        Assert.Equal(15, bill.GetProperty("due_day").GetInt32());
        Assert.Equal(5000, bill.GetProperty("amount_cents").GetInt64());
    }

    [Fact]
    public async Task Inactive_bank_account_cannot_be_linked()
    {
        var accountId = await _client.CreateAccountAsync("Encerrada");
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/bank-accounts/{accountId}")).StatusCode);
        var response = await _client.PostAsJsonAsync("/api/transactions", new { payment_method = "pix", date = "2026-01-01", description = "X", kind = "expense", amount_cents = 10, account_id = accountId });
        Assert.Equal("Conta bancária não encontrada ou inativa.", await response.AssertValidationAsync("account_id"));
    }

    [Fact]
    public async Task Malformed_bodies_and_query_values_return_portuguese_errors()
    {
        Assert.Equal("Envie um objeto JSON.", await (await _client.PostRawAsync("/api/bills", "[]")).AssertValidationAsync("body"));
        Assert.Equal("O corpo da requisição não é um JSON válido.", await (await _client.PostRawAsync("/api/bills", "{\"name\":")).AssertValidationAsync("body"));
        var latin1 = new ByteArrayContent([.. "{\"name\":\"P"u8, 0xE3, .. "o\",\"amount_cents\":10}"u8]);
        latin1.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
        Assert.Equal("O corpo da requisição não é um JSON válido.", await (await _client.PostAsync("/api/bills", latin1)).AssertValidationAsync("body"));
        Assert.Equal("Valor inválido.", await (await _client.PutAsync("/api/settings", new StringContent("{\"monthly_net_income_cents\":\"abc\"}", System.Text.Encoding.UTF8, "application/json"))).AssertValidationAsync("monthly_net_income_cents"));
        Assert.Equal("Informe um valor entre 1 e 120.", await (await _client.PutAsJsonAsync("/api/settings", new { emergency_months_target = 0 })).AssertValidationAsync("emergency_months_target"));
        Assert.Equal("Use uma competência válida no formato AAAA-MM.", await (await _client.GetAsync("/api/summary?month=2026-13")).AssertValidationAsync("month"));
        Assert.Equal("Use uma competência válida no formato AAAA-MM.", await (await _client.GetAsync("/api/checklist?month=abc")).AssertValidationAsync("month"));
        Assert.Equal("Use uma competência válida no formato AAAA-MM.", await (await _client.GetAsync("/api/transactions?month=2026-1")).AssertValidationAsync("month"));
    }

    [Fact]
    public async Task Movement_inputs_are_validated()
    {
        var goalId = await _client.CreateAsync("/api/goals", new { name = "Meta", target_cents = 1000 });
        Assert.Equal("O valor deve ser maior que zero.", await (await _client.PostAsJsonAsync($"/api/goals/{goalId}/entries", new { date = "2026-01-01", amount_cents = 0 })).AssertValidationAsync("amount_cents"));
        Assert.Equal("Use uma data válida no formato AAAA-MM-DD.", await (await _client.PostAsJsonAsync($"/api/goals/{goalId}/entries", new { date = "ontem", amount_cents = 10 })).AssertValidationAsync("date"));

        var investmentId = await _client.CreateAsync("/api/investments", new { name = "CDB" });
        Assert.Equal("Opção inválida.", await (await _client.PostAsJsonAsync($"/api/investments/{investmentId}/entries", new { date = "2026-01-01", kind = "gift", amount_cents = 10 })).AssertValidationAsync("kind"));
        Assert.Equal("O resgate é maior que o saldo atual.", await (await _client.PostAsJsonAsync($"/api/investments/{investmentId}/entries", new { date = "2026-01-01", kind = "withdrawal", amount_cents = 10 })).AssertValidationAsync("amount_cents"));
        Assert.Equal("Opção inválida.", await (await _client.PostAsJsonAsync($"/api/goals/{goalId}/entries", new { date = "2026-01-01", amount_cents = 10, kind = "gift" })).AssertValidationAsync("kind"));

        var accountId = await _client.CreateAccountAsync("Origem");
        Assert.Equal("Selecione a conta de destino.", await (await _client.PostAsJsonAsync($"/api/bank-accounts/{accountId}/entries", new { date = "2026-01-01", kind = "transfer_out", amount_cents = 10 })).AssertValidationAsync("related_account_id"));
        Assert.Equal("A conta de destino deve ser diferente da origem.", await (await _client.PostAsJsonAsync($"/api/bank-accounts/{accountId}/entries", new { date = "2026-01-01", kind = "transfer_out", amount_cents = 10, related_account_id = accountId })).AssertValidationAsync("related_account_id"));
        Assert.Equal("Conta bancária não encontrada ou inativa.", await (await _client.PostAsJsonAsync($"/api/bank-accounts/{accountId}/entries", new { date = "2026-01-01", kind = "transfer_out", amount_cents = 10, related_account_id = 999999 })).AssertValidationAsync("related_account_id"));
        Assert.Equal("O valor deve ser maior que zero.", await (await _client.PostAsJsonAsync($"/api/bank-accounts/{accountId}/entries", new { date = "2026-01-01", kind = "deposit", amount_cents = -10 })).AssertValidationAsync("amount_cents"));

        Assert.Equal("Campo obrigatório.", await (await _client.PostAsJsonAsync("/api/checklist", new { month = "2026-01", paid = true })).AssertValidationAsync("bill_id"));
        Assert.Equal("Opção inválida.", await (await _client.PostAsJsonAsync("/api/checklist", new { bill_id = 1, month = "2026-01", paid = true, payment_method = "cheque" })).AssertValidationAsync("payment_method"));
    }
}
