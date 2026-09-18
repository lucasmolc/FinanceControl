using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

public sealed class SummaryTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Summary_aggregates_month_transactions_categories_and_bills()
    {
        var market = await _client.CreateAsync("/api/categories", new { name = "Mercado", kind = "expense", monthly_budget_cents = 100000 });
        var old = await _client.CreateAsync("/api/categories", new { name = "Antiga", kind = "expense", monthly_budget_cents = 20000 });
        var empty = await _client.CreateAsync("/api/categories", new { name = "Vazia", kind = "expense" });
        var unusedInactive = await _client.CreateAsync("/api/categories", new { name = "Inativa sem gasto", kind = "expense" });
        var salary = await _client.CreateAsync("/api/categories", new { name = "Salário", kind = "income" });

        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2031-05-05", description = "Salário", kind = "income", amount_cents = 500000, category_id = salary });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2031-05-06", description = "Compras", kind = "expense", amount_cents = 25000, category_id = market });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2031-05-07", description = "Legado", kind = "expense", amount_cents = 10000, category_id = old });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2031-05-31", description = "Sem categoria", kind = "expense", amount_cents = 7000 });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2031-05-08", description = "Aporte", kind = "investment", amount_cents = 30000 });
        var removed = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2031-05-09", description = "Removida", kind = "expense", amount_cents = 99999, category_id = market });
        await _client.DeleteAsync($"/api/transactions/{removed}");
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2031-06-01", description = "Outro mês", kind = "expense", amount_cents = 5555, category_id = market });
        await _client.DeleteAsync($"/api/categories/{old}");
        await _client.DeleteAsync($"/api/categories/{unusedInactive}");

        var rent = await _client.CreateAsync("/api/bills", new { name = "Aluguel", amount_cents = 160000 });
        var light = await _client.CreateAsync("/api/bills", new { name = "Luz", amount_cents = 90000 });
        var inactiveBill = await _client.CreateAsync("/api/bills", new { name = "Antiga", amount_cents = 1000 });
        await _client.DeleteAsync($"/api/bills/{inactiveBill}");
        await _client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = light, month = "2031-05", paid = true, register_transaction = false });
        await _client.SendJsonAsync(HttpMethod.Post, "/api/checklist", new { bill_id = rent, month = "2031-06", paid = true, register_transaction = false });

        var summary = await _client.GetJsonAsync("/api/summary?month=2031-05");
        Assert.Equal("2031-05", summary.GetProperty("month").GetString());
        Assert.Equal(500000, summary.GetProperty("income_cents").GetInt64());
        Assert.Equal(42000, summary.GetProperty("expense_cents").GetInt64());
        Assert.Equal(30000, summary.GetProperty("investment_cents").GetInt64());
        Assert.Equal(5, summary.GetProperty("transactions_count").GetInt64());
        Assert.Equal(7000, summary.GetProperty("uncategorized_expense_cents").GetInt64());

        var categories = summary.GetProperty("categories").EnumerateArray().ToList();
        Assert.Equal(["Mercado", "Antiga", "Vazia"], categories.Select(item => item.GetProperty("name").GetString()));
        Assert.Equal([25000L, 10000L, 0L], categories.Select(item => item.GetProperty("spent_cents").GetInt64()));
        Assert.Equal([true, false, true], categories.Select(item => item.GetProperty("active").GetBoolean()));
        Assert.Equal(100000, categories[0].GetProperty("monthly_budget_cents").GetInt64());
        Assert.Equal(empty, categories[2].GetProperty("category_id").GetInt64());

        var bills = summary.GetProperty("bills");
        Assert.Equal(2, bills.GetProperty("total_count").GetInt64());
        Assert.Equal(1, bills.GetProperty("paid_count").GetInt64());
        Assert.Equal(250000, bills.GetProperty("total_cents").GetInt64());
        Assert.Equal(90000, bills.GetProperty("paid_cents").GetInt64());
    }
}

/// <summary>Banco próprio: as categorias criadas aqui não interferem nas listas exatas de <see cref="SummaryTests"/>.</summary>
public sealed class RealizedCategorySummaryTests(FinanceApiFactory factory) : IClassFixture<FinanceApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Summary_reports_realized_income_and_investment_categories()
    {
        var salary = await _client.CreateAsync("/api/categories", new { name = "Salário principal", kind = "income" });
        var extra = await _client.CreateAsync("/api/categories", new { name = "Extra", kind = "income" });
        var freelance = await _client.CreateAsync("/api/categories", new { name = "Freela", kind = "income" });
        var unusedIncome = await _client.CreateAsync("/api/categories", new { name = "Bônus", kind = "income" });
        var treasury = await _client.CreateAsync("/api/categories", new { name = "Tesouro", kind = "investment" });
        var stocks = await _client.CreateAsync("/api/categories", new { name = "Ações", kind = "investment" });
        var groceries = await _client.CreateAsync("/api/categories", new { name = "Feira", kind = "expense" });

        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2032-03-05", description = "Salário", kind = "income", amount_cents = 500000, category_id = salary });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2032-03-06", description = "Projeto", kind = "income", amount_cents = 80000, category_id = freelance });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2032-03-07", description = "Pix recebido", kind = "income", amount_cents = 1500 });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2032-03-08", description = "Categoria trocada", kind = "income", amount_cents = 700, category_id = groceries });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2032-03-09", description = "Aporte Tesouro", kind = "investment", amount_cents = 30000, category_id = treasury });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2032-03-10", description = "Aporte avulso", kind = "investment", amount_cents = 4000 });
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2032-03-11", description = "Feira", kind = "expense", amount_cents = 9000, category_id = groceries });
        var removed = await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2032-03-12", description = "Removida", kind = "income", amount_cents = 99999, category_id = extra });
        await _client.DeleteAsync($"/api/transactions/{removed}");
        await _client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2032-04-01", description = "Outro mês", kind = "income", amount_cents = 1234, category_id = extra });
        await _client.DeleteAsync($"/api/categories/{freelance}");
        await _client.DeleteAsync($"/api/categories/{unusedIncome}");

        var summary = await _client.GetJsonAsync("/api/summary?month=2032-03");
        Assert.Equal(582200, summary.GetProperty("income_cents").GetInt64());
        Assert.Equal(34000, summary.GetProperty("investment_cents").GetInt64());
        Assert.Equal(9000, summary.GetProperty("expense_cents").GetInt64());
        Assert.Equal(2200, summary.GetProperty("uncategorized_income_cents").GetInt64());
        Assert.Equal(4000, summary.GetProperty("uncategorized_investment_cents").GetInt64());
        Assert.Equal(0, summary.GetProperty("uncategorized_expense_cents").GetInt64());

        long[] mine = [salary, extra, freelance, unusedIncome, treasury, stocks, groceries];
        List<JsonElement> Mine(string property) =>
            summary.GetProperty(property).EnumerateArray().Where(item => mine.Contains(item.GetProperty("category_id").GetInt64())).ToList();
        var income = Mine("income_categories");
        Assert.Equal(["Salário principal", "Freela", "Extra"], income.Select(item => item.GetProperty("name").GetString()));
        Assert.Equal([500000L, 80000L, 0L], income.Select(item => item.GetProperty("spent_cents").GetInt64()));
        Assert.Equal([true, false, true], income.Select(item => item.GetProperty("active").GetBoolean()));
        Assert.Equal([salary, freelance, extra], income.Select(item => item.GetProperty("category_id").GetInt64()));
        Assert.All(income, item => Assert.Equal(0, item.GetProperty("monthly_budget_cents").GetInt64()));

        var investment = Mine("investment_categories");
        Assert.Equal(["Tesouro", "Ações"], investment.Select(item => item.GetProperty("name").GetString()));
        Assert.Equal([30000L, 0L], investment.Select(item => item.GetProperty("spent_cents").GetInt64()));
        Assert.Equal(stocks, investment[1].GetProperty("category_id").GetInt64());

        Assert.Equal(["Feira"], Mine("categories").Select(item => item.GetProperty("name").GetString()));

        var empty = await _client.GetJsonAsync("/api/summary?month=2040-01");
        Assert.Equal(0, empty.GetProperty("uncategorized_income_cents").GetInt64());
        var emptyIncome = empty.GetProperty("income_categories").EnumerateArray().ToList();
        Assert.All(emptyIncome, item => Assert.Equal(0, item.GetProperty("spent_cents").GetInt64()));
        Assert.Contains(emptyIncome, item => item.GetProperty("category_id").GetInt64() == extra);
        Assert.DoesNotContain(emptyIncome, item => item.GetProperty("category_id").GetInt64() == freelance);
    }
}
