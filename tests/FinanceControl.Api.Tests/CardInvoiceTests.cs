using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Faturas de cartão (MEL-23). Hoje = 18/09/2026 (UTC−3); cartão com fechamento 25 e vencimento 5:
/// fatura 2026-09 (26/07–25/08, vence 05/09), 2026-10 aberta (26/08–25/09) e 2026-11 (26/09–25/10).</summary>
public sealed class CardInvoiceTests : IClassFixture<FinanceApiFactory>
{
    private readonly FinanceApiFactory _factory;
    private readonly HttpClient _client;

    public CardInvoiceTests(FinanceApiFactory factory)
    {
        _factory = factory;
        factory.Time.FixedUtcNow = new DateTimeOffset(2026, 9, 18, 12, 0, 0, TimeSpan.Zero);
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Card_purchases_are_grouped_by_cycle_with_credits_and_state_limits()
    {
        var card = await CreateCardAsync("Cartão ciclos", personalLimit: 100000);
        await Purchase(card, "2026-08-25", 1000);
        await Purchase(card, "2026-08-26", 2000);
        await Purchase(card, "2026-09-25", 3000);
        await Purchase(card, "2026-09-26", 4000);
        await _client.CreateAsync("/api/transactions", new { date = "2026-09-10", description = "Estorno loja", kind = "income", amount_cents = 500, card_id = card });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-09-01", description = "Sem cartão", kind = "expense", amount_cents = 99999 });
        var removed = await Purchase(card, "2026-09-02", 77777);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/transactions/{removed}")).StatusCode);

        var invoices = (await _client.GetJsonAsync($"/api/cards/{card}/invoices")).EnumerateArray().ToList();
        Assert.Equal(["2026-09", "2026-10", "2026-11"], invoices.Select(item => item.GetProperty("month").GetString()));
        Assert.Equal([1000L, 4500L, 4000L], invoices.Select(item => item.GetProperty("total_cents").GetInt64()));
        Assert.Equal([1L, 3L, 1L], invoices.Select(item => item.GetProperty("items_count").GetInt64()));
        Assert.Equal(["vencida", "aberta", "aberta"], invoices.Select(item => item.GetProperty("status").GetString()));
        var open = invoices[1];
        Assert.Equal("2026-08-26", open.GetProperty("period_start").GetString());
        Assert.Equal("2026-09-25", open.GetProperty("period_end").GetString());
        Assert.Equal("2026-09-25", open.GetProperty("closing_date").GetString());
        Assert.Equal("2026-10-05", open.GetProperty("due_date").GetString());
        Assert.Equal(JsonValueKind.Null, open.GetProperty("paid").ValueKind);

        var detail = await _client.GetJsonAsync($"/api/cards/{card}/invoices/2026-10");
        Assert.Equal(4500, detail.GetProperty("total_cents").GetInt64());
        Assert.Equal("aberta", detail.GetProperty("status").GetString());
        var items = detail.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(["2026-08-26", "2026-09-10", "2026-09-25"], items.Select(item => item.GetProperty("date").GetString()));
        Assert.All(items, item =>
        {
            Assert.Equal(card, item.GetProperty("card_id").GetInt64());
            Assert.Equal("Cartão ciclos", item.GetProperty("card_name").GetString());
            Assert.Equal("card", item.GetProperty("payment_method").GetString());
            Assert.Equal(JsonValueKind.Null, item.GetProperty("account_id").ValueKind);
        });

        var ranged = (await _client.GetJsonAsync($"/api/cards/{card}/invoices?from=2026-08&to=2026-12")).EnumerateArray().ToList();
        Assert.Equal(["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"], ranged.Select(item => item.GetProperty("month").GetString()));
        Assert.Equal(0, ranged[0].GetProperty("total_cents").GetInt64());
        Assert.Single((await _client.GetJsonAsync($"/api/cards/{card}/invoices?from=2026-10")).EnumerateArray());

        var state = await StateCard(card);
        Assert.Equal(4500, state.GetProperty("open_invoice_cents").GetInt64());
        Assert.Equal(5500, state.GetProperty("unpaid_invoices_cents").GetInt64());
        Assert.Equal(94500, state.GetProperty("available_limit_cents").GetInt64());
        var stateTransaction = (await _client.GetJsonAsync("/api/state")).GetProperty("transactions").EnumerateArray().First(item => item.NullableInt64("card_id") == card);
        Assert.Equal("Cartão ciclos", stateTransaction.GetProperty("card_name").GetString());
    }

    [Fact]
    public async Task Invoice_status_follows_the_clock()
    {
        var card = await CreateCardAsync("Cartão relógio");
        await Purchase(card, "2026-09-01", 1000);
        Assert.Equal("aberta", await StatusAsync(card, "2026-10"));
        _factory.Time.FixedUtcNow = new DateTimeOffset(2026, 9, 26, 12, 0, 0, TimeSpan.Zero);
        Assert.Equal("fechada", await StatusAsync(card, "2026-10"));
        _factory.Time.FixedUtcNow = new DateTimeOffset(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);
        Assert.Equal("fechada", await StatusAsync(card, "2026-10"));
        _factory.Time.FixedUtcNow = new DateTimeOffset(2026, 10, 6, 12, 0, 0, TimeSpan.Zero);
        Assert.Equal("vencida", await StatusAsync(card, "2026-10"));
        // Depois do fechamento, a fatura aberta passa a ser a seguinte.
        Assert.Equal(0, (await StateCard(card)).GetProperty("open_invoice_cents").GetInt64());
        Assert.Equal(1000, (await StateCard(card)).GetProperty("unpaid_invoices_cents").GetInt64());
        Assert.Equal(JsonValueKind.Null, (await StateCard(card)).GetProperty("available_limit_cents").ValueKind);
    }

    [Fact]
    public async Task Paying_moves_the_account_marks_the_invoice_and_undo_reverses_it()
    {
        var card = await CreateCardAsync("Cartão pago", realLimit: 50000);
        var account = await _client.CreateAccountAsync("Conta fatura", 10000);
        await Purchase(card, "2026-08-10", 1000);

        var paid = await _client.SendJsonAsync(HttpMethod.Post, $"/api/cards/{card}/invoices/2026-09/pay", new { account_id = account }, HttpStatusCode.Created);
        Assert.True(paid.GetProperty("ok").GetBoolean());
        var entryId = paid.GetProperty("bank_entry_id").GetInt64();
        Assert.Equal(9000, await _client.AccountBalanceAsync(account));

        var invoice = await _client.GetJsonAsync($"/api/cards/{card}/invoices/2026-09");
        Assert.Equal("paga", invoice.GetProperty("status").GetString());
        var payment = invoice.GetProperty("paid");
        Assert.Equal(1000, payment.GetProperty("amount_cents").GetInt64());
        Assert.Equal("2026-09-18", payment.GetProperty("date").GetString());
        Assert.Equal(account, payment.GetProperty("account_id").GetInt64());
        Assert.Equal("Conta fatura", payment.GetProperty("account_name").GetString());
        Assert.Equal(entryId, payment.GetProperty("bank_entry_id").GetInt64());
        var entry = Assert.Single((await _client.GetJsonAsync($"/api/bank-accounts/{account}/entries")).EnumerateArray());
        Assert.Equal(entryId, entry.GetProperty("id").GetInt64());
        Assert.Equal("withdrawal", entry.GetProperty("kind").GetString());
        Assert.Equal("Fatura Cartão pago 09/2026", entry.GetProperty("description").GetString());
        Assert.Equal(0, (await StateCard(card)).GetProperty("unpaid_invoices_cents").GetInt64());
        Assert.Equal(50000, (await StateCard(card)).GetProperty("available_limit_cents").GetInt64());
        // Pagar fatura não é despesa: o resumo do mês não muda.
        Assert.Equal(1000, (await _client.GetJsonAsync("/api/summary?month=2026-08")).GetProperty("expense_cents").GetInt64() - await OtherExpensesAsync("2026-08", card));

        Assert.Equal("Esta fatura já foi paga.", await (await _client.PostAsJsonAsync($"/api/cards/{card}/invoices/2026-09/pay", new { account_id = account })).AssertValidationAsync("month"));
        Assert.Equal(9000, await _client.AccountBalanceAsync(account));

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/cards/{card}/invoices/2026-09/pay")).StatusCode);
        Assert.Equal(10000, await _client.AccountBalanceAsync(account));
        Assert.Equal("vencida", (await _client.GetJsonAsync($"/api/cards/{card}/invoices/2026-09")).GetProperty("status").GetString());
        Assert.Empty((await _client.GetJsonAsync($"/api/bank-accounts/{account}/entries")).EnumerateArray());
        await (await _client.DeleteAsync($"/api/cards/{card}/invoices/2026-09/pay")).AssertNotFoundAsync();

        // Valor e data informados; pode pagar de novo depois de desfazer.
        await _client.SendJsonAsync(HttpMethod.Post, $"/api/cards/{card}/invoices/2026-09/pay", new { account_id = account, date = "2026-09-04", amount_cents = 600 }, HttpStatusCode.Created);
        Assert.Equal(9400, await _client.AccountBalanceAsync(account));
        Assert.Equal("2026-09-04", (await _client.GetJsonAsync($"/api/cards/{card}/invoices/2026-09")).GetProperty("paid").GetProperty("date").GetString());
    }

    [Fact]
    public async Task Pay_inputs_are_validated()
    {
        var card = await CreateCardAsync("Cartão validação");
        var account = await _client.CreateAccountAsync("Conta validação", 1000);
        await _client.CreateAsync("/api/transactions", new { date = "2026-09-01", description = "Crédito", kind = "income", amount_cents = 300, card_id = card });
        var url = $"/api/cards/{card}/invoices/2026-10/pay";

        Assert.Equal("Campo obrigatório.", await (await _client.PostAsync(url, null)).AssertValidationAsync("account_id"));
        Assert.Equal("Conta bancária não encontrada ou inativa.", await (await _client.PostAsJsonAsync(url, new { account_id = 999999 })).AssertValidationAsync("account_id"));
        Assert.Equal("O valor deve ser maior que zero.", await (await _client.PostAsJsonAsync(url, new { account_id = account, amount_cents = 0 })).AssertValidationAsync("amount_cents"));
        Assert.Equal("Use uma data válida no formato AAAA-MM-DD.", await (await _client.PostAsJsonAsync(url, new { account_id = account, date = "18/09/2026" })).AssertValidationAsync("date"));
        // Fatura com total ≤ 0 (só crédito) exige valor explícito.
        Assert.Equal("A fatura não tem valor a pagar. Informe o valor do pagamento.", await (await _client.PostAsJsonAsync(url, new { account_id = account })).AssertValidationAsync("amount_cents"));
        Assert.Equal("Use uma competência válida no formato AAAA-MM.", await (await _client.PostAsJsonAsync($"/api/cards/{card}/invoices/2026-13/pay", new { account_id = account })).AssertValidationAsync("month"));
        Assert.Equal("Use uma competência válida no formato AAAA-MM.", await (await _client.GetAsync($"/api/cards/{card}/invoices?from=2026-1")).AssertValidationAsync("from"));
        Assert.Equal("A competência final deve ser igual ou posterior à inicial.", await (await _client.GetAsync($"/api/cards/{card}/invoices?from=2026-05&to=2026-04")).AssertValidationAsync("to"));
        Assert.Equal("Informe um intervalo de até 36 meses.", await (await _client.GetAsync($"/api/cards/{card}/invoices?from=2020-01&to=2026-01")).AssertValidationAsync("to"));
        Assert.Equal(1000, await _client.AccountBalanceAsync(account));

        await (await _client.PostAsJsonAsync("/api/cards/987654/invoices/2026-10/pay", new { account_id = account })).AssertNotFoundAsync();
        await (await _client.GetAsync("/api/cards/987654/invoices")).AssertNotFoundAsync();
        await (await _client.GetAsync("/api/cards/987654/invoices/2026-10")).AssertNotFoundAsync();
        await (await _client.DeleteAsync("/api/cards/987654/invoices/2026-10/pay")).AssertNotFoundAsync();

        await _client.SendJsonAsync(HttpMethod.Post, url, new { account_id = account, amount_cents = 100 }, HttpStatusCode.Created);
        Assert.Equal(900, await _client.AccountBalanceAsync(account));
    }

    [Fact]
    public async Task Closed_months_block_invoice_payment_and_undo()
    {
        var card = await CreateCardAsync("Cartão fechado");
        var account = await _client.CreateAccountAsync("Conta mês fechado", 10000);
        await Purchase(card, "2026-07-10", 1000);
        await Purchase(card, "2026-08-10", 1000);

        await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-06/close");
        try
        {
            // Data do pagamento no mês fechado.
            Assert.Equal("O mês 06/2026 está fechado. Reabra-o para alterar.",
                await (await _client.PostAsJsonAsync($"/api/cards/{card}/invoices/2026-08/pay", new { account_id = account, date = "2026-06-30" })).AssertValidationAsync("date"));
            // Mês da fatura fechado (vencimento 05/06 → fatura 2026-06 não tem compras, mas o bloqueio vale mesmo com valor informado).
            Assert.Equal("O mês 06/2026 está fechado. Reabra-o para alterar.",
                await (await _client.PostAsJsonAsync($"/api/cards/{card}/invoices/2026-06/pay", new { account_id = account, amount_cents = 10 })).AssertValidationAsync("date"));
            Assert.Equal(10000, await _client.AccountBalanceAsync(account));

            await _client.SendJsonAsync(HttpMethod.Post, $"/api/cards/{card}/invoices/2026-08/pay", new { account_id = account, date = "2026-07-31" }, HttpStatusCode.Created);
            await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-07/close");
            Assert.Equal("O mês 07/2026 está fechado. Reabra-o para alterar.", await (await _client.DeleteAsync($"/api/cards/{card}/invoices/2026-08/pay")).AssertValidationAsync("date"));
            Assert.Equal(9000, await _client.AccountBalanceAsync(account));
            await _client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-07/reopen");
            Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/cards/{card}/invoices/2026-08/pay")).StatusCode);
            Assert.Equal(10000, await _client.AccountBalanceAsync(account));
        }
        finally
        {
            await _client.PostAsync("/api/months/2026-06/reopen", null);
            await _client.PostAsync("/api/months/2026-07/reopen", null);
        }
    }

    [Fact]
    public async Task Card_transactions_validate_account_payment_method_and_card()
    {
        var card = await CreateCardAsync("Cartão regras");
        var account = await _client.CreateAccountAsync("Conta regras", 5000);
        var body = new { date = "2026-09-01", description = "Compra", kind = "expense", amount_cents = 100, card_id = card, account_id = account };
        Assert.Equal("Compras no cartão não movimentam a conta; o pagamento é feito pela fatura.", await (await _client.PostAsJsonAsync("/api/transactions", body)).AssertValidationAsync("account_id"));
        Assert.Equal("Compras no cartão usam a forma de pagamento Cartão de crédito.",
            await (await _client.PostAsJsonAsync("/api/transactions", new { date = "2026-09-01", description = "Compra", kind = "expense", amount_cents = 100, card_id = card, payment_method = "pix" })).AssertValidationAsync("payment_method"));
        Assert.Equal("Cartão não encontrado ou inativo.", await (await _client.PostAsJsonAsync("/api/transactions", new { date = "2026-09-01", description = "Compra", kind = "expense", amount_cents = 100, card_id = 999999 })).AssertValidationAsync("card_id"));

        // Transformar um lançamento com conta em compra no cartão exige tirar a conta; a forma de pagamento vira cartão.
        var linked = await _client.CreateAsync("/api/transactions", new { date = "2026-09-02", description = "Pix", kind = "expense", amount_cents = 700, payment_method = "pix", account_id = account });
        Assert.Equal(4300, await _client.AccountBalanceAsync(account));
        Assert.Equal("Compras no cartão não movimentam a conta; o pagamento é feito pela fatura.",
            await (await _client.PutAsJsonAsync($"/api/transactions/{linked}", new { card_id = card })).AssertValidationAsync("account_id"));
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{linked}", new { card_id = card, account_id = (long?)null });
        Assert.Equal(5000, await _client.AccountBalanceAsync(account));
        var converted = (await _client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == linked);
        Assert.Equal("card", converted.GetProperty("payment_method").GetString());
        Assert.Equal(card, converted.GetProperty("card_id").GetInt64());
        Assert.Equal("Compras no cartão usam a forma de pagamento Cartão de crédito.",
            await (await _client.PutAsJsonAsync($"/api/transactions/{linked}", new { payment_method = "debit" })).AssertValidationAsync("payment_method"));
        Assert.Equal("Compras no cartão não movimentam a conta; o pagamento é feito pela fatura.",
            await (await _client.PutAsJsonAsync($"/api/transactions/{linked}", new { account_id = account })).AssertValidationAsync("account_id"));
        // Tirar o cartão libera outra forma de pagamento.
        await _client.SendJsonAsync(HttpMethod.Put, $"/api/transactions/{linked}", new { card_id = (long?)null, payment_method = "debit" });

        await _client.DeleteAsync($"/api/cards/{card}");
        Assert.Equal("Cartão não encontrado ou inativo.", await (await _client.PostAsJsonAsync("/api/transactions", new { date = "2026-09-01", description = "Compra", kind = "expense", amount_cents = 100, card_id = card })).AssertValidationAsync("card_id"));
    }

    [Fact]
    public async Task Subscription_charges_on_a_card_join_the_invoice()
    {
        var card = await CreateCardAsync("Cartão assinatura");
        var account = await _client.CreateAccountAsync("Conta assinatura", 5000);
        var subscription = await _client.CreateAsync("/api/subscriptions", new { name = "Streaming cartão", amount_cents = 3990, card_id = card });
        var charge = await _client.SendJsonAsync(HttpMethod.Post, $"/api/subscriptions/{subscription}/charge", new { date = "2026-09-10" }, HttpStatusCode.Created);
        var transaction = (await _client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == charge.GetProperty("transaction_id").GetInt64());
        Assert.Equal(card, transaction.GetProperty("card_id").GetInt64());
        Assert.Equal("card", transaction.GetProperty("payment_method").GetString());
        Assert.Equal(3990, (await _client.GetJsonAsync($"/api/cards/{card}/invoices/2026-10")).GetProperty("total_cents").GetInt64());

        // Paga por uma conta: não entra na fatura.
        var byAccount = await _client.SendJsonAsync(HttpMethod.Post, $"/api/subscriptions/{subscription}/charge", new { date = "2026-09-11", account_id = account, payment_method = "pix" }, HttpStatusCode.Created);
        var paidByAccount = (await _client.GetJsonAsync("/api/transactions?month=2026-09")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == byAccount.GetProperty("transaction_id").GetInt64());
        Assert.Equal(JsonValueKind.Null, paidByAccount.GetProperty("card_id").ValueKind);
        Assert.Equal(3990, (await _client.GetJsonAsync($"/api/cards/{card}/invoices/2026-10")).GetProperty("total_cents").GetInt64());
        Assert.Equal(1, (await _client.GetJsonAsync($"/api/cards/{card}/links")).GetProperty("transactions").GetInt64());
    }

    private async Task<long> CreateCardAsync(string name, long realLimit = 0, long personalLimit = 0) =>
        await _client.CreateAsync("/api/cards", new { name, closing_day = 25, due_day = 5, real_limit_cents = realLimit, personal_limit_cents = personalLimit });

    private Task<long> Purchase(long card, string date, long amount) =>
        _client.CreateAsync("/api/transactions", new { date, description = $"Compra {date}", kind = "expense", amount_cents = amount, card_id = card });

    private async Task<string?> StatusAsync(long card, string month) =>
        (await _client.GetJsonAsync($"/api/cards/{card}/invoices/{month}")).GetProperty("status").GetString();

    private async Task<JsonElement> StateCard(long id) =>
        (await _client.GetJsonAsync("/api/state")).GetProperty("cards").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == id);

    /// <summary>Despesas do mês que não são compras deste cartão (outros testes da classe compartilham o banco).</summary>
    private async Task<long> OtherExpensesAsync(string month, long card) =>
        (await _client.GetJsonAsync($"/api/transactions?month={month}")).EnumerateArray()
            .Where(item => item.GetProperty("kind").GetString() == "expense" && item.NullableInt64("card_id") != card)
            .Sum(item => item.GetProperty("amount_cents").GetInt64());
}
