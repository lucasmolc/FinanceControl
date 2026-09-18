using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

public sealed class MovementTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private const string LegacyMessage = "Esta movimentação foi registrada antes do histórico detalhado e não pode ser estornada.";
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Goal_entries_are_listed_newest_first_and_can_be_reversed()
    {
        var goal = await _client.CreateAsync("/api/goals", new { name = "Viagem", target_cents = 100000 });
        var first = await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = "2026-01-05", amount_cents = 1000 });
        var second = await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = "2026-01-10", amount_cents = 2000, notes = "Bônus" });
        var third = await _client.CreateAsync($"/api/goals/{goal}/entries", new { date = "2026-01-10", amount_cents = 500 });
        Assert.Equal(3500, (await _client.RecordAsync("goals", goal)).GetProperty("current_cents").GetInt64());

        var entries = (await _client.GetJsonAsync($"/api/goals/{goal}/entries")).EnumerateArray().ToList();
        Assert.Equal([third, second, first], entries.Select(item => item.GetProperty("id").GetInt64()));
        Assert.Equal(goal, entries[0].GetProperty("goal_id").GetInt64());
        Assert.Equal("Bônus", entries[1].GetProperty("notes").GetString());

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/goals/{goal}/entries/{second}")).StatusCode);
        Assert.Equal(1500, (await _client.RecordAsync("goals", goal)).GetProperty("current_cents").GetInt64());
        Assert.Equal([third, first], (await _client.GetJsonAsync($"/api/goals/{goal}/entries")).EnumerateArray().Select(item => item.GetProperty("id").GetInt64()));

        await (await _client.DeleteAsync($"/api/goals/{goal}/entries/{second}")).AssertNotFoundAsync();
        var otherGoal = await _client.CreateAsync("/api/goals", new { name = "Outra", target_cents = 100 });
        await (await _client.DeleteAsync($"/api/goals/{otherGoal}/entries/{first}")).AssertNotFoundAsync();
        await (await _client.GetAsync("/api/goals/987654/entries")).AssertNotFoundAsync();
    }

    [Fact]
    public async Task Investment_movements_store_deltas_and_reverse_exactly()
    {
        var investment = await _client.CreateAsync("/api/investments", new { name = "Tesouro", type = "treasury" });
        await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-01", kind = "deposit", amount_cents = 10000 });
        await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-02", kind = "yield", amount_cents = 500 });
        var withdrawal = await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-03", kind = "withdrawal", amount_cents = 2000 });
        var adjustment = await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-04", kind = "adjustment", amount_cents = 9000 });
        // Resgate de 2000 sobre 10500 atual reduz o aplicado pelo custo médio: round(10000 × 2000 / 10500) = 1905.
        await AssertInvestment(investment, 8095, 9000);

        var entries = (await _client.GetJsonAsync($"/api/investments/{investment}/entries")).EnumerateArray().ToList();
        Assert.Equal(["adjustment", "withdrawal", "yield", "deposit"], entries.Select(item => item.GetProperty("kind").GetString()));
        Assert.Equal(investment, entries[0].GetProperty("investment_id").GetInt64());

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/investments/{investment}/entries/{adjustment}")).StatusCode);
        await AssertInvestment(investment, 8095, 8500);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/investments/{investment}/entries/{withdrawal}")).StatusCode);
        await AssertInvestment(investment, 10000, 10500);
        Assert.Equal(2, (await _client.GetJsonAsync($"/api/investments/{investment}/entries")).GetArrayLength());
        await (await _client.DeleteAsync($"/api/investments/{investment}/entries/{withdrawal}")).AssertNotFoundAsync();
    }

    [Fact]
    public async Task Investment_reversal_that_would_go_negative_is_rejected()
    {
        var investment = await _client.CreateAsync("/api/investments", new { name = "CDB" });
        var deposit = await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-01", kind = "deposit", amount_cents = 1000 });
        await _client.CreateAsync($"/api/investments/{investment}/entries", new { date = "2026-01-02", kind = "withdrawal", amount_cents = 1000 });

        var response = await _client.DeleteAsync($"/api/investments/{investment}/entries/{deposit}");
        Assert.Equal("A movimentação deixaria o investimento com saldo negativo.", await response.AssertValidationAsync("amount_cents"));
        await AssertInvestment(investment, 0, 0);
        Assert.Equal(2, (await _client.GetJsonAsync($"/api/investments/{investment}/entries")).GetArrayLength());
    }

    [Fact]
    public async Task Bank_movements_merge_with_linked_transactions_and_transfers_reverse_as_a_pair()
    {
        var a = await _client.CreateAccountAsync("Conta A");
        var b = await _client.CreateAccountAsync("Conta B");
        var deposit = await _client.CreateAsync($"/api/bank-accounts/{a}/entries", new { date = "2026-02-01", kind = "deposit", amount_cents = 10000, description = "  " });
        var withdrawal = await _client.CreateAsync($"/api/bank-accounts/{a}/entries", new { date = "2026-02-02", kind = "withdrawal", amount_cents = 3000, description = "Saque" });
        var adjustment = await _client.CreateAsync($"/api/bank-accounts/{a}/entries", new { date = "2026-02-03", kind = "adjustment", amount_cents = -500 });
        Assert.Equal(-500, await _client.AccountBalanceAsync(a));
        var transfer = await _client.CreateAsync($"/api/bank-accounts/{a}/entries", new { date = "2026-02-04", kind = "transfer_out", amount_cents = 2000, related_account_id = b, description = "   " });
        var transaction = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-02-05", description = "Padaria", kind = "expense", amount_cents = 1000, account_id = a });
        Assert.Equal(-3500, await _client.AccountBalanceAsync(a));
        Assert.Equal(2000, await _client.AccountBalanceAsync(b));

        var statement = (await _client.GetJsonAsync($"/api/bank-accounts/{a}/entries")).EnumerateArray().ToList();
        Assert.Equal(["transaction", "entry", "entry", "entry", "entry"], statement.Select(item => item.GetProperty("source").GetString()));
        Assert.Equal([transaction, transfer, adjustment, withdrawal, deposit], statement.Select(item => item.GetProperty("id").GetInt64()));
        Assert.Equal([-1000L, -2000L, -7500L, -3000L, 10000L], statement.Select(item => item.GetProperty("delta_cents").GetInt64()));
        Assert.Equal("Entrada", statement[4].GetProperty("description").GetString());
        Assert.Equal("Transferência enviada", statement[1].GetProperty("description").GetString());
        Assert.Equal("Conta B", statement[1].GetProperty("related_account_name").GetString());
        Assert.Equal(-500, statement[2].GetProperty("amount_cents").GetInt64());

        var incoming = Assert.Single((await _client.GetJsonAsync($"/api/bank-accounts/{b}/entries")).EnumerateArray());
        Assert.Equal("transfer_in", incoming.GetProperty("kind").GetString());
        Assert.Equal("Transferência recebida", incoming.GetProperty("description").GetString());
        Assert.Equal(a, incoming.GetProperty("related_account_id").GetInt64());
        Assert.Equal("Conta A", incoming.GetProperty("related_account_name").GetString());

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/bank-accounts/{b}/entries/{incoming.GetProperty("id").GetInt64()}")).StatusCode);
        Assert.Equal(-1500, await _client.AccountBalanceAsync(a));
        Assert.Equal(0, await _client.AccountBalanceAsync(b));
        Assert.Empty((await _client.GetJsonAsync($"/api/bank-accounts/{b}/entries")).EnumerateArray());
        await (await _client.DeleteAsync($"/api/bank-accounts/{a}/entries/{transfer}")).AssertNotFoundAsync();

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/bank-accounts/{a}/entries/{adjustment}")).StatusCode);
        Assert.Equal(6000, await _client.AccountBalanceAsync(a));
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/bank-accounts/{a}/entries/{withdrawal}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/bank-accounts/{a}/entries/{deposit}")).StatusCode);
        Assert.Equal(-1000, await _client.AccountBalanceAsync(a));
        Assert.Equal([transaction], (await _client.GetJsonAsync($"/api/bank-accounts/{a}/entries")).EnumerateArray().Select(item => item.GetProperty("id").GetInt64()));
        await (await _client.DeleteAsync($"/api/bank-accounts/{b}/entries/{deposit}")).AssertNotFoundAsync();
        await (await _client.GetAsync("/api/bank-accounts/987654/entries")).AssertNotFoundAsync();
    }

    [Fact]
    public async Task Transfer_with_custom_description_uses_it_on_both_sides()
    {
        var a = await _client.CreateAccountAsync("Origem", 5000);
        var b = await _client.CreateAccountAsync("Destino");
        await _client.CreateAsync($"/api/bank-accounts/{a}/entries", new { date = "2026-03-01", kind = "transfer_out", amount_cents = 1500, related_account_id = b, description = " Reserva " });
        var incoming = Assert.Single((await _client.GetJsonAsync($"/api/bank-accounts/{b}/entries")).EnumerateArray());
        Assert.Equal("Reserva", incoming.GetProperty("description").GetString());
        Assert.Equal(1500, incoming.GetProperty("delta_cents").GetInt64());
    }

    [Fact]
    public async Task Rows_created_before_migration_004_are_reversible_only_when_the_delta_is_known()
    {
        var account = await _client.CreateAccountAsync("Legada", 10000);
        var investment = await _client.CreateAsync("/api/investments", new { name = "Legado", invested_cents = 5000, current_cents = 6000 });
        long legacyDeposit, legacyAdjustment, legacyTransfer, legacyYield, legacyInvestmentAdjustment;
        using (var connection = factory.OpenDatabase())
        {
            long Insert(string sql)
            {
                using var command = connection.CreateCommand();
                command.CommandText = sql + " RETURNING id";
                return (long)command.ExecuteScalar()!;
            }
            legacyDeposit = Insert($"INSERT INTO bank_entries(account_id,date,description,kind,amount_cents) VALUES ({account},'2025-12-01','Depósito antigo','deposit',1000)");
            legacyAdjustment = Insert($"INSERT INTO bank_entries(account_id,date,description,kind,amount_cents) VALUES ({account},'2025-12-02','Ajuste antigo','adjustment',10000)");
            legacyTransfer = Insert($"INSERT INTO bank_entries(account_id,date,description,kind,amount_cents,related_account_id) VALUES ({account},'2025-12-03','Transferência antiga','transfer_out',500,NULL)");
            legacyYield = Insert($"INSERT INTO investment_entries(investment_id,date,kind,amount_cents) VALUES ({investment},'2025-12-01','yield',300)");
            legacyInvestmentAdjustment = Insert($"INSERT INTO investment_entries(investment_id,date,kind,amount_cents) VALUES ({investment},'2025-12-02','adjustment',6000)");
        }

        var statement = (await _client.GetJsonAsync($"/api/bank-accounts/{account}/entries")).EnumerateArray().ToDictionary(item => item.GetProperty("id").GetInt64());
        Assert.Equal(JsonValueKind.Null, statement[legacyAdjustment].GetProperty("delta_cents").ValueKind);
        Assert.Equal(-500, statement[legacyTransfer].GetProperty("delta_cents").GetInt64());

        Assert.Equal(LegacyMessage, await (await _client.DeleteAsync($"/api/bank-accounts/{account}/entries/{legacyAdjustment}")).AssertValidationAsync("entry"));
        Assert.Equal(LegacyMessage, await (await _client.DeleteAsync($"/api/bank-accounts/{account}/entries/{legacyTransfer}")).AssertValidationAsync("entry"));
        Assert.Equal(10000, await _client.AccountBalanceAsync(account));
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/bank-accounts/{account}/entries/{legacyDeposit}")).StatusCode);
        Assert.Equal(9000, await _client.AccountBalanceAsync(account));

        Assert.Equal(LegacyMessage, await (await _client.DeleteAsync($"/api/investments/{investment}/entries/{legacyInvestmentAdjustment}")).AssertValidationAsync("entry"));
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/investments/{investment}/entries/{legacyYield}")).StatusCode);
        await AssertInvestment(investment, 5000, 5700);
    }

    [Fact]
    public async Task Entry_creation_returns_the_created_id()
    {
        var account = await _client.CreateAccountAsync("Ids");
        var response = await _client.PostAsJsonAsync($"/api/bank-accounts/{account}/entries", new { date = "2026-01-01", kind = "deposit", amount_cents = 100 });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var id = body.GetProperty("id").GetInt64();
        Assert.Equal(id, Assert.Single((await _client.GetJsonAsync($"/api/bank-accounts/{account}/entries")).EnumerateArray()).GetProperty("id").GetInt64());
    }

    private async Task AssertInvestment(long id, long invested, long current)
    {
        var investment = await _client.RecordAsync("investments", id);
        Assert.Equal(invested, investment.GetProperty("invested_cents").GetInt64());
        Assert.Equal(current, investment.GetProperty("current_cents").GetInt64());
    }
}
