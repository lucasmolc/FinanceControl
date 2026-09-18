using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Contrato das melhorias de usabilidade (MEL-03, 04, 05, 09, 11 e 12).</summary>
public sealed class UsabilityTests : IClassFixture<FinanceApiFactory>
{
    private const string Today = "2026-09-17";
    private readonly FinanceApiFactory _factory;
    private readonly HttpClient _client;

    public UsabilityTests(FinanceApiFactory factory)
    {
        _factory = factory;
        // 23h30 em UTC−3 já é o dia seguinte em UTC: a data padrão deve seguir o fuso local.
        factory.Time.FixedUtcNow = new DateTimeOffset(2026, 9, 18, 2, 30, 0, TimeSpan.Zero);
        _client = factory.CreateClient();
    }

    // ---------- MEL-04: resgate em metas ----------

    [Fact]
    public async Task Goal_withdrawal_reduces_the_saved_amount_and_reversals_apply_the_inverse()
    {
        var goal = await _client.CreateAsync("/api/goals", new { name = "Reserva", target_cents = 100000 });
        var contribution = await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = "2026-01-01", amount_cents = 5000 });
        var firstWithdrawal = await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = "2026-01-02", kind = "withdrawal", amount_cents = 2000 });
        await AssertGoal(goal, 3000);

        var tooLarge = await _client.PostAsJsonAsync($"/api/goals/{goal}/entries", new { date = "2026-01-03", kind = "withdrawal", amount_cents = 3001 });
        Assert.Equal("O resgate é maior que o valor guardado na meta.", await tooLarge.AssertValidationAsync("amount_cents"));
        await AssertGoal(goal, 3000);

        var secondWithdrawal = await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = "2026-01-04", kind = "withdrawal", amount_cents = 3000 });
        await AssertGoal(goal, 0);
        var explicitContribution = await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = "2026-01-05", kind = "contribution", amount_cents = 100 });
        await AssertGoal(goal, 100);

        var entries = (await _client.GetJsonAsync($"/api/goals/{goal}/entries")).EnumerateArray().ToList();
        Assert.Equal([explicitContribution, secondWithdrawal, firstWithdrawal, contribution], entries.Select(item => item.GetProperty("id").GetInt64()));
        Assert.Equal(["contribution", "withdrawal", "withdrawal", "contribution"], entries.Select(item => item.GetProperty("kind").GetString()));
        Assert.All(entries, item => Assert.True(item.GetProperty("amount_cents").GetInt64() > 0));

        // Estornar o aporte inicial deixaria a meta negativa.
        var negative = await _client.DeleteAsync($"/api/goals/{goal}/entries/{contribution}");
        Assert.Equal("O estorno deixaria o valor acumulado da meta negativo.", await negative.AssertValidationAsync("amount_cents"));
        await AssertGoal(goal, 100);

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/goals/{goal}/entries/{secondWithdrawal}")).StatusCode);
        await AssertGoal(goal, 3100);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/goals/{goal}/entries/{firstWithdrawal}")).StatusCode);
        await AssertGoal(goal, 5100);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/goals/{goal}/entries/{contribution}")).StatusCode);
        await AssertGoal(goal, 100);
    }

    [Fact]
    public async Task Goal_withdrawal_requires_a_positive_amount()
    {
        var goal = await _client.CreateAsync("/api/goals", new { name = "Carro", target_cents = 1000, current_cents = 500 });
        var zero = await _client.PostAsJsonAsync($"/api/goals/{goal}/entries", new { date = "2026-01-01", kind = "withdrawal", amount_cents = 0 });
        Assert.Equal("O valor deve ser maior que zero.", await zero.AssertValidationAsync("amount_cents"));
        var negative = await _client.PostAsJsonAsync($"/api/goals/{goal}/entries", new { date = "2026-01-01", kind = "withdrawal", amount_cents = -10 });
        Assert.Equal("O valor deve ser maior que zero.", await negative.AssertValidationAsync("amount_cents"));
        await (await _client.PostAsJsonAsync("/api/goals/987654/entries", new { date = "2026-01-01", kind = "withdrawal", amount_cents = 1 })).AssertNotFoundAsync();
        await AssertGoal(goal, 500);
    }

    // ---------- MEL-03: resgate de investimento pelo custo médio ----------

    [Fact]
    public async Task Investment_withdrawal_reduces_invested_by_average_cost_and_reverses_exactly()
    {
        var investment = await _client.CreateAsync("/api/investments", new { name = "Fundo", type = "funds" });
        await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-01", kind = "deposit", amount_cents = 10000 });
        await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-02", kind = "yield", amount_cents = 2000 });

        var large = await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-03", kind = "withdrawal", amount_cents = 3000 });
        await AssertInvestment(investment, 7500, 9000); // 10000 × 3000 / 12000 = 2500
        var small = await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-04", kind = "withdrawal", amount_cents = 1 });
        await AssertInvestment(investment, 7499, 8999); // 7500 / 9000 = 0,83 → 1

        var tooLarge = await _client.PostAsJsonAsync($"/api/investments/{investment}/entries", new { date = "2026-01-05", kind = "withdrawal", amount_cents = 9000 });
        Assert.Equal("O resgate é maior que o saldo atual.", await tooLarge.AssertValidationAsync("amount_cents"));
        await AssertInvestment(investment, 7499, 8999);

        using (var connection = _factory.OpenDatabase())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = $"SELECT invested_delta_cents, current_delta_cents FROM investment_entries WHERE id={large}";
            using var reader = command.ExecuteReader();
            Assert.True(reader.Read());
            Assert.Equal(-2500L, reader.GetInt64(0));
            Assert.Equal(-3000L, reader.GetInt64(1));
        }

        // Estornos na ordem inversa e fora de ordem restauram exatamente os valores anteriores.
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/investments/{investment}/entries/{large}")).StatusCode);
        await AssertInvestment(investment, 9999, 11999);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/investments/{investment}/entries/{small}")).StatusCode);
        await AssertInvestment(investment, 10000, 12000);
    }

    [Fact]
    public async Task Investment_full_withdrawal_zeroes_the_position_and_zero_balance_rejects_withdrawals()
    {
        var investment = await _client.CreateAsync("/api/investments", new { name = "CDB perdido", invested_cents = 5000, current_cents = 4000 });
        var all = await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-02-01", kind = "withdrawal", amount_cents = 4000 });
        await AssertInvestment(investment, 0, 0);

        var fromZero = await _client.PostAsJsonAsync($"/api/investments/{investment}/entries", new { date = "2026-02-02", kind = "withdrawal", amount_cents = 1 });
        Assert.Equal("O resgate é maior que o saldo atual.", await fromZero.AssertValidationAsync("amount_cents"));

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/investments/{investment}/entries/{all}")).StatusCode);
        await AssertInvestment(investment, 5000, 4000);

        // Saldo atual zero com valor aplicado (ex.: ajuste para zero): qualquer resgate excede o saldo.
        var zeroed = await _client.CreateAsync("/api/investments", new { name = "Zerado", invested_cents = 800, current_cents = 0 });
        var rejected = await _client.PostAsJsonAsync($"/api/investments/{zeroed}/entries", new { date = "2026-02-03", kind = "withdrawal", amount_cents = 100 });
        Assert.Equal("O resgate é maior que o saldo atual.", await rejected.AssertValidationAsync("amount_cents"));
        await AssertInvestment(zeroed, 800, 0);
    }

    [Fact]
    public async Task Other_investment_movements_keep_their_previous_rules()
    {
        var investment = await _client.CreateAsync("/api/investments", new { name = "Ações", invested_cents = 1000, current_cents = 1000 });
        await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-03-01", kind = "deposit", amount_cents = 500 });
        await AssertInvestment(investment, 1500, 1500);
        await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-03-02", kind = "yield", amount_cents = 300 });
        await AssertInvestment(investment, 1500, 1800);
        await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-03-03", kind = "adjustment", amount_cents = 1200 });
        await AssertInvestment(investment, 1500, 1200);
    }

    // ---------- MEL-05: cobrança de assinatura ----------

    [Fact]
    public async Task Charge_uses_defaults_from_the_subscription_and_card()
    {
        var category = await _client.CreateAsync("/api/categories", new { name = "Streaming", kind = "expense" });
        var card = await _client.CreateAsync("/api/cards", new { name = "Cartão Roxo" });
        var subscription = await _client.CreateAsync("/api/subscriptions", new { name = "Filmes+", amount_cents = 3990, category_id = category, card_id = card });
        Assert.Equal(JsonValueKind.Null, (await _client.RecordAsync("subscriptions", subscription)).GetProperty("last_charge_date").ValueKind);

        var charge = await _client.SendJsonAsync(HttpMethod.Post, $"/api/subscriptions/{subscription}/charge", new { }, HttpStatusCode.Created);
        Assert.True(charge.GetProperty("ok").GetBoolean());
        Assert.Equal(Today, charge.GetProperty("charge_date").GetString());
        var transactionId = charge.GetProperty("transaction_id").GetInt64();

        var transaction = (await _client.GetJsonAsync($"/api/transactions?month=2026-09")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == transactionId);
        Assert.Equal(Today, transaction.GetProperty("date").GetString());
        Assert.Equal("Filmes+", transaction.GetProperty("description").GetString());
        Assert.Equal(category, transaction.GetProperty("category_id").GetInt64());
        Assert.Equal("expense", transaction.GetProperty("kind").GetString());
        Assert.Equal(3990, transaction.GetProperty("amount_cents").GetInt64());
        Assert.Equal("card", transaction.GetProperty("payment_method").GetString());
        Assert.Equal("Cobrança da assinatura Filmes+", transaction.GetProperty("notes").GetString());
        Assert.Equal(JsonValueKind.Null, transaction.GetProperty("account_id").ValueKind);

        Assert.Equal(Today, (await _client.RecordAsync("subscriptions", subscription)).GetProperty("last_charge_date").GetString());
        var state = await _client.GetJsonAsync("/api/state");
        var fromState = state.GetProperty("subscriptions").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == subscription);
        Assert.Equal(Today, fromState.GetProperty("last_charge_date").GetString());
    }

    [Fact]
    public async Task Charge_without_body_uses_defaults_and_without_card_pays_with_other()
    {
        var subscription = await _client.CreateAsync("/api/subscriptions", new { name = "Nuvem", amount_cents = 990 });
        var response = await _client.PostAsync($"/api/subscriptions/{subscription}/charge", null);
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Created, content);
        var transactionId = JsonDocument.Parse(content).RootElement.GetProperty("transaction_id").GetInt64();
        var transaction = (await _client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == transactionId);
        Assert.Equal("other", transaction.GetProperty("payment_method").GetString());
        Assert.Equal(JsonValueKind.Null, transaction.GetProperty("category_id").ValueKind);
    }

    [Fact]
    public async Task Charge_moves_the_account_rejects_duplicates_and_undo_allows_charging_again()
    {
        var account = await _client.CreateAccountAsync("Conta assinaturas", 10000);
        var card = await _client.CreateAsync("/api/cards", new { name = "Cartão" });
        var subscription = await _client.CreateAsync("/api/subscriptions", new { name = "Música", amount_cents = 2190, card_id = card });

        var charge = await _client.SendJsonAsync(HttpMethod.Post, $"/api/subscriptions/{subscription}/charge",
            new { date = "2026-08-10", amount_cents = 1234, account_id = account, payment_method = "pix" }, HttpStatusCode.Created);
        Assert.Equal("2026-08-10", charge.GetProperty("charge_date").GetString());
        var transactionId = charge.GetProperty("transaction_id").GetInt64();
        Assert.Equal(8766, await _client.AccountBalanceAsync(account));
        var transaction = (await _client.GetJsonAsync("/api/transactions?month=2026-08")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == transactionId);
        Assert.Equal("pix", transaction.GetProperty("payment_method").GetString());
        Assert.Equal(account, transaction.GetProperty("account_id").GetInt64());

        var duplicate = await _client.PostAsJsonAsync($"/api/subscriptions/{subscription}/charge", new { date = "2026-08-10", account_id = account });
        Assert.Equal("Esta cobrança já foi lançada.", await duplicate.AssertValidationAsync("date"));
        Assert.Equal(8766, await _client.AccountBalanceAsync(account));
        Assert.Single((await _client.GetJsonAsync("/api/transactions?month=2026-08")).EnumerateArray(), item => item.GetProperty("description").GetString() == "Música");

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/subscriptions/{subscription}/charge?date=2026-08-10")).StatusCode);
        Assert.Equal(10000, await _client.AccountBalanceAsync(account));
        Assert.DoesNotContain((await _client.GetJsonAsync("/api/transactions?month=2026-08")).EnumerateArray(), item => item.GetProperty("id").GetInt64() == transactionId);
        Assert.Equal(JsonValueKind.Null, (await _client.RecordAsync("subscriptions", subscription)).GetProperty("last_charge_date").ValueKind);
        await (await _client.DeleteAsync($"/api/subscriptions/{subscription}/charge?date=2026-08-10")).AssertNotFoundAsync();

        var again = await _client.SendJsonAsync(HttpMethod.Post, $"/api/subscriptions/{subscription}/charge", new { date = "2026-08-10" }, HttpStatusCode.Created);
        Assert.NotEqual(transactionId, again.GetProperty("transaction_id").GetInt64());
        Assert.Equal(10000, await _client.AccountBalanceAsync(account));
        Assert.Equal("2026-08-10", (await _client.RecordAsync("subscriptions", subscription)).GetProperty("last_charge_date").GetString());
    }

    [Fact]
    public async Task Last_charge_date_ignores_charges_whose_transaction_was_removed()
    {
        var subscription = await _client.CreateAsync("/api/subscriptions", new { name = "Jornal", amount_cents = 1500 });
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/subscriptions/{subscription}/charge", new { date = "2026-07-01" }, HttpStatusCode.Created);
        var august = await _client.SendJsonAsync(HttpMethod.Post, $"/api/subscriptions/{subscription}/charge", new { date = "2026-08-01" }, HttpStatusCode.Created);
        Assert.Equal("2026-08-01", (await _client.RecordAsync("subscriptions", subscription)).GetProperty("last_charge_date").GetString());

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/transactions/{august.GetProperty("transaction_id").GetInt64()}")).StatusCode);
        Assert.Equal("2026-07-01", (await _client.RecordAsync("subscriptions", subscription)).GetProperty("last_charge_date").GetString());

        // A cobrança cujo lançamento foi removido não bloqueia um novo lançamento na mesma data.
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/subscriptions/{subscription}/charge", new { date = "2026-08-01" }, HttpStatusCode.Created);
        Assert.Equal("2026-08-01", (await _client.RecordAsync("subscriptions", subscription)).GetProperty("last_charge_date").GetString());
    }

    [Fact]
    public async Task Charge_inputs_are_validated()
    {
        var subscription = await _client.CreateAsync("/api/subscriptions", new { name = "Validada", amount_cents = 100 });
        var url = $"/api/subscriptions/{subscription}/charge";
        Assert.Equal("O valor deve ser maior que zero.", await (await _client.PostAsJsonAsync(url, new { amount_cents = 0 })).AssertValidationAsync("amount_cents"));
        Assert.Equal("Use uma data válida no formato AAAA-MM-DD.", await (await _client.PostAsJsonAsync(url, new { date = "17/09/2026" })).AssertValidationAsync("date"));
        Assert.Equal("Conta bancária não encontrada ou inativa.", await (await _client.PostAsJsonAsync(url, new { account_id = 999999 })).AssertValidationAsync("account_id"));
        Assert.Equal("Opção inválida.", await (await _client.PostAsJsonAsync(url, new { payment_method = "cheque" })).AssertValidationAsync("payment_method"));
        Assert.Equal("Envie um objeto JSON.", await (await _client.PostRawAsync(url, "[]")).AssertValidationAsync("body"));
        Assert.Equal("O corpo da requisição não é um JSON válido.", await (await _client.PostRawAsync(url, "{")).AssertValidationAsync("body"));

        Assert.Equal("Campo obrigatório.", await (await _client.DeleteAsync(url)).AssertValidationAsync("date"));
        Assert.Equal("Use uma data válida no formato AAAA-MM-DD.", await (await _client.DeleteAsync($"{url}?date=2026-13-01")).AssertValidationAsync("date"));

        await (await _client.PostAsJsonAsync("/api/subscriptions/987654/charge", new { })).AssertNotFoundAsync();
        await (await _client.DeleteAsync("/api/subscriptions/987654/charge?date=2026-01-01")).AssertNotFoundAsync();
        await _client.DeleteAsync($"/api/subscriptions/{subscription}");
        await (await _client.PostAsJsonAsync(url, new { })).AssertNotFoundAsync();
        Assert.DoesNotContain((await _client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray(), item => item.GetProperty("description").GetString() == "Validada");
    }

    [Fact]
    public async Task Charge_is_atomic_when_the_charge_row_cannot_be_written()
    {
        var account = await _client.CreateAccountAsync("Conta atômica", 5000);
        var subscription = await _client.CreateAsync("/api/subscriptions", new { name = "Atômica", amount_cents = 700 });
        using (var connection = _factory.OpenDatabase())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = $"CREATE TRIGGER fail_charge BEFORE INSERT ON subscription_charges WHEN NEW.subscription_id={subscription} BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;";
            command.ExecuteNonQuery();
        }
        try
        {
            await _client.SendJsonAsync(HttpMethod.Post, $"/api/subscriptions/{subscription}/charge", new { date = "2026-06-01", account_id = account }, HttpStatusCode.InternalServerError);
            Assert.Equal(5000, await _client.AccountBalanceAsync(account));
            Assert.DoesNotContain((await _client.GetJsonAsync("/api/transactions?month=2026-06")).EnumerateArray(), item => item.GetProperty("description").GetString() == "Atômica");
        }
        finally
        {
            using var connection = _factory.OpenDatabase();
            using var command = connection.CreateCommand();
            command.CommandText = "DROP TRIGGER fail_charge";
            command.ExecuteNonQuery();
        }
    }

    // ---------- MEL-12: data da próxima cobrança ----------

    [Theory]
    [InlineData("yearly")]
    [InlineData("weekly")]
    public async Task Yearly_and_weekly_subscriptions_require_the_next_billing_date(string frequency)
    {
        var missing = await _client.PostAsJsonAsync("/api/subscriptions", new { name = "Sem data", amount_cents = 100, frequency });
        Assert.Equal("Informe a data da próxima cobrança.", await missing.AssertValidationAsync("next_billing_date"));
        var blank = await _client.PostAsJsonAsync("/api/subscriptions", new { name = "Data vazia", amount_cents = 100, frequency, next_billing_date = "  " });
        Assert.Equal("Informe a data da próxima cobrança.", await blank.AssertValidationAsync("next_billing_date"));
        var created = await _client.CreateAsync("/api/subscriptions", new { name = "Com data", amount_cents = 100, frequency, next_billing_date = "2027-01-10" });

        await _client.SendJsonAsync(HttpMethod.Put, $"/api/subscriptions/{created}", new { name = "Renomeada" });
        var cleared = await _client.PutAsJsonAsync($"/api/subscriptions/{created}", new { next_billing_date = (string?)null });
        Assert.Equal("Informe a data da próxima cobrança.", await cleared.AssertValidationAsync("next_billing_date"));
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/subscriptions/{created}", new { frequency = "monthly", next_billing_date = (string?)null });
        var record = await _client.RecordAsync("subscriptions", created);
        Assert.Equal("monthly", record.GetProperty("frequency").GetString());
        Assert.Equal(JsonValueKind.Null, record.GetProperty("next_billing_date").ValueKind);
    }

    [Fact]
    public async Task Monthly_subscriptions_do_not_need_a_date_and_switching_frequency_checks_the_resulting_record()
    {
        var monthly = await _client.CreateAsync("/api/subscriptions", new { name = "Mensal", amount_cents = 100 });
        var explicitMonthly = await _client.CreateAsync("/api/subscriptions", new { name = "Mensal explícita", amount_cents = 100, frequency = "monthly" });
        Assert.Equal("monthly", (await _client.RecordAsync("subscriptions", monthly)).GetProperty("frequency").GetString());

        var toYearly = await _client.PutAsJsonAsync($"/api/subscriptions/{monthly}", new { frequency = "yearly" });
        Assert.Equal("Informe a data da próxima cobrança.", await toYearly.AssertValidationAsync("next_billing_date"));
        Assert.Equal("monthly", (await _client.RecordAsync("subscriptions", monthly)).GetProperty("frequency").GetString());
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/subscriptions/{monthly}", new { frequency = "yearly", next_billing_date = "2027-03-01" });

        // Uma assinatura mensal que já tem data pode mudar para semanal sem reenviar a data.
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/subscriptions/{explicitMonthly}", new { next_billing_date = "2026-10-05" });
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/subscriptions/{explicitMonthly}", new { frequency = "weekly" });
        await (await _client.PutAsJsonAsync("/api/subscriptions/987654", new { frequency = "yearly" })).AssertNotFoundAsync();
    }

    [Fact]
    public async Task Legacy_yearly_rows_without_date_are_kept_as_they_are()
    {
        long legacy;
        using (var connection = _factory.OpenDatabase())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "INSERT INTO subscriptions(name,amount_cents,frequency) VALUES ('Anual antiga',12000,'yearly') RETURNING id";
            legacy = (long)command.ExecuteScalar()!;
        }

        var record = await _client.RecordAsync("subscriptions", legacy);
        Assert.Equal("yearly", record.GetProperty("frequency").GetString());
        Assert.Equal(JsonValueKind.Null, record.GetProperty("next_billing_date").ValueKind);

        // Editar exige completar a data (a regra vale para o registro resultante); a cobrança continua disponível.
        var rename = await _client.PutAsJsonAsync($"/api/subscriptions/{legacy}", new { name = "Anual" });
        Assert.Equal("Informe a data da próxima cobrança.", await rename.AssertValidationAsync("next_billing_date"));
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/subscriptions/{legacy}/charge", new { date = "2026-05-05" }, HttpStatusCode.Created);
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/subscriptions/{legacy}", new { name = "Anual", next_billing_date = "2027-05-05" });
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/subscriptions/{legacy}")).StatusCode);
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/subscriptions/{legacy}/restore");
    }

    // ---------- MEL-09: transferência de vínculos ----------

    [Fact]
    public async Task Category_reassign_moves_live_links_and_reports_counts()
    {
        var source = await _client.CreateAsync("/api/categories", new { name = "Origem", kind = "expense" });
        var target = await _client.CreateAsync("/api/categories", new { name = "Destino", kind = "expense" });
        var live = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-04-01", description = "Viva", kind = "expense", amount_cents = 100, category_id = source });
        var live2 = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-04-02", description = "Viva 2", kind = "expense", amount_cents = 200, category_id = source });
        var removed = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-04-03", description = "Removida", kind = "expense", amount_cents = 300, category_id = source });
        await _client.DeleteAsync($"/api/transactions/{removed}");
        var bill = await _client.CreateAsync("/api/bills", new { name = "Conta", amount_cents = 100, category_id = source });
        var removedBill = await _client.CreateAsync("/api/bills", new { name = "Conta removida", amount_cents = 100, category_id = source });
        await _client.DeleteAsync($"/api/bills/{removedBill}");
        var subscription = await _client.CreateAsync("/api/subscriptions", new { name = "Assinatura", amount_cents = 100, category_id = source });

        var result = await _client.SendJsonAsync(HttpMethod.Post, $"/api/categories/{source}/reassign", new { target_id = target });
        Assert.True(result.GetProperty("ok").GetBoolean());
        var updated = result.GetProperty("updated");
        Assert.Equal(2, updated.GetProperty("transactions").GetInt64());
        Assert.Equal(1, updated.GetProperty("bills").GetInt64());
        Assert.Equal(1, updated.GetProperty("subscriptions").GetInt64());

        var transactions = (await _client.GetJsonAsync("/api/transactions?month=2026-04")).EnumerateArray().ToDictionary(item => item.GetProperty("id").GetInt64());
        Assert.Equal(target, transactions[live].GetProperty("category_id").GetInt64());
        Assert.Equal("Destino", transactions[live2].GetProperty("category_name").GetString());
        Assert.Equal(target, (await _client.RecordAsync("bills", bill)).GetProperty("category_id").GetInt64());
        Assert.Equal(target, (await _client.RecordAsync("subscriptions", subscription)).GetProperty("category_id").GetInt64());
        Assert.Equal(source, CategoryOf("transactions", removed));
        Assert.Equal(source, CategoryOf("bills", removedBill));

        var again = await _client.SendJsonAsync(HttpMethod.Post, $"/api/categories/{source}/reassign", new { target_id = target });
        Assert.Equal(0, again.GetProperty("updated").GetProperty("transactions").GetInt64());
    }

    [Fact]
    public async Task Category_reassign_to_null_works_for_removed_sources()
    {
        var source = await _client.CreateAsync("/api/categories", new { name = "Removida", kind = "income" });
        var income = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-04-10", description = "Freela", kind = "income", amount_cents = 5000, category_id = source });
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/categories/{source}")).StatusCode);

        var result = await _client.SendJsonAsync(HttpMethod.Post, $"/api/categories/{source}/reassign", new { target_id = (long?)null });
        Assert.Equal(1, result.GetProperty("updated").GetProperty("transactions").GetInt64());
        Assert.Equal(0, result.GetProperty("updated").GetProperty("bills").GetInt64());
        Assert.Equal(0, result.GetProperty("updated").GetProperty("subscriptions").GetInt64());
        var transaction = (await _client.GetJsonAsync("/api/transactions?month=2026-04")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == income);
        Assert.Equal(JsonValueKind.Null, transaction.GetProperty("category_id").ValueKind);
    }

    [Fact]
    public async Task Category_reassign_rejects_invalid_targets_without_moving_anything()
    {
        var source = await _client.CreateAsync("/api/categories", new { name = "Fonte", kind = "expense" });
        var income = await _client.CreateAsync("/api/categories", new { name = "Receita", kind = "income" });
        var inactive = await _client.CreateAsync("/api/categories", new { name = "Inativa", kind = "expense" });
        await _client.DeleteAsync($"/api/categories/{inactive}");
        var transaction = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-04-20", description = "Fica", kind = "expense", amount_cents = 100, category_id = source });
        var url = $"/api/categories/{source}/reassign";

        Assert.Equal("A categoria de destino deve ser do mesmo tipo.", await (await _client.PostAsJsonAsync(url, new { target_id = income })).AssertValidationAsync("target_id"));
        Assert.Equal("Selecione uma categoria diferente da atual.", await (await _client.PostAsJsonAsync(url, new { target_id = source })).AssertValidationAsync("target_id"));
        Assert.Equal("Categoria de destino não encontrada ou removida.", await (await _client.PostAsJsonAsync(url, new { target_id = inactive })).AssertValidationAsync("target_id"));
        Assert.Equal("Categoria de destino não encontrada ou removida.", await (await _client.PostAsJsonAsync(url, new { target_id = 987654 })).AssertValidationAsync("target_id"));
        Assert.Equal("Campo obrigatório.", await (await _client.PostAsJsonAsync(url, new { })).AssertValidationAsync("target_id"));
        Assert.Equal("Valor inválido.", await (await _client.PostAsJsonAsync(url, new { target_id = "2" })).AssertValidationAsync("target_id"));
        Assert.Equal("Valor inválido.", await (await _client.PostAsJsonAsync(url, new { target_id = 0 })).AssertValidationAsync("target_id"));
        await (await _client.PostAsJsonAsync("/api/categories/987654/reassign", new { target_id = (long?)null })).AssertNotFoundAsync();

        Assert.Equal(source, CategoryOf("transactions", transaction));
    }

    [Fact]
    public async Task Category_reassign_is_atomic()
    {
        var source = await _client.CreateAsync("/api/categories", new { name = "Atômica origem", kind = "expense" });
        var target = await _client.CreateAsync("/api/categories", new { name = "Atômica destino", kind = "expense" });
        var transaction = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-04-25", description = "Atômica", kind = "expense", amount_cents = 100, category_id = source });
        var bill = await _client.CreateAsync("/api/bills", new { name = "Atômica", amount_cents = 100, category_id = source });
        await _client.CreateAsync("/api/subscriptions", new { name = "Atômica", amount_cents = 100, category_id = source });
        using (var connection = _factory.OpenDatabase())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = $"CREATE TRIGGER fail_reassign BEFORE UPDATE OF category_id ON subscriptions WHEN NEW.category_id={target} BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;";
            command.ExecuteNonQuery();
        }
        try
        {
            await _client.SendJsonAsync(HttpMethod.Post, $"/api/categories/{source}/reassign", new { target_id = target }, HttpStatusCode.InternalServerError);
            Assert.Equal(source, CategoryOf("transactions", transaction));
            Assert.Equal(source, CategoryOf("bills", bill));
        }
        finally
        {
            using var connection = _factory.OpenDatabase();
            using var command = connection.CreateCommand();
            command.CommandText = "DROP TRIGGER fail_reassign";
            command.ExecuteNonQuery();
        }
    }

    [Fact]
    public async Task Card_reassign_moves_active_subscriptions()
    {
        var source = await _client.CreateAsync("/api/cards", new { name = "Cartão velho" });
        var target = await _client.CreateAsync("/api/cards", new { name = "Cartão novo" });
        var inactive = await _client.CreateAsync("/api/cards", new { name = "Cartão cancelado" });
        await _client.DeleteAsync($"/api/cards/{inactive}");
        var first = await _client.CreateAsync("/api/subscriptions", new { name = "A", amount_cents = 100, card_id = source });
        var second = await _client.CreateAsync("/api/subscriptions", new { name = "B", amount_cents = 100, card_id = source });
        var removed = await _client.CreateAsync("/api/subscriptions", new { name = "C", amount_cents = 100, card_id = source });
        await _client.DeleteAsync($"/api/subscriptions/{removed}");
        var url = $"/api/cards/{source}/reassign";

        Assert.Equal("Selecione um cartão diferente do atual.", await (await _client.PostAsJsonAsync(url, new { target_id = source })).AssertValidationAsync("target_id"));
        Assert.Equal("Cartão de destino não encontrado ou removido.", await (await _client.PostAsJsonAsync(url, new { target_id = inactive })).AssertValidationAsync("target_id"));
        Assert.Equal("Cartão de destino não encontrado ou removido.", await (await _client.PostAsJsonAsync(url, new { target_id = 987654 })).AssertValidationAsync("target_id"));
        Assert.Equal("Campo obrigatório.", await (await _client.PostAsJsonAsync(url, new { })).AssertValidationAsync("target_id"));
        await (await _client.PostAsJsonAsync("/api/cards/987654/reassign", new { target_id = target })).AssertNotFoundAsync();
        Assert.Equal(source, (await _client.RecordAsync("subscriptions", first)).GetProperty("card_id").GetInt64());

        await _client.DeleteAsync($"/api/cards/{source}");
        var result = await _client.SendJsonAsync(HttpMethod.Post, url, new { target_id = target });
        Assert.True(result.GetProperty("ok").GetBoolean());
        var updated = result.GetProperty("updated");
        Assert.Equal(2, updated.GetProperty("subscriptions").GetInt64());
        Assert.Equal(0, updated.GetProperty("transactions").GetInt64());
        Assert.Equal("Cartão novo", (await _client.RecordAsync("subscriptions", second)).GetProperty("card_name").GetString());

        var toNone = await _client.SendJsonAsync(HttpMethod.Post, $"/api/cards/{target}/reassign", new { target_id = (long?)null });
        Assert.Equal(2, toNone.GetProperty("updated").GetProperty("subscriptions").GetInt64());
        Assert.Equal(JsonValueKind.Null, (await _client.RecordAsync("subscriptions", first)).GetProperty("card_id").ValueKind);
    }

    private long? CategoryOf(string table, long id)
    {
        using var connection = _factory.OpenDatabase();
        using var command = connection.CreateCommand();
        command.CommandText = $"SELECT category_id FROM {table} WHERE id={id}";
        return command.ExecuteScalar() is long value ? value : null;
    }

    private async Task AssertGoal(long id, long current) =>
        Assert.Equal(current, (await _client.RecordAsync("goals", id)).GetProperty("current_cents").GetInt64());

    private async Task AssertInvestment(long id, long invested, long current)
    {
        var investment = await _client.RecordAsync("investments", id);
        Assert.Equal(invested, investment.GetProperty("invested_cents").GetInt64());
        Assert.Equal(current, investment.GetProperty("current_cents").GetInt64());
    }
}
