using System.Net;
using System.Text;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Relatórios, CSV, base das projeções e gráficos do resumo (MEL-31/32/38). Hoje = 18/09/2026 (UTC−3).</summary>
public sealed class ReportTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 18, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Report_aggregates_months_categories_methods_and_top_expenses_in_brl()
    {
        using var api = Api();
        var client = api.CreateClient();
        var market = await client.CreateAsync("/api/categories", new { name = "Mercado", kind = "expense" });
        var salary = await client.CreateAsync("/api/categories", new { name = "Salário", kind = "income" });
        var card = await client.CreateAsync("/api/cards", new { name = "Viagem", closing_day = 25, due_day = 5 });
        await Tx(client, "2026-04-05", "Salário abril", "income", 500000, category: salary);
        await Tx(client, "2026-04-06", "Feira", "expense", 20000, category: market, method: "pix");
        await Tx(client, "2026-09-02", "Salário setembro", "income", 500000, category: salary);
        await Tx(client, "2026-09-03", "Supermercado", "expense", 30000, category: market, method: "debit");
        await Tx(client, "2026-09-04", "Presente", "expense", 10000, method: "pix");
        await Tx(client, "2026-09-05", "Salário na categoria errada", "expense", 5000, category: salary, method: "pix");
        await Tx(client, "2026-09-06", "Tesouro", "investment", 100000);
        await Tx(client, "2026-09-07", "Hotel", "expense", 2000, method: "card", currency: "USD", rate: "5", card: card);
        await Tx(client, "2026-03-31", "Fora do período", "expense", 99999);
        var removed = await Tx(client, "2026-09-08", "Removido", "expense", 77777);
        await client.DeleteAsync($"/api/transactions/{removed}");

        var report = await client.GetJsonAsync("/api/reports");
        Assert.Equal("2026-04", report.GetProperty("from").GetString());
        Assert.Equal("2026-09", report.GetProperty("to").GetString());
        var months = report.GetProperty("months").EnumerateArray().ToList();
        Assert.Equal(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"], months.Select(item => item.GetProperty("month").GetString()));
        Assert.Equal(0, months[1].GetProperty("expense_cents").GetInt64());
        var september = months[5];
        Assert.Equal(500000, september.GetProperty("income_cents").GetInt64());
        Assert.Equal(55000, september.GetProperty("expense_cents").GetInt64());
        Assert.Equal(100000, september.GetProperty("investment_cents").GetInt64());
        Assert.Equal(345000, september.GetProperty("net_cents").GetInt64());

        var totals = report.GetProperty("totals");
        Assert.Equal(1000000, totals.GetProperty("income_cents").GetInt64());
        Assert.Equal(75000, totals.GetProperty("expense_cents").GetInt64());
        Assert.Equal(825000, totals.GetProperty("net_cents").GetInt64());
        Assert.Equal(166667, totals.GetProperty("avg_monthly_income_cents").GetInt64());
        Assert.Equal(12500, totals.GetProperty("avg_monthly_expense_cents").GetInt64());
        Assert.Equal(92.5, totals.GetProperty("savings_rate_pct").GetDouble());

        var categories = report.GetProperty("expense_categories").EnumerateArray().ToList();
        Assert.Equal(["Mercado", "Sem categoria"], categories.Select(item => item.GetProperty("name").GetString()));
        Assert.Equal(market, categories[0].GetProperty("category_id").GetInt64());
        Assert.Equal(50000, categories[0].GetProperty("total_cents").GetInt64());
        Assert.Equal(66.7, categories[0].GetProperty("share_pct").GetDouble());
        Assert.Equal(JsonValueKind.Null, categories[1].GetProperty("category_id").ValueKind);
        Assert.Equal(25000, categories[1].GetProperty("total_cents").GetInt64());
        Assert.Equal(100, report.GetProperty("income_categories")[0].GetProperty("share_pct").GetDouble());

        var methods = report.GetProperty("payment_methods").EnumerateArray().ToList();
        Assert.Equal(["pix", "debit", "card"], methods.Select(item => item.GetProperty("method").GetString()));
        Assert.Equal(35000, methods[0].GetProperty("total_cents").GetInt64());
        Assert.Equal(3, methods[0].GetProperty("count").GetInt64());

        var top = report.GetProperty("top_expenses").EnumerateArray().ToList();
        Assert.Equal("Supermercado", top[0].GetProperty("description").GetString());
        Assert.Equal("Mercado", top[0].GetProperty("category_name").GetString());
        var hotel = top.Single(item => item.GetProperty("description").GetString() == "Hotel");
        Assert.Equal(2000, hotel.GetProperty("amount_cents").GetInt64());
        Assert.Equal("USD", hotel.GetProperty("currency").GetString());
        Assert.Equal(10000, hotel.GetProperty("base_amount_cents").GetInt64());

        var summary = await client.GetJsonAsync("/api/summary?month=2026-09");
        Assert.Equal(september.GetProperty("expense_cents").GetInt64(), summary.GetProperty("expense_cents").GetInt64());
    }

    [Fact]
    public async Task Report_range_is_validated()
    {
        using var api = Api();
        var client = api.CreateClient();
        Assert.Equal("Use uma competência válida no formato AAAA-MM.", await (await client.GetAsync("/api/reports?from=2026-13")).AssertValidationAsync("from"));
        Assert.Equal("Use uma competência válida no formato AAAA-MM.", await (await client.GetAsync("/api/reports?to=abc")).AssertValidationAsync("to"));
        Assert.Equal("A competência final deve ser igual ou posterior à inicial.", await (await client.GetAsync("/api/reports?from=2026-09&to=2026-08")).AssertValidationAsync("to"));
        Assert.Equal("Informe um intervalo de até 36 meses.", await (await client.GetAsync("/api/reports?from=2023-09&to=2026-09")).AssertValidationAsync("to"));
        Assert.Equal(36, (await client.GetJsonAsync("/api/reports?from=2023-10&to=2026-09")).GetProperty("months").GetArrayLength());
        var single = await client.GetJsonAsync("/api/reports?from=2026-02&to=2026-02");
        Assert.Equal(JsonValueKind.Null, single.GetProperty("totals").GetProperty("savings_rate_pct").ValueKind);
        Assert.Equal(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"],
            (await client.GetJsonAsync("/api/reports?to=2026-09")).GetProperty("months").EnumerateArray().Select(item => item.GetProperty("month").GetString()));
        Assert.Equal(3, (await client.GetJsonAsync("/api/reports?from=2026-07")).GetProperty("months").GetArrayLength());
    }

    [Fact]
    public async Task Net_worth_snapshots_and_currency_exposure_use_the_latest_rates()
    {
        using var api = Api();
        var client = api.CreateClient();
        await CurrencyTests.SetRateAsync(client, "USD", "5");
        await CurrencyTests.SetRateAsync(client, "BTC", "400000");
        await client.CreateAccountAsync("Real", 100000);
        await client.CreateAsync("/api/bank-accounts", new { name = "Dólar", institution = "Wise", currency = "USD", current_balance_cents = 10000 });
        await client.CreateAsync("/api/investments", new { name = "CDB", current_cents = 200000 });
        await client.CreateAsync("/api/investments", new { name = "Bitcoin", type = "crypto", currency = "BTC", current_cents = 500000 });
        using (var connection = api.OpenDatabase())
        {
            using var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO net_worth_snapshots(month,bank_cents,investments_cents,total_cents,updated_at) VALUES ('2026-08',1,2,3,'x'),('2025-01',9,9,18,'x')";
            command.ExecuteNonQuery();
        }

        var report = await client.GetJsonAsync("/api/reports");
        var worth = report.GetProperty("net_worth").EnumerateArray().ToList();
        Assert.Equal(["2026-08", "2026-09"], worth.Select(item => item.GetProperty("month").GetString()));
        Assert.Equal(150000, worth[1].GetProperty("bank_cents").GetInt64());
        Assert.Equal(400000, worth[1].GetProperty("investments_cents").GetInt64());
        Assert.Equal(550000, worth[1].GetProperty("total_cents").GetInt64());

        var exposure = report.GetProperty("currency_exposure").EnumerateArray().ToList();
        Assert.Equal(["BRL", "USD", "BTC"], exposure.Select(item => item.GetProperty("currency").GetString()));
        Assert.Equal(300000, exposure[0].GetProperty("native_cents").GetInt64());
        Assert.Equal(54.5, exposure[0].GetProperty("share_pct").GetDouble());
        Assert.Equal(10000, exposure[1].GetProperty("native_cents").GetInt64());
        Assert.Equal(50000, exposure[1].GetProperty("base_cents").GetInt64());
        Assert.Equal(500000, exposure[2].GetProperty("native_cents").GetInt64());
        Assert.Equal(200000, exposure[2].GetProperty("base_cents").GetInt64());

        // GET /api/state também atualiza a fotografia do mês.
        await client.CreateAccountAsync("Mais uma", 1);
        await client.GetJsonAsync("/api/state");
        using var check = api.OpenDatabase();
        using var query = check.CreateCommand();
        query.CommandText = "SELECT bank_cents FROM net_worth_snapshots WHERE month='2026-09'";
        Assert.Equal(150001L, (long)query.ExecuteScalar()!);
    }

    [Fact]
    public async Task Csv_export_is_excel_friendly_pt_br()
    {
        using var api = Api();
        var client = api.CreateClient();
        var category = await client.CreateAsync("/api/categories", new { name = "Viagem", kind = "expense" });
        var account = await client.CreateAsync("/api/bank-accounts", new { name = "Conta dólar", institution = "Wise", currency = "USD", current_balance_cents = 100000 });
        await Tx(client, "2026-09-07", "Hotel; centro", "expense", 123456, category: category, method: "debit", account: account, rate: "5.1", notes: "diz \"ótimo\"");
        await Tx(client, "2026-08-01", "=HYPERLINK(\"x\")", "income", 5);
        await Tx(client, "2026-06-30", "Fora", "income", 5);

        var response = await client.GetAsync("/api/reports/transactions.csv?from=2026-07&to=2026-09");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/csv", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("utf-8", response.Content.Headers.ContentType?.CharSet);
        Assert.Equal("lmm-lancamentos-2026-07-a-2026-09.csv", response.Content.Headers.ContentDisposition?.FileNameStar ?? response.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, bytes[..3]);
        var lines = Encoding.UTF8.GetString(bytes[3..]).Split("\r\n");
        Assert.Equal("Data;Descrição;Tipo;Categoria;Forma de pagamento;Conta;Moeda;Valor;Valor em BRL;Observações", lines[0]);
        Assert.Equal("01/08/2026;\"'=HYPERLINK(\"\"x\"\")\";Receita;;Pix;;BRL;0,05;0,05;", lines[1]);
        Assert.Equal("07/09/2026;\"Hotel; centro\";Despesa;Viagem;Cartão de débito;Conta dólar;USD;1234,56;6296,26;\"diz \"\"ótimo\"\"\"", lines[2]);
        Assert.Equal("", lines[3]);
        Assert.Equal(4, lines.Length);

        Assert.Equal("Informe um intervalo de até 36 meses.", await (await client.GetAsync("/api/reports/transactions.csv?from=2020-01&to=2026-09")).AssertValidationAsync("to"));
    }

    [Fact]
    public async Task Projection_base_uses_complete_past_months_and_monthly_equivalents()
    {
        using var api = Api();
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 800000, monthly_spending_limit_cents = 400000, emergency_months_target = 6 });
        await client.CreateAccountAsync("Corrente", 300000);
        await client.CreateAsync("/api/investments", new { name = "CDB", current_cents = 1000000 });
        // Últimos 6 meses completos: mar..ago. O mês atual (setembro) não entra nas médias.
        foreach (var (month, income, expense) in new[] { ("2026-03", 600000L, 300000L), ("2026-06", 900000L, 360000L), ("2026-07", 900000L, 330000L), ("2026-08", 900000L, 300000L), ("2026-09", 9_000_000L, 9_000_000L) })
        {
            await Tx(client, $"{month}-05", "Salário", "income", income);
            await Tx(client, $"{month}-10", "Gastos", "expense", expense);
        }
        await Tx(client, "2026-08-15", "Aporte", "investment", 90000);
        await Tx(client, "2026-02-15", "Antigo", "expense", 9_999_999);
        await client.CreateAsync("/api/bills", new { name = "Aluguel", amount_cents = 150000 });
        await client.CreateAsync("/api/subscriptions", new { name = "Mensal", amount_cents = 3990 });
        await client.CreateAsync("/api/subscriptions", new { name = "Anual", amount_cents = 12000, frequency = "yearly", next_billing_date = "2027-01-10" });
        await client.CreateAsync("/api/goals", new { name = "Viagem", target_cents = 500000, current_cents = 100000, target_date = "2027-06-30" });

        var projection = await client.GetJsonAsync("/api/projections/base");
        Assert.Equal("2026-09-18", projection.GetProperty("as_of").GetString());
        Assert.Equal("BRL", projection.GetProperty("currency").GetString());
        Assert.Equal(1300000, projection.GetProperty("starting").GetProperty("total_cents").GetInt64());
        var incomeBase = projection.GetProperty("income");
        Assert.Equal(800000, incomeBase.GetProperty("planned_monthly_cents").GetInt64());
        Assert.Equal(900000, incomeBase.GetProperty("avg_3m_cents").GetInt64());
        Assert.Equal(550000, incomeBase.GetProperty("avg_6m_cents").GetInt64());
        var expenses = projection.GetProperty("expenses");
        Assert.Equal(400000, expenses.GetProperty("planned_limit_cents").GetInt64());
        Assert.Equal(150000, expenses.GetProperty("bills_monthly_cents").GetInt64());
        Assert.Equal(4990, expenses.GetProperty("subscriptions_monthly_cents").GetInt64());
        Assert.Equal(330000, expenses.GetProperty("avg_3m_cents").GetInt64());
        Assert.Equal(215000, expenses.GetProperty("avg_6m_cents").GetInt64());
        Assert.Equal(30000, projection.GetProperty("investment_contribution_avg_3m_cents").GetInt64());
        Assert.Equal(JsonValueKind.Null, projection.GetProperty("indicators").GetProperty("selic_pct").ValueKind);
        var goal = projection.GetProperty("goals").EnumerateArray().Single(item => item.GetProperty("name").GetString() == "Viagem");
        Assert.Equal(500000, goal.GetProperty("base_target_cents").GetInt64());
        Assert.Equal("2027-06-30", goal.GetProperty("target_date").GetString());
        var emergency = projection.GetProperty("emergency");
        Assert.Equal(6, emergency.GetProperty("months_target").GetInt32());
        Assert.Equal(400000, emergency.GetProperty("monthly_limit_cents").GetInt64());
        Assert.Equal(4800000, emergency.GetProperty("reserve_target_cents").GetInt64());
    }

    [Fact]
    public async Task Summary_includes_top_expenses_and_daily_expenses()
    {
        using var api = Api();
        var client = api.CreateClient();
        for (var index = 1; index <= 12; index++) await Tx(client, $"2026-09-{index:D2}", $"Gasto {index}", "expense", index * 100);
        await Tx(client, "2026-09-03", "Mais um", "expense", 50);
        await Tx(client, "2026-09-03", "Receita", "income", 999999);
        await Tx(client, "2026-08-31", "Agosto", "expense", 700);

        var summary = await client.GetJsonAsync("/api/summary?month=2026-09");
        var top = summary.GetProperty("top_expenses").EnumerateArray().ToList();
        Assert.Equal(10, top.Count);
        Assert.Equal("Gasto 12", top[0].GetProperty("description").GetString());
        Assert.Equal(1200, top[0].GetProperty("base_amount_cents").GetInt64());
        var daily = summary.GetProperty("daily_expenses").EnumerateArray().ToList();
        Assert.Equal(18, daily.Count);
        Assert.Equal("2026-09-01", daily[0].GetProperty("date").GetString());
        Assert.Equal("2026-09-18", daily[^1].GetProperty("date").GetString());
        Assert.Equal(350, daily[2].GetProperty("total_cents").GetInt64());
        Assert.Equal(0, daily[^1].GetProperty("total_cents").GetInt64());

        var august = (await client.GetJsonAsync("/api/summary?month=2026-08")).GetProperty("daily_expenses").EnumerateArray().ToList();
        Assert.Equal(31, august.Count);
        Assert.Equal(700, august[^1].GetProperty("total_cents").GetInt64());
        Assert.Empty((await client.GetJsonAsync("/api/summary?month=2026-10")).GetProperty("daily_expenses").EnumerateArray());
    }

    private static FinanceApiFactory Api()
    {
        var api = new FinanceApiFactory();
        api.Time.FixedUtcNow = Now;
        return api;
    }

    private static Task<long> Tx(HttpClient client, string date, string description, string kind, long amount, long? category = null, string? method = null,
        string? currency = null, string? rate = null, long? account = null, string? notes = null, long? card = null) =>
        client.CreateAsync("/api/transactions", new
        {
            date, description, kind, amount_cents = amount, category_id = category, payment_method = method ?? "pix", currency, exchange_rate = rate, account_id = account, notes, card_id = card
        });
}
