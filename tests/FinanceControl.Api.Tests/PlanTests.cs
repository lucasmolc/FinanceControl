using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using FinanceControl.Domain.Rules;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Plano 70-20-10 e número da liberdade (MEL-45). Hoje = 18/09/2026 (UTC−3).</summary>
public sealed class PlanTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 18, 12, 0, 0, TimeSpan.Zero);

    // ---------- Critérios de aceite ----------

    [Theory]
    [InlineData(1300000L, 910000L, 260000L, 130000L, 7800000L, 195000000L)]
    [InlineData(1100000L, 770000L, 220000L, 110000L, 6600000L, 165000000L)]
    public async Task Applying_the_suggested_plan_matches_the_acceptance_table(long salary, long fixedLimit, long funLimit, long investMin, long reserve, long freedom)
    {
        using var api = Api();
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = salary });

        var result = await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan());
        Assert.True(result.GetProperty("ok").GetBoolean());
        Assert.Empty(result.GetProperty("created_categories").EnumerateArray());

        var settings = await SettingsAsync(client);
        Assert.Equal(70, settings.GetProperty("plan_fixed_pct").GetInt32());
        Assert.Equal(20, settings.GetProperty("plan_fun_pct").GetInt32());
        Assert.Equal(10, settings.GetProperty("plan_invest_pct").GetInt32());
        Assert.Equal(150, settings.GetProperty("freedom_multiplier").GetInt32());
        Assert.Equal(6, settings.GetProperty("emergency_months_target").GetInt32());
        Assert.Equal(fixedLimit + funLimit, settings.GetProperty("monthly_spending_limit_cents").GetInt64());
        Assert.Equal(reserve, settings.GetProperty("emergency_reserve_target_cents").GetInt64());
        Assert.Equal(freedom, settings.GetProperty("freedom_target_cents").GetInt64());
        Assert.Equal("linked", settings.GetProperty("freedom_goal_status").GetString());
        Assert.True(settings.GetProperty("freedom_goal_auto").GetBoolean());

        var freedomGoalId = settings.GetProperty("freedom_goal_id").GetInt64();
        Assert.Equal(freedomGoalId, result.GetProperty("freedom_goal_id").GetInt64());
        var freedomGoal = await client.RecordAsync("goals", freedomGoalId);
        Assert.Equal("Número da liberdade", freedomGoal.GetProperty("name").GetString());
        Assert.Equal("retirement", freedomGoal.GetProperty("type").GetString());
        Assert.Equal(freedom, freedomGoal.GetProperty("target_cents").GetInt64());
        var reserveGoal = await client.RecordAsync("goals", settings.GetProperty("emergency_goal_id").GetInt64());
        Assert.Equal(reserve, reserveGoal.GetProperty("target_cents").GetInt64());
        Assert.Equal(2, (await client.GetJsonAsync("/api/goals")).GetArrayLength());

        var plan = (await client.GetJsonAsync("/api/summary?month=2026-09")).GetProperty("plan");
        Assert.Equal(fixedLimit, plan.GetProperty("fixed_limit_cents").GetInt64());
        Assert.Equal(funLimit, plan.GetProperty("fun_limit_cents").GetInt64());
        Assert.Equal(investMin, plan.GetProperty("invest_min_cents").GetInt64());

        var projection = await client.GetJsonAsync("/api/projections/base");
        Assert.Equal(freedom, projection.GetProperty("freedom_target_cents").GetInt64());
        var projectionPlan = projection.GetProperty("plan");
        Assert.Equal(70, projectionPlan.GetProperty("fixed_pct").GetInt32());
        Assert.Equal(20, projectionPlan.GetProperty("fun_pct").GetInt32());
        Assert.Equal(10, projectionPlan.GetProperty("invest_pct").GetInt32());
        Assert.Equal(150, projectionPlan.GetProperty("freedom_multiplier").GetInt32());
    }

    [Fact]
    public void Plan_rules_split_the_salary_and_compare_names_without_case_or_accents()
    {
        Assert.Equal(910000, PlanRules.Share(1300000, 70));
        Assert.Equal(3, PlanRules.Share(5, 50));
        Assert.Equal(0, PlanRules.Share(0, 70));
        Assert.Equal(195000000, PlanRules.FreedomTarget(1300000, 150));
        Assert.True(PlanRules.IsValidSplit(70, 20, 10));
        Assert.True(PlanRules.IsValidSplit(100, 0, 0));
        Assert.False(PlanRules.IsValidSplit(70, 20, 5));
        Assert.False(PlanRules.IsValidSplit(110, -10, 0));
        Assert.True(PlanRules.IsFreedomGoalName("  NUMERO  da Liberdade "));
        Assert.True(PlanRules.IsFreedomGoalName("independencia financeira"));
        Assert.False(PlanRules.IsFreedomGoalName("Aposentadoria"));
    }

    [Theory]
    [InlineData("{\"fixed_pct\":70,\"fun_pct\":20,\"invest_pct\":5}", "fixed_pct", "Os percentuais devem somar 100%.")]
    [InlineData("{\"fixed_pct\":110,\"fun_pct\":0,\"invest_pct\":-10}", "invest_pct", "O valor não pode ser negativo.")]
    [InlineData("{\"fixed_pct\":150,\"fun_pct\":0,\"invest_pct\":0}", "fixed_pct", "Os percentuais devem somar 100%.")]
    [InlineData("{\"fixed_pct\":70,\"fun_pct\":20}", "invest_pct", "Campo obrigatório.")]
    [InlineData("{\"fixed_pct\":70.5,\"fun_pct\":19.5,\"invest_pct\":10}", "fixed_pct", "Valor inválido.")]
    [InlineData("{\"fixed_pct\":\"70\",\"fun_pct\":20,\"invest_pct\":10}", "fixed_pct", "Valor inválido.")]
    [InlineData("{\"fixed_pct\":70,\"fun_pct\":20,\"invest_pct\":10,\"emergency_months\":0}", "emergency_months", "Informe um valor entre 1 e 120.")]
    [InlineData("{\"fixed_pct\":70,\"fun_pct\":20,\"invest_pct\":10,\"emergency_months\":121}", "emergency_months", "Informe um valor entre 1 e 120.")]
    [InlineData("{\"fixed_pct\":70,\"fun_pct\":20,\"invest_pct\":10,\"freedom_multiplier\":0}", "freedom_multiplier", "Informe um valor entre 1 e 600.")]
    [InlineData("{\"fixed_pct\":70,\"fun_pct\":20,\"invest_pct\":10,\"freedom_multiplier\":601}", "freedom_multiplier", "Informe um valor entre 1 e 600.")]
    [InlineData("{\"fixed_pct\":70,\"fun_pct\":20,\"invest_pct\":10,\"create_buckets\":\"sim\"}", "create_buckets", "Valor inválido.")]
    [InlineData("[]", "body", "Envie um objeto JSON.")]
    public async Task Plan_inputs_are_validated_and_nothing_is_saved(string body, string field, string message)
    {
        using var api = Api();
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1300000, emergency_months_target = 3 });
        var response = await client.PostRawAsync("/api/plan", body);
        Assert.Equal(message, await response.AssertValidationAsync(field));
        var settings = await SettingsAsync(client);
        Assert.Equal(JsonValueKind.Null, settings.GetProperty("plan_fixed_pct").ValueKind);
        Assert.Equal(3, settings.GetProperty("emergency_months_target").GetInt32());
        Assert.Equal("none", settings.GetProperty("freedom_goal_status").GetString());
    }

    [Fact]
    public async Task Plan_requires_the_net_salary()
    {
        using var api = Api();
        var client = api.CreateClient();
        var response = await client.PostAsJsonAsync("/api/plan", Plan(buckets: true));
        Assert.Equal("Informe o salário líquido para aplicar o plano.", await response.AssertValidationAsync("monthly_net_income_cents"));
        Assert.Empty((await client.GetJsonAsync("/api/goals")).EnumerateArray());
        Assert.Empty((await client.GetJsonAsync("/api/categories")).EnumerateArray());
        Assert.Equal(JsonValueKind.Null, (await SettingsAsync(client)).GetProperty("plan_fixed_pct").ValueKind);

        // O salário pode vir junto no corpo e é gravado na mesma transação.
        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", new { fixed_pct = 60, fun_pct = 30, invest_pct = 10, monthly_net_income_cents = 1000000 });
        var settings = await SettingsAsync(client);
        Assert.Equal(1000000, settings.GetProperty("monthly_net_income_cents").GetInt64());
        Assert.Equal(900000, settings.GetProperty("monthly_spending_limit_cents").GetInt64());
        Assert.Equal(6, settings.GetProperty("emergency_months_target").GetInt32());
        Assert.Equal(150000000, settings.GetProperty("freedom_target_cents").GetInt64());
    }

    // ---------- Anti-duplicação e baldes ----------

    [Fact]
    public async Task Applying_twice_never_duplicates_goals_or_bucket_categories()
    {
        using var api = Api();
        var client = api.CreateClient();
        var leisure = await client.CreateAsync("/api/categories", new { name = "lazer", kind = "expense" });
        var fixedOut = await client.CreateAsync("/api/categories", new { name = "Gastos Fixos", kind = "expense", bucket = "fora" });
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1300000 });

        var first = await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan(buckets: true));
        Assert.Equal(["Investimentos"], first.GetProperty("created_categories").EnumerateArray().Select(item => item.GetString()));
        Assert.Equal(["lazer"], first.GetProperty("marked_categories").EnumerateArray().Select(item => item.GetString()));
        var second = await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan(buckets: true));
        Assert.Empty(second.GetProperty("created_categories").EnumerateArray());
        Assert.Empty(second.GetProperty("marked_categories").EnumerateArray());
        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan(fixedPct: 60, funPct: 30));

        var goals = (await client.GetJsonAsync("/api/goals")).EnumerateArray().ToList();
        Assert.Equal(2, goals.Count);
        Assert.Single(goals, goal => goal.GetProperty("type").GetString() == "emergency");
        Assert.Single(goals, goal => goal.GetProperty("type").GetString() == "retirement");
        Assert.Equal(first.GetProperty("freedom_goal_id").GetInt64(), second.GetProperty("freedom_goal_id").GetInt64());
        Assert.Equal(first.GetProperty("emergency_goal_id").GetInt64(), second.GetProperty("emergency_goal_id").GetInt64());

        var categories = (await client.GetJsonAsync("/api/categories")).EnumerateArray().ToList();
        Assert.Equal(3, categories.Count);
        Assert.Equal("lazer", categories.Single(item => item.GetProperty("id").GetInt64() == leisure).GetProperty("bucket").GetString());
        Assert.Equal("fora", categories.Single(item => item.GetProperty("id").GetInt64() == fixedOut).GetProperty("bucket").GetString());
        var investments = categories.Single(item => item.GetProperty("name").GetString() == "Investimentos");
        Assert.Equal("investment", investments.GetProperty("kind").GetString());
        Assert.Equal("investimento", investments.GetProperty("bucket").GetString());

        // Os percentuais do último "Aplicar" valem; o teto acompanha.
        var settings = await SettingsAsync(client);
        Assert.Equal(60, settings.GetProperty("plan_fixed_pct").GetInt32());
        Assert.Equal(1170000, settings.GetProperty("monthly_spending_limit_cents").GetInt64());
    }

    [Fact]
    public async Task Bucket_categories_are_created_once_on_an_empty_catalog()
    {
        using var api = Api();
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1300000 });
        var result = await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan(buckets: true));
        Assert.Equal(["Gastos fixos", "Lazer", "Investimentos"], result.GetProperty("created_categories").EnumerateArray().Select(item => item.GetString()));
        var state = await client.GetJsonAsync("/api/state");
        var byName = state.GetProperty("categories").EnumerateArray().ToDictionary(item => item.GetProperty("name").GetString()!);
        Assert.Equal(("expense", "fixo"), (byName["Gastos fixos"].GetProperty("kind").GetString(), byName["Gastos fixos"].GetProperty("bucket").GetString()));
        Assert.Equal(("expense", "lazer"), (byName["Lazer"].GetProperty("kind").GetString(), byName["Lazer"].GetProperty("bucket").GetString()));
        Assert.Equal(("investment", "investimento"), (byName["Investimentos"].GetProperty("kind").GetString(), byName["Investimentos"].GetProperty("bucket").GetString()));

        // Sem create_buckets nada é criado.
        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan());
        Assert.Equal(3, (await client.GetJsonAsync("/api/categories")).GetArrayLength());
    }

    [Theory]
    [InlineData("Número da liberdade")]
    [InlineData("Independência financeira")]
    [InlineData("  INDEPENDENCIA   FINANCEIRA ")]
    public async Task Existing_retirement_goal_with_the_freedom_name_is_relinked(string name)
    {
        using var api = Api();
        var client = api.CreateClient();
        var linked = await client.CreateAsync("/api/goals", new { name, type = "retirement", target_cents = 100, current_cents = 5000 });
        var smaller = await client.CreateAsync("/api/goals", new { name = "Número da liberdade", type = "retirement", target_cents = 100, current_cents = 10 });
        await client.CreateAsync("/api/goals", new { name = "Aposentadoria", type = "retirement", target_cents = 100, current_cents = 999999 });
        await client.CreateAsync("/api/goals", new { name = "Número da liberdade", type = "custom", target_cents = 100, current_cents = 888888 });
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1300000 });

        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan());
        var settings = await SettingsAsync(client);
        Assert.Equal(linked, settings.GetProperty("freedom_goal_id").GetInt64());
        Assert.Equal(195000000, (await client.RecordAsync("goals", linked)).GetProperty("target_cents").GetInt64());
        Assert.Equal(100, (await client.RecordAsync("goals", smaller)).GetProperty("target_cents").GetInt64());
        // 4 metas do usuário + a reserva criada; nenhuma meta da liberdade nova.
        Assert.Equal(5, (await client.GetJsonAsync("/api/goals")).GetArrayLength());
    }

    // ---------- Removida, desvinculada e mudança de salário ----------

    [Fact]
    public async Task Removed_freedom_goal_is_not_recreated_and_restoring_it_resyncs_the_target()
    {
        using var api = Api();
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1300000 });
        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan());
        var goalId = (await SettingsAsync(client)).GetProperty("freedom_goal_id").GetInt64();

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/goals/{goalId}")).StatusCode);
        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan());
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1100000 });
        var removed = await SettingsAsync(client);
        Assert.Equal("removed", removed.GetProperty("freedom_goal_status").GetString());
        Assert.Equal(goalId, removed.GetProperty("freedom_goal_id").GetInt64());
        Assert.DoesNotContain((await client.GetJsonAsync("/api/goals")).EnumerateArray(), goal => goal.GetProperty("type").GetString() == "retirement");

        // Desfazer a remoção (MEL-46): a meta volta vinculada e já com o alvo do salário atual.
        await client.SendJsonAsync(HttpMethod.Post, $"/api/goals/{goalId}/restore");
        Assert.Equal("linked", (await SettingsAsync(client)).GetProperty("freedom_goal_status").GetString());
        Assert.Equal(165000000, (await client.RecordAsync("goals", goalId)).GetProperty("target_cents").GetInt64());

        // "Criar novamente" depois de uma nova remoção cria outra meta e religa.
        await client.DeleteAsync($"/api/goals/{goalId}");
        var recreated = await client.SendJsonAsync(HttpMethod.Post, "/api/settings/freedom-goal");
        var newGoal = recreated.GetProperty("goal_id").GetInt64();
        Assert.NotEqual(goalId, newGoal);
        Assert.Equal(165000000, (await client.RecordAsync("goals", newGoal)).GetProperty("target_cents").GetInt64());
        Assert.Equal("linked", (await SettingsAsync(client)).GetProperty("freedom_goal_status").GetString());
    }

    [Fact]
    public async Task Detached_freedom_goal_stops_following_the_salary_until_relinked()
    {
        using var api = Api();
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1300000 });
        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan());
        var settings = await SettingsAsync(client);
        var goalId = settings.GetProperty("freedom_goal_id").GetInt64();
        var reserveId = settings.GetProperty("emergency_goal_id").GetInt64();

        var blocked = await client.PutAsJsonAsync($"/api/goals/{goalId}", new { target_cents = 100000000 });
        Assert.Equal("Esta meta acompanha o salário. Confirme para desligar o cálculo automático.", await blocked.AssertValidationAsync("target_cents"));
        await client.SendJsonAsync(HttpMethod.Put, $"/api/goals/{goalId}", new { name = "Minha liberdade", target_cents = 195000000 });
        await client.SendJsonAsync(HttpMethod.Put, $"/api/goals/{goalId}", new { target_cents = 100000000, detach_auto = true });
        var detached = await SettingsAsync(client);
        Assert.False(detached.GetProperty("freedom_goal_auto").GetBoolean());
        Assert.True(detached.GetProperty("emergency_goal_auto").GetBoolean());
        Assert.Equal("linked", detached.GetProperty("freedom_goal_status").GetString());

        // Salário novo: a reserva acompanha; a meta desvinculada não (nem ao reaplicar o plano).
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1100000 });
        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan());
        Assert.Equal(100000000, (await client.RecordAsync("goals", goalId)).GetProperty("target_cents").GetInt64());
        Assert.Equal(6600000, (await client.RecordAsync("goals", reserveId)).GetProperty("target_cents").GetInt64());
        // Com o cálculo desligado, o alvo pode ser editado sem confirmação.
        await client.SendJsonAsync(HttpMethod.Put, $"/api/goals/{goalId}", new { target_cents = 120000000 });

        // Religar (PUT /api/settings ou POST /api/settings/freedom-goal) volta a sincronizar a mesma meta.
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { freedom_goal_auto = true });
        Assert.Equal(165000000, (await client.RecordAsync("goals", goalId)).GetProperty("target_cents").GetInt64());
        Assert.Equal("Minha liberdade", (await client.RecordAsync("goals", goalId)).GetProperty("name").GetString());
        await client.SendJsonAsync(HttpMethod.Put, $"/api/goals/{goalId}", new { target_cents = 1, detach_auto = true });
        var relinked = await client.SendJsonAsync(HttpMethod.Post, "/api/settings/freedom-goal");
        Assert.Equal(goalId, relinked.GetProperty("goal_id").GetInt64());
        Assert.Equal(165000000, (await client.RecordAsync("goals", goalId)).GetProperty("target_cents").GetInt64());
        Assert.True((await SettingsAsync(client)).GetProperty("freedom_goal_auto").GetBoolean());
    }

    [Fact]
    public async Task Salary_months_and_multiplier_changes_resync_the_linked_goals()
    {
        using var api = Api();
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1300000 });
        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan());
        var settings = await SettingsAsync(client);
        var freedomId = settings.GetProperty("freedom_goal_id").GetInt64();
        var reserveId = settings.GetProperty("emergency_goal_id").GetInt64();

        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1100000 });
        Assert.Equal(165000000, (await client.RecordAsync("goals", freedomId)).GetProperty("target_cents").GetInt64());
        Assert.Equal(6600000, (await client.RecordAsync("goals", reserveId)).GetProperty("target_cents").GetInt64());
        var summaryPlan = (await client.GetJsonAsync("/api/summary")).GetProperty("plan");
        Assert.Equal(770000, summaryPlan.GetProperty("fixed_limit_cents").GetInt64());
        Assert.Equal(220000, summaryPlan.GetProperty("fun_limit_cents").GetInt64());
        Assert.Equal(110000, summaryPlan.GetProperty("invest_min_cents").GetInt64());

        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { freedom_multiplier = 300, emergency_months_target = 12 });
        Assert.Equal(330000000, (await client.RecordAsync("goals", freedomId)).GetProperty("target_cents").GetInt64());
        Assert.Equal(13200000, (await client.RecordAsync("goals", reserveId)).GetProperty("target_cents").GetInt64());
        var saved = await SettingsAsync(client);
        Assert.Equal(300, saved.GetProperty("freedom_multiplier").GetInt32());
        Assert.Equal(330000000, saved.GetProperty("freedom_target_cents").GetInt64());
        Assert.Equal(2, (await client.GetJsonAsync("/api/goals")).GetArrayLength());

        Assert.Equal("Informe um valor entre 1 e 600.", await (await client.PutAsJsonAsync("/api/settings", new { freedom_multiplier = 0 })).AssertValidationAsync("freedom_multiplier"));
        Assert.Equal("Valor inválido.", await (await client.PutAsJsonAsync("/api/settings", new { freedom_goal_auto = "sim" })).AssertValidationAsync("freedom_goal_auto"));
    }

    [Fact]
    public async Task Removing_the_plan_keeps_the_goals_and_stops_the_freedom_sync()
    {
        using var api = Api();
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1300000 });
        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan());
        var freedomId = (await SettingsAsync(client)).GetProperty("freedom_goal_id").GetInt64();

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/plan")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/plan")).StatusCode);
        var settings = await SettingsAsync(client);
        Assert.Equal(JsonValueKind.Null, settings.GetProperty("plan_fixed_pct").ValueKind);
        Assert.Equal(JsonValueKind.Null, settings.GetProperty("plan_fun_pct").ValueKind);
        Assert.Equal(JsonValueKind.Null, settings.GetProperty("plan_invest_pct").ValueKind);
        Assert.Equal(1170000, settings.GetProperty("monthly_spending_limit_cents").GetInt64());
        Assert.Equal(JsonValueKind.Null, (await client.GetJsonAsync("/api/summary")).GetProperty("plan").ValueKind);
        Assert.Equal(JsonValueKind.Null, (await client.GetJsonAsync("/api/projections/base")).GetProperty("plan").ValueKind);
        Assert.Equal(2, (await client.GetJsonAsync("/api/goals")).GetArrayLength());

        // Sem plano a meta da liberdade não acompanha o salário nem exige confirmação para mudar o alvo.
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1100000 });
        Assert.Equal(195000000, (await client.RecordAsync("goals", freedomId)).GetProperty("target_cents").GetInt64());
        await client.SendJsonAsync(HttpMethod.Put, $"/api/goals/{freedomId}", new { target_cents = 5 });
        Assert.Equal("Aplique o plano 70-20-10 para vincular o número da liberdade.",
            await (await client.PostAsync("/api/settings/freedom-goal", null)).AssertValidationAsync("plan"));

        // Reaplicar usa a mesma meta vinculada.
        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan());
        Assert.Equal(freedomId, (await SettingsAsync(client)).GetProperty("freedom_goal_id").GetInt64());
        Assert.Equal(165000000, (await client.RecordAsync("goals", freedomId)).GetProperty("target_cents").GetInt64());
        Assert.Equal(2, (await client.GetJsonAsync("/api/goals")).GetArrayLength());
    }

    // ---------- Resumo por balde e formas de pagamento ----------

    [Fact]
    public async Task Summary_reports_plan_limits_and_spending_by_bucket_and_payment_methods()
    {
        using var api = Api();
        var client = api.CreateClient();
        await CurrencyTests.SetRateAsync(client, "USD", "5");
        var rent = await client.CreateAsync("/api/categories", new { name = "Aluguel", kind = "expense", bucket = "fixo" });
        var cinema = await client.CreateAsync("/api/categories", new { name = "Cinema", kind = "expense", bucket = "lazer" });
        var gifts = await client.CreateAsync("/api/categories", new { name = "Presentes", kind = "expense", bucket = "fora" });
        var market = await client.CreateAsync("/api/categories", new { name = "Mercado", kind = "expense" });
        var pension = await client.CreateAsync("/api/categories", new { name = "Previdência", kind = "expense", bucket = "investimento" });
        var treasury = await client.CreateAsync("/api/categories", new { name = "Tesouro", kind = "investment" });
        var card = await client.CreateAsync("/api/cards", new { name = "Roxo", closing_day = 25, due_day = 5 });

        await Tx(client, "2026-09-05", "Aluguel", "expense", 300000, "pix", rent);
        await Tx(client, "2026-09-06", "Cinema", "expense", 20000, "debit", cinema);
        await Tx(client, "2026-09-07", "Cinema fora", "expense", 1000, "card", cinema, currency: "USD", card: card);
        await Tx(client, "2026-09-08", "Presente", "expense", 7000, "pix", gifts);
        await Tx(client, "2026-09-09", "Feira", "expense", 15000, "cash", market);
        await Tx(client, "2026-09-10", "Sem categoria", "expense", 3000, "pix");
        await Tx(client, "2026-09-11", "Previdência", "expense", 10000, "pix", pension);
        await Tx(client, "2026-09-12", "Tesouro", "investment", 50000, "transfer", treasury);
        await Tx(client, "2026-09-13", "Aporte avulso", "investment", 4000, "transfer");
        await Tx(client, "2026-09-14", "Salário", "income", 1000000, "transfer");
        var removed = await Tx(client, "2026-09-15", "Removido", "expense", 99999, "pix", rent);
        await client.DeleteAsync($"/api/transactions/{removed}");
        await Tx(client, "2026-08-31", "Agosto", "expense", 11111, "pix", rent);

        // Sem plano: payment_methods já vem no resumo e plan é null.
        var withoutPlan = await client.GetJsonAsync("/api/summary?month=2026-09");
        Assert.Equal(JsonValueKind.Null, withoutPlan.GetProperty("plan").ValueKind);
        var methods = withoutPlan.GetProperty("payment_methods").EnumerateArray().ToList();
        Assert.Equal(["pix", "debit", "cash", "card"], methods.Select(item => item.GetProperty("method").GetString()));
        Assert.Equal([320000L, 20000L, 15000L, 5000L], methods.Select(item => item.GetProperty("total_cents").GetInt64()));
        Assert.Equal([4L, 1L, 1L, 1L], methods.Select(item => item.GetProperty("count").GetInt64()));
        Assert.Equal("fixo", withoutPlan.GetProperty("categories").EnumerateArray().Single(item => item.GetProperty("category_id").GetInt64() == rent).GetProperty("bucket").GetString());

        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 1000000 });
        await client.SendJsonAsync(HttpMethod.Post, "/api/plan", Plan());
        var plan = (await client.GetJsonAsync("/api/summary?month=2026-09")).GetProperty("plan");
        Assert.Equal(70, plan.GetProperty("fixed_pct").GetInt32());
        Assert.Equal(700000, plan.GetProperty("fixed_limit_cents").GetInt64());
        Assert.Equal(200000, plan.GetProperty("fun_limit_cents").GetInt64());
        Assert.Equal(100000, plan.GetProperty("invest_min_cents").GetInt64());
        Assert.Equal(300000, plan.GetProperty("fixed_spent_cents").GetInt64());
        Assert.Equal(25000, plan.GetProperty("fun_spent_cents").GetInt64());
        Assert.Equal(64000, plan.GetProperty("invested_cents").GetInt64());
        Assert.Equal(18000, plan.GetProperty("unbucketed_expense_cents").GetInt64());
        Assert.Equal(7000, plan.GetProperty("out_of_plan_expense_cents").GetInt64());

        var august = (await client.GetJsonAsync("/api/summary?month=2026-08")).GetProperty("plan");
        Assert.Equal(11111, august.GetProperty("fixed_spent_cents").GetInt64());
        Assert.Equal(0, august.GetProperty("invested_cents").GetInt64());

        // Relatórios trazem o realizado por balde em cada mês.
        var september = (await client.GetJsonAsync("/api/reports")).GetProperty("months").EnumerateArray().Single(item => item.GetProperty("month").GetString() == "2026-09");
        Assert.Equal(300000, september.GetProperty("fixed_spent_cents").GetInt64());
        Assert.Equal(25000, september.GetProperty("fun_spent_cents").GetInt64());
        Assert.Equal(64000, september.GetProperty("invested_cents").GetInt64());
        Assert.Equal(18000, september.GetProperty("unbucketed_expense_cents").GetInt64());
        Assert.Equal(7000, september.GetProperty("out_of_plan_expense_cents").GetInt64());

        // O resumo congelado no fechamento inclui o plano e as formas de pagamento.
        await client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-08/close");
        var closing = (await client.GetJsonAsync("/api/months/closings")).EnumerateArray().Single().GetProperty("summary");
        Assert.Equal(11111, closing.GetProperty("plan").GetProperty("fixed_spent_cents").GetInt64());
        Assert.Equal("pix", closing.GetProperty("payment_methods")[0].GetProperty("method").GetString());
    }

    [Fact]
    public async Task Categories_accept_and_clear_the_bucket()
    {
        using var api = Api();
        var client = api.CreateClient();
        var id = await client.CreateAsync("/api/categories", new { name = "Streaming", kind = "expense", bucket = "lazer" });
        Assert.Equal("lazer", (await client.RecordAsync("categories", id)).GetProperty("bucket").GetString());
        await client.SendJsonAsync(HttpMethod.Put, $"/api/categories/{id}", new { bucket = "fora" });
        Assert.Equal("fora", (await client.GetJsonAsync("/api/state")).GetProperty("categories").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == id).GetProperty("bucket").GetString());
        await client.SendJsonAsync(HttpMethod.Put, $"/api/categories/{id}", new { bucket = (string?)null });
        Assert.Equal(JsonValueKind.Null, (await client.RecordAsync("categories", id)).GetProperty("bucket").ValueKind);
        await client.SendJsonAsync(HttpMethod.Put, $"/api/categories/{id}", new { bucket = "fixo" });
        await client.SendJsonAsync(HttpMethod.Put, $"/api/categories/{id}", new { bucket = "" });
        Assert.Equal(JsonValueKind.Null, (await client.RecordAsync("categories", id)).GetProperty("bucket").ValueKind);
        var plain = await client.CreateAsync("/api/categories", new { name = "Sem balde", kind = "income" });
        Assert.Equal(JsonValueKind.Null, (await client.RecordAsync("categories", plain)).GetProperty("bucket").ValueKind);

        Assert.Equal("Opção inválida.", await (await client.PostAsJsonAsync("/api/categories", new { name = "X", kind = "expense", bucket = "extra" })).AssertValidationAsync("bucket"));
        Assert.Equal("Valor inválido.", await (await client.PutAsJsonAsync($"/api/categories/{id}", new { bucket = 3 })).AssertValidationAsync("bucket"));
    }

    private static FinanceApiFactory Api()
    {
        var api = new FinanceApiFactory();
        api.Time.FixedUtcNow = Now;
        return api;
    }

    private static object Plan(int fixedPct = 70, int funPct = 20, int investPct = 10, int months = 6, int multiplier = 150, bool buckets = false) =>
        new { fixed_pct = fixedPct, fun_pct = funPct, invest_pct = investPct, emergency_months = months, freedom_multiplier = multiplier, create_buckets = buckets };

    private static async Task<JsonElement> SettingsAsync(HttpClient client) => (await client.GetJsonAsync("/api/state")).GetProperty("settings");

    private static Task<long> Tx(HttpClient client, string date, string description, string kind, long amount, string method, long? category = null, string? currency = null, long? card = null) =>
        client.CreateAsync("/api/transactions", new { date, description, kind, amount_cents = amount, payment_method = method, category_id = category, currency, card_id = card });
}
