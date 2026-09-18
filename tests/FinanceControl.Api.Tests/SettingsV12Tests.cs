using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FinanceControl.Api.Tests.Support;
using Xunit;

namespace FinanceControl.Api.Tests;

/// <summary>Preferências de interface, marcas/logos/ícones/cores (MEL-30/33/35/39), reserva de emergência (MEL-43) e ajustes de fatura (MEL-44).</summary>
public sealed class SettingsV12Tests
{
    private const string TinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // ---------- Preferências ----------

    [Fact]
    public async Task Ui_preferences_have_defaults_and_merge_partial_updates()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        var defaults = (await client.GetJsonAsync("/api/state")).GetProperty("settings");
        var preferences = defaults.GetProperty("ui_preferences");
        Assert.Equal("noite", preferences.GetProperty("theme").GetString());
        Assert.Equal("esmeralda", preferences.GetProperty("accent").GetString());
        Assert.Equal("confortavel", preferences.GetProperty("density").GetString());
        Assert.True(preferences.GetProperty("animations").GetBoolean());
        Assert.False(preferences.GetProperty("hide_values").GetBoolean());
        Assert.True(preferences.GetProperty("show_market_ticker").GetBoolean());
        Assert.Equal(["saldo", "contas", "fluxo", "ritmo", "categorias", "orcamento", "metas", "plano"],
            preferences.GetProperty("dashboard_widgets").EnumerateArray().Select(item => item.GetString()));
        Assert.True(defaults.GetProperty("market_auto_refresh").GetBoolean());

        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { ui_preferences = new { theme = "claro", hide_values = true, dashboard_widgets = new[] { "mercado", "saldo" } } });
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { ui_preferences = new { accent = "ouro" }, display_name = "Lucas" });
        var saved = (await client.GetJsonAsync("/api/state")).GetProperty("settings");
        var merged = saved.GetProperty("ui_preferences");
        Assert.Equal("claro", merged.GetProperty("theme").GetString());
        Assert.Equal("ouro", merged.GetProperty("accent").GetString());
        Assert.True(merged.GetProperty("hide_values").GetBoolean());
        Assert.Equal(["mercado", "saldo"], merged.GetProperty("dashboard_widgets").EnumerateArray().Select(item => item.GetString()));
        Assert.Equal("Lucas", saved.GetProperty("display_name").GetString());

        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { ui_preferences = new { dashboard_widgets = Array.Empty<string>() } });
        Assert.Empty((await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("ui_preferences").GetProperty("dashboard_widgets").EnumerateArray());
    }

    [Fact]
    public async Task Dashboard_accepts_every_widget_including_the_plan_widget()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        string[] all = ["saldo", "fluxo", "contas", "categorias", "metas", "mercado", "assinaturas", "patrimonio", "maiores_gastos", "ritmo", "orcamento", "pagamentos", "plano"];
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { ui_preferences = new { dashboard_widgets = all } });
        Assert.Equal(all, (await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("ui_preferences").GetProperty("dashboard_widgets").EnumerateArray().Select(item => item.GetString()));

        // "Restaurar padrão" do frontend envia o painel padrão (CR-13), que inclui o plano.
        string[] defaults = ["saldo", "contas", "fluxo", "ritmo", "categorias", "orcamento", "metas", "plano"];
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { ui_preferences = new { dashboard_widgets = defaults } });
        Assert.Equal(defaults, (await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("ui_preferences").GetProperty("dashboard_widgets").EnumerateArray().Select(item => item.GetString()));
    }

    [Theory]
    [InlineData("{\"ui_preferences\":{\"theme\":\"rosa\"}}", "ui_preferences.theme", "Opção inválida.")]
    [InlineData("{\"ui_preferences\":{\"accent\":1}}", "ui_preferences.accent", "Valor inválido.")]
    [InlineData("{\"ui_preferences\":{\"density\":\"apertado\"}}", "ui_preferences.density", "Opção inválida.")]
    [InlineData("{\"ui_preferences\":{\"animations\":\"sim\"}}", "ui_preferences.animations", "Valor inválido.")]
    [InlineData("{\"ui_preferences\":{\"font\":\"serif\"}}", "ui_preferences.font", "Campo não permitido.")]
    [InlineData("{\"ui_preferences\":{\"dashboard_widgets\":[\"saldo\",\"saldo\"]}}", "ui_preferences.dashboard_widgets", "Opção inválida.")]
    [InlineData("{\"ui_preferences\":{\"dashboard_widgets\":[\"clima\"]}}", "ui_preferences.dashboard_widgets", "Opção inválida.")]
    [InlineData("{\"ui_preferences\":{\"dashboard_widgets\":\"saldo\"}}", "ui_preferences.dashboard_widgets", "Valor inválido.")]
    [InlineData("{\"ui_preferences\":[1]}", "ui_preferences", "Envie um objeto JSON.")]
    [InlineData("{\"market_auto_refresh\":\"sim\"}", "market_auto_refresh", "Valor inválido.")]
    [InlineData("{\"currency\":\"reais\"}", "currency", "Use o código da moeda com 3 letras maiúsculas, como BRL.")]
    [InlineData("{\"display_name\":7}", "display_name", "Valor inválido.")]
    [InlineData("{\"monthly_net_income_cents\":-1}", "monthly_net_income_cents", "O valor não pode ser negativo.")]
    public async Task Settings_inputs_are_validated(string body, string field, string message)
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        var response = await client.PutAsync("/api/settings", new StringContent(body, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(message, await response.AssertValidationAsync(field));
        Assert.Equal("noite", (await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("ui_preferences").GetProperty("theme").GetString());
    }

    [Fact]
    public async Task Null_settings_fields_keep_the_current_values()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_spending_limit_cents = 1234 });
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_spending_limit_cents = (long?)null, ui_preferences = (object?)null, unknown_field = 1 });
        Assert.Equal(1234, (await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("monthly_spending_limit_cents").GetInt64());
    }

    // ---------- Marcas, logos, ícones e cores ----------

    [Fact]
    public async Task Brand_logo_icon_color_and_network_fields_are_saved()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        var account = await client.CreateAsync("/api/bank-accounts", new { name = "Roxinha", institution = "Nubank", brand = "nubank", logo_data = TinyPng });
        var investment = await client.CreateAsync("/api/investments", new { name = "CDB", brand = "xp" });
        var card = await client.CreateAsync("/api/cards", new { name = "Ultravioleta", brand = "nubank", network = "mastercard", color = "#820AD1" });
        var category = await client.CreateAsync("/api/categories", new { name = "Streaming", kind = "expense", icon = "tv", color = "#112233" });
        var subscription = await client.CreateAsync("/api/subscriptions", new { name = "Netflix", amount_cents = 5590, icon = "tv", brand = "netflix" });
        var bill = await client.CreateAsync("/api/bills", new { name = "Luz", amount_cents = 100, icon = "zap", brand = "enel" });
        var transaction = await client.CreateAsync("/api/transactions", new { payment_method = "pix", date = "2026-09-01", description = "iFood", kind = "expense", amount_cents = 100, brand = "ifood" });

        var state = await client.GetJsonAsync("/api/state");
        var savedAccount = state.GetProperty("bank_accounts").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == account);
        Assert.Equal("nubank", savedAccount.GetProperty("brand").GetString());
        Assert.Equal(TinyPng, savedAccount.GetProperty("logo_data").GetString());
        Assert.Equal("BRL", savedAccount.GetProperty("currency").GetString());
        Assert.Equal("xp", state.GetProperty("investments").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == investment).GetProperty("brand").GetString());
        var savedCard = state.GetProperty("cards").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == card);
        Assert.Equal("mastercard", savedCard.GetProperty("network").GetString());
        Assert.Equal("#820AD1", savedCard.GetProperty("color").GetString());
        var savedCategory = state.GetProperty("categories").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == category);
        Assert.Equal("tv", savedCategory.GetProperty("icon").GetString());
        Assert.Equal("#112233", savedCategory.GetProperty("color").GetString());
        Assert.Equal("netflix", state.GetProperty("subscriptions").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == subscription).GetProperty("brand").GetString());
        Assert.Equal("zap", state.GetProperty("bills").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == bill).GetProperty("icon").GetString());
        Assert.Equal("ifood", state.GetProperty("transactions").EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == transaction).GetProperty("brand").GetString());

        // null ou texto vazio limpa.
        await client.SendJsonAsync(HttpMethod.Put, $"/api/bank-accounts/{account}", new { logo_data = (string?)null, brand = "" });
        var cleared = await client.RecordAsync("bank-accounts", account);
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("logo_data").ValueKind);
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("brand").ValueKind);
    }

    [Theory]
    [InlineData("bank-accounts", "{\"name\":\"A\",\"institution\":\"B\",\"brand\":\"Nubank\"}", "brand", "Use até 40 caracteres entre letras minúsculas, números, - e _.")]
    [InlineData("investments", "{\"name\":\"I\",\"brand\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}", "brand", "Use até 40 caracteres entre letras minúsculas, números, - e _.")]
    [InlineData("categories", "{\"name\":\"C\",\"kind\":\"expense\",\"icon\":\"shopping cart\"}", "icon", "Use até 40 caracteres entre letras minúsculas, números, - e _.")]
    [InlineData("categories", "{\"name\":\"C\",\"kind\":\"expense\",\"color\":\"red\"}", "color", "Use uma cor no formato #RRGGBB.")]
    [InlineData("cards", "{\"name\":\"C\",\"color\":\"#12345\"}", "color", "Use uma cor no formato #RRGGBB.")]
    [InlineData("cards", "{\"name\":\"C\",\"network\":\"diners\"}", "network", "Opção inválida.")]
    [InlineData("bank-accounts", "{\"name\":\"A\",\"institution\":\"B\",\"logo_data\":\"data:image/gif;base64,R0lGOD==\"}", "logo_data", "Use uma imagem PNG, JPG, WEBP ou SVG de até 150 KB.")]
    [InlineData("investments", "{\"name\":\"I\",\"logo_data\":\"https://example.com/logo.png\"}", "logo_data", "Use uma imagem PNG, JPG, WEBP ou SVG de até 150 KB.")]
    [InlineData("investments", "{\"name\":\"I\",\"logo_data\":42}", "logo_data", "Use uma imagem PNG, JPG, WEBP ou SVG de até 150 KB.")]
    [InlineData("transactions", "{\"date\":\"2026-01-01\",\"description\":\"X\",\"kind\":\"expense\",\"amount_cents\":1,\"brand\":\"Uber!\"}", "brand", "Use até 40 caracteres entre letras minúsculas, números, - e _.")]
    [InlineData("transactions", "{\"date\":\"2026-01-01\",\"description\":\"X\",\"kind\":\"expense\",\"amount_cents\":1,\"payment_method\":\"auto_debit\"}", null, null)]
    public async Task Brand_logo_icon_and_color_are_validated(string module, string body, string? field, string? message)
    {
        using var api = new FinanceApiFactory();
        var response = await api.CreateClient().PostRawAsync($"/api/{module}", body);
        if (field is null) { Assert.Equal(HttpStatusCode.Created, response.StatusCode); return; }
        Assert.Equal(message, await response.AssertValidationAsync(field));
    }

    [Fact]
    public async Task Logo_data_accepts_svg_and_rejects_more_than_200000_characters()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        await client.CreateAsync("/api/investments", new { name = "SVG", logo_data = "data:image/svg+xml;base64,PHN2Zy8+" });
        var large = "data:image/webp;base64," + new string('A', 200_000 - 23 + 1);
        Assert.Equal("Use uma imagem PNG, JPG, WEBP ou SVG de até 150 KB.", await (await client.PostAsJsonAsync("/api/investments", new { name = "Grande", logo_data = large })).AssertValidationAsync("logo_data"));
        await client.CreateAsync("/api/investments", new { name = "No limite", logo_data = large[..^1] });
    }

    // ---------- Reserva de emergência (MEL-43) ----------

    [Fact]
    public async Task Saving_income_creates_the_linked_reserve_goal_and_keeps_its_target_in_sync()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        var none = (await client.GetJsonAsync("/api/state")).GetProperty("settings");
        Assert.Equal("none", none.GetProperty("emergency_goal_status").GetString());
        Assert.Equal(0, none.GetProperty("emergency_reserve_target_cents").GetInt64());
        Assert.True(none.GetProperty("emergency_goal_auto").GetBoolean());

        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 500000, emergency_months_target = 6 });
        var settings = (await client.GetJsonAsync("/api/state")).GetProperty("settings");
        Assert.Equal("linked", settings.GetProperty("emergency_goal_status").GetString());
        Assert.Equal(3000000, settings.GetProperty("emergency_reserve_target_cents").GetInt64());
        var goalId = settings.GetProperty("emergency_goal_id").GetInt64();
        var goal = await client.RecordAsync("goals", goalId);
        Assert.Equal("Reserva de emergência", goal.GetProperty("name").GetString());
        Assert.Equal("emergency", goal.GetProperty("type").GetString());
        Assert.Equal(3000000, goal.GetProperty("target_cents").GetInt64());

        // Idempotente: salvar de novo não cria outra meta; mudar os meses atualiza o alvo.
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { emergency_months_target = 3 });
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { display_name = "Outro nome" });
        var goals = (await client.GetJsonAsync("/api/goals")).EnumerateArray().ToList();
        Assert.Single(goals);
        Assert.Equal(1500000, goals[0].GetProperty("target_cents").GetInt64());

        // Meta removida: nada é recriado automaticamente; "Criar novamente" cria outra e religa.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/goals/{goalId}")).StatusCode);
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 600000 });
        var removed = (await client.GetJsonAsync("/api/state")).GetProperty("settings");
        Assert.Equal("removed", removed.GetProperty("emergency_goal_status").GetString());
        Assert.Empty((await client.GetJsonAsync("/api/goals")).EnumerateArray());

        var recreated = await client.SendJsonAsync(HttpMethod.Post, "/api/settings/emergency-goal");
        Assert.True(recreated.GetProperty("ok").GetBoolean());
        var newGoal = recreated.GetProperty("goal_id").GetInt64();
        Assert.NotEqual(goalId, newGoal);
        Assert.Equal(1800000, (await client.RecordAsync("goals", newGoal)).GetProperty("target_cents").GetInt64());
        Assert.Equal("linked", (await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("emergency_goal_status").GetString());
    }

    [Fact]
    public async Task Existing_emergency_goal_with_most_savings_is_linked_instead_of_creating_one()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        await client.CreateAsync("/api/goals", new { name = "Reserva antiga", type = "emergency", target_cents = 100, current_cents = 500 });
        var richer = await client.CreateAsync("/api/goals", new { name = "Colchão", type = "emergency", target_cents = 100, current_cents = 9000 });
        await client.CreateAsync("/api/goals", new { name = "Viagem", type = "travel", target_cents = 100, current_cents = 99999 });

        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 100000, emergency_months_target = 2 });
        var settings = (await client.GetJsonAsync("/api/state")).GetProperty("settings");
        Assert.Equal(richer, settings.GetProperty("emergency_goal_id").GetInt64());
        Assert.Equal(200000, (await client.RecordAsync("goals", richer)).GetProperty("target_cents").GetInt64());
        Assert.Equal(3, (await client.GetJsonAsync("/api/goals")).GetArrayLength());
    }

    [Fact]
    public async Task Editing_the_linked_goal_target_requires_detaching_the_automatic_calculation()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 100000, emergency_months_target = 6 });
        var goalId = (await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("emergency_goal_id").GetInt64();
        var url = $"/api/goals/{goalId}";

        var blocked = await client.PutAsJsonAsync(url, new { target_cents = 999999 });
        Assert.Equal("Esta meta acompanha o salário. Confirme para desligar o cálculo automático.", await blocked.AssertValidationAsync("target_cents"));
        // Outros campos (e o mesmo alvo) continuam editáveis.
        await client.SendJsonAsync(HttpMethod.Put, url, new { name = "Minha reserva", target_cents = 600000 });

        await client.SendJsonAsync(HttpMethod.Put, url, new { target_cents = 999999, detach_auto = true });
        var settings = (await client.GetJsonAsync("/api/state")).GetProperty("settings");
        Assert.False(settings.GetProperty("emergency_goal_auto").GetBoolean());
        Assert.Equal("linked", settings.GetProperty("emergency_goal_status").GetString());
        Assert.Equal(999999, (await client.RecordAsync("goals", goalId)).GetProperty("target_cents").GetInt64());

        // Com o cálculo desligado, salvar o salário não mexe mais na meta.
        await client.SendJsonAsync(HttpMethod.Put, "/api/settings", new { monthly_net_income_cents = 200000 });
        Assert.Equal(999999, (await client.RecordAsync("goals", goalId)).GetProperty("target_cents").GetInt64());

        // "Criar novamente"/religar reativa o cálculo e volta a sincronizar a meta vinculada.
        var relinked = await client.SendJsonAsync(HttpMethod.Post, "/api/settings/emergency-goal");
        Assert.Equal(goalId, relinked.GetProperty("goal_id").GetInt64());
        Assert.Equal(1200000, (await client.RecordAsync("goals", goalId)).GetProperty("target_cents").GetInt64());
        Assert.True((await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("emergency_goal_auto").GetBoolean());
    }

    [Fact]
    public async Task Emergency_goal_endpoint_requires_income_and_setup_syncs_the_goal()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        Assert.Equal("Informe o salário líquido e os meses de reserva para calcular a meta.",
            await (await client.PostAsync("/api/settings/emergency-goal", null)).AssertValidationAsync("monthly_net_income_cents"));

        var setup = await client.PostAsJsonAsync("/api/setup", new
        {
            display_name = "Ana", monthly_net_income_cents = 400000, monthly_spending_limit_cents = 300000, emergency_months_target = 4,
            goals = new[] { new { name = "Reserva", type = "emergency", target_cents = 100, current_cents = 5000 } }
        });
        setup.EnsureSuccessStatusCode();
        var goals = (await client.GetJsonAsync("/api/goals")).EnumerateArray().ToList();
        var goal = Assert.Single(goals);
        Assert.Equal(1600000, goal.GetProperty("target_cents").GetInt64());
        Assert.Equal(goal.GetProperty("id").GetInt64(), (await client.GetJsonAsync("/api/state")).GetProperty("settings").GetProperty("emergency_goal_id").GetInt64());
    }

    [Fact]
    public async Task Backup_includes_the_v12_tables_and_restores_them()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        await CurrencyTests.SetRateAsync(client, "EUR", "6.2");
        await client.GetJsonAsync("/api/state");
        var backup = await client.GetJsonAsync("/api/backup");
        var data = backup.GetProperty("data");
        Assert.Equal("6.2", data.GetProperty("exchange_rates")[0].GetProperty("rate_brl").GetString());
        Assert.Equal(1, data.GetProperty("net_worth_snapshots").GetArrayLength());
        Assert.Equal(0, data.GetProperty("market_indicators").GetArrayLength());

        await CurrencyTests.SetRateAsync(client, "EUR", "9");
        var restored = await client.SendJsonAsync(HttpMethod.Post, "/api/backup/restore", backup);
        Assert.Equal(1, restored.GetProperty("restored").GetProperty("exchange_rates").GetInt64());
        Assert.Equal("6.2", (await client.GetJsonAsync("/api/market")).GetProperty("rates")[0].GetProperty("rate_brl").GetString());
    }

    // ---------- MEL-44 ----------

    [Fact]
    public async Task Reversing_the_invoice_payment_entry_unpays_the_invoice_and_undo_pays_it_again()
    {
        using var api = new FinanceApiFactory();
        api.Time.FixedUtcNow = new DateTimeOffset(2026, 9, 18, 12, 0, 0, TimeSpan.Zero);
        var client = api.CreateClient();
        var card = await client.CreateAsync("/api/cards", new { name = "Roxo", closing_day = 25, due_day = 5 });
        var account = await client.CreateAccountAsync("Corrente", 100000);
        await client.CreateAsync("/api/transactions", new { date = "2026-08-10", description = "Compra", kind = "expense", amount_cents = 3000, card_id = card });
        var paid = await client.SendJsonAsync(HttpMethod.Post, $"/api/cards/{card}/invoices/2026-09/pay", new { account_id = account }, HttpStatusCode.Created);
        var entryId = paid.GetProperty("bank_entry_id").GetInt64();
        Assert.Equal(97000, await client.AccountBalanceAsync(account));

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/bank-accounts/{account}/entries/{entryId}")).StatusCode);
        Assert.Equal(100000, await client.AccountBalanceAsync(account));
        var invoice = await client.GetJsonAsync($"/api/cards/{card}/invoices/2026-09");
        Assert.Equal(JsonValueKind.Null, invoice.GetProperty("paid").ValueKind);
        Assert.Equal("vencida", invoice.GetProperty("status").GetString());

        await client.SendJsonAsync(HttpMethod.Post, $"/api/bank-accounts/{account}/entries/{entryId}/restore");
        Assert.Equal(97000, await client.AccountBalanceAsync(account));
        var repaid = await client.GetJsonAsync($"/api/cards/{card}/invoices/2026-09");
        Assert.Equal("paga", repaid.GetProperty("status").GetString());
        Assert.Equal(entryId, repaid.GetProperty("paid").GetProperty("bank_entry_id").GetInt64());

        // Fatura de mês fechado: o estorno pelo extrato respeita o fechamento.
        await client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-09/close");
        Assert.Equal("O mês 09/2026 está fechado. Reabra-o para alterar.", await (await client.DeleteAsync($"/api/bank-accounts/{account}/entries/{entryId}")).AssertValidationAsync("date"));
        await client.SendJsonAsync(HttpMethod.Post, "/api/months/2026-09/reopen");

        // Se a fatura foi paga de novo depois do estorno, desfazer o estorno é recusado.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/bank-accounts/{account}/entries/{entryId}")).StatusCode);
        await client.SendJsonAsync(HttpMethod.Post, $"/api/cards/{card}/invoices/2026-09/pay", new { account_id = account }, HttpStatusCode.Created);
        var conflict = await client.PostAsync($"/api/bank-accounts/{account}/entries/{entryId}/restore", null);
        Assert.Equal("Esta fatura já foi paga.", await conflict.AssertValidationAsync("entry"));
        Assert.Equal(97000, await client.AccountBalanceAsync(account));
    }

    [Fact]
    public async Task Card_reassign_moves_live_transactions_too()
    {
        using var api = new FinanceApiFactory();
        var client = api.CreateClient();
        var source = await client.CreateAsync("/api/cards", new { name = "Antigo" });
        var target = await client.CreateAsync("/api/cards", new { name = "Novo" });
        var live = await client.CreateAsync("/api/transactions", new { date = "2026-09-01", description = "A", kind = "expense", amount_cents = 100, card_id = source });
        var removed = await client.CreateAsync("/api/transactions", new { date = "2026-09-02", description = "B", kind = "expense", amount_cents = 100, card_id = source });
        await client.DeleteAsync($"/api/transactions/{removed}");
        await client.CreateAsync("/api/subscriptions", new { name = "S", amount_cents = 100, card_id = source });

        var result = await client.SendJsonAsync(HttpMethod.Post, $"/api/cards/{source}/reassign", new { target_id = target });
        Assert.Equal(1, result.GetProperty("updated").GetProperty("transactions").GetInt64());
        Assert.Equal(1, result.GetProperty("updated").GetProperty("subscriptions").GetInt64());
        var moved = (await client.GetJsonAsync("/api/transactions")).EnumerateArray().Single(item => item.GetProperty("id").GetInt64() == live);
        Assert.Equal("Novo", moved.GetProperty("card_name").GetString());
        var links = await client.GetJsonAsync($"/api/cards/{source}/links");
        Assert.Equal(0, links.GetProperty("transactions").GetInt64());
    }
}
