using System.Text.Json;
using Dapper;
using FinanceControl.Domain.Entities;
using FinanceControl.Domain.Rules;
using Microsoft.Data.Sqlite;

namespace FinanceControl.Infrastructure.Persistence;

/// <summary>v1.2: configurações estendidas, reserva de emergência, mercado, patrimônio e consultas de relatórios.</summary>
public sealed partial class SqliteFinanceStore
{
    // ---------- Configurações e reserva de emergência ----------

    public Settings GetSettings()
    {
        using var connection = factory.CreateOpenConnection();
        return ReadSettings(connection, null);
    }

    private static Settings ReadSettings(SqliteConnection connection, SqliteTransaction? transaction)
    {
        var row = connection.QuerySingle<SettingsRow>("""
            SELECT s.*, g.active linked_goal_active, f.active linked_freedom_goal_active
            FROM settings s LEFT JOIN goals g ON g.id = s.emergency_goal_id LEFT JOIN goals f ON f.id = s.freedom_goal_id
            WHERE s.id = 1
            """, transaction: transaction);
        return new Settings
        {
            Id = row.Id,
            SetupCompleted = row.SetupCompleted,
            DisplayName = row.DisplayName,
            Currency = row.Currency,
            MonthlyNetIncomeCents = row.MonthlyNetIncomeCents,
            MonthlySpendingLimitCents = row.MonthlySpendingLimitCents,
            EmergencyMonthsTarget = row.EmergencyMonthsTarget,
            TourCompleted = row.TourCompleted,
            CreatedAt = row.CreatedAt,
            UpdatedAt = row.UpdatedAt,
            UiPreferences = UiPreferencesJson.Deserialize(row.UiPreferences),
            MarketAutoRefresh = row.MarketAutoRefresh,
            EmergencyReserveTargetCents = ReserveRules.Target(row.MonthlyNetIncomeCents, row.EmergencyMonthsTarget),
            EmergencyGoalId = row.EmergencyGoalId,
            EmergencyGoalAuto = row.EmergencyGoalAuto,
            EmergencyGoalStatus = GoalStatus(row.EmergencyGoalId, row.LinkedGoalActive),
            PlanFixedPct = row.PlanFixedPct,
            PlanFunPct = row.PlanFunPct,
            PlanInvestPct = row.PlanInvestPct,
            FreedomMultiplier = row.FreedomMultiplier,
            FreedomTargetCents = PlanRules.FreedomTarget(row.MonthlyNetIncomeCents, row.FreedomMultiplier),
            FreedomGoalId = row.FreedomGoalId,
            FreedomGoalAuto = row.FreedomGoalAuto,
            FreedomGoalStatus = GoalStatus(row.FreedomGoalId, row.LinkedFreedomGoalActive)
        };
    }

    private static string GoalStatus(long? goalId, bool? linkedGoalActive) =>
        goalId is null ? ReserveRules.None : linkedGoalActive == true ? ReserveRules.Linked : ReserveRules.Removed;

    /// <summary>Restaurar a meta vinculada (reserva ou número da liberdade) volta a sincronizar o alvo pelo salário (MEL-46).</summary>
    private static void ResyncRestoredGoal(SqliteConnection connection, SqliteTransaction transaction, long goalId)
    {
        var settings = ReadSettings(connection, transaction);
        if (settings.EmergencyGoalId == goalId) SyncEmergencyGoal(connection, transaction, force: false);
        if (settings.FreedomGoalId == goalId) SyncFreedomGoal(connection, transaction, force: false);
    }

    public void SetEmergencyGoalAuto(bool automatic)
    {
        using var connection = factory.CreateOpenConnection();
        connection.Execute("UPDATE settings SET emergency_goal_auto=@automatic, updated_at=CURRENT_TIMESTAMP WHERE id=1", new { automatic });
    }

    public long EnsureEmergencyGoal()
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        connection.Execute("UPDATE settings SET emergency_goal_auto=1, updated_at=CURRENT_TIMESTAMP WHERE id=1", transaction: transaction);
        var id = SyncEmergencyGoal(connection, transaction, force: true)!.Value;
        transaction.Commit();
        return id;
    }

    /// <summary>
    /// Reserva de emergência (MEL-43), com salário &gt; 0, meses ≥ 1 e cálculo automático ligado: sem meta vinculada, vincula a meta
    /// ativa do tipo emergência com maior valor guardado ou cria "Reserva de emergência"; com a meta vinculada ativa, atualiza só o alvo;
    /// com a meta vinculada removida não faz nada (salvo <paramref name="force"/>, que vincula ou cria outra). Devolve a meta vinculada.
    /// </summary>
    private static long? SyncEmergencyGoal(SqliteConnection connection, SqliteTransaction transaction, bool force)
    {
        var settings = ReadSettings(connection, transaction);
        var target = settings.EmergencyReserveTargetCents;
        if (target <= 0 || !settings.EmergencyGoalAuto) return settings.EmergencyGoalId;

        if (settings.EmergencyGoalStatus == ReserveRules.Linked)
        {
            connection.Execute("UPDATE goals SET target_cents=@target WHERE id=@EmergencyGoalId", new { target, settings.EmergencyGoalId }, transaction);
            return settings.EmergencyGoalId;
        }
        if (settings.EmergencyGoalStatus == ReserveRules.Removed && !force) return settings.EmergencyGoalId;

        var goalId = connection.QuerySingleOrDefault<long?>(
            "SELECT id FROM goals WHERE active=1 AND type='emergency' ORDER BY current_cents DESC, id LIMIT 1", transaction: transaction);
        if (goalId is long existing)
            connection.Execute("UPDATE goals SET target_cents=@target WHERE id=@existing", new { target, existing }, transaction);
        else
            goalId = connection.QuerySingle<long>(
                "INSERT INTO goals(name,type,target_cents,current_cents,currency) VALUES (@name,'emergency',@target,0,'BRL') RETURNING id",
                new { name = ReserveRules.DefaultGoalName, target }, transaction);
        connection.Execute("UPDATE settings SET emergency_goal_id=@goalId WHERE id=1", new { goalId }, transaction);
        return goalId;
    }

    public BankAccount? FindBankAccount(long accountId)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.QuerySingleOrDefault<BankAccount>("SELECT * FROM bank_accounts WHERE id=@accountId", new { accountId });
    }

    public Goal? FindGoal(long goalId)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.QuerySingleOrDefault<Goal>("SELECT * FROM goals WHERE id=@goalId", new { goalId });
    }

    public long CountAccountMovements(long accountId)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.ExecuteScalar<long>(
            "SELECT (SELECT COUNT(*) FROM bank_entries WHERE account_id=@accountId AND deleted_at IS NULL) + (SELECT COUNT(*) FROM transactions WHERE account_id=@accountId AND deleted_at IS NULL)",
            new { accountId });
    }

    public string? FindInvoiceMonthOfEntry(long entryId)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.QuerySingleOrDefault<string?>("SELECT invoice_month FROM bank_entries WHERE id=@entryId AND invoice_card_id IS NOT NULL", new { entryId });
    }

    // ---------- Mercado ----------

    public IReadOnlyList<ExchangeRate> ListExchangeRates()
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Query<ExchangeRate>("SELECT currency, rate_brl, change_pct, source, fetched_at, manual FROM exchange_rates ORDER BY currency").AsList();
    }

    public IReadOnlyList<MarketIndicator> ListMarketIndicators()
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Query<MarketIndicator>("SELECT code, value, reference_date, source, fetched_at FROM market_indicators ORDER BY code").AsList();
    }

    public MarketStatus GetMarketStatus()
    {
        using var connection = factory.CreateOpenConnection();
        var row = connection.QuerySingle<MarketStatusRow>("SELECT market_auto_refresh, market_last_refresh_at, market_last_error FROM settings WHERE id=1");
        return new MarketStatus(row.MarketAutoRefresh, row.MarketLastRefreshAt, row.MarketLastError);
    }

    public MarketRefreshCounts SaveMarketData(IReadOnlyList<ExchangeRate> rates, IReadOnlyList<MarketIndicator> indicators)
    {
        using var connection = factory.CreateOpenConnection();
        using var transaction = connection.BeginTransaction();
        var savedRates = 0;
        foreach (var rate in rates)
            savedRates += connection.Execute("""
                INSERT INTO exchange_rates(currency, rate_brl, change_pct, source, fetched_at, manual) VALUES (@Currency, @RateBrl, @ChangePct, @Source, @FetchedAt, 0)
                ON CONFLICT(currency) DO UPDATE SET rate_brl=excluded.rate_brl, change_pct=excluded.change_pct, source=excluded.source, fetched_at=excluded.fetched_at
                WHERE exchange_rates.manual=0
                """, rate, transaction);
        var savedIndicators = 0;
        foreach (var indicator in indicators)
            savedIndicators += connection.Execute("""
                INSERT INTO market_indicators(code, value, reference_date, source, fetched_at) VALUES (@Code, @Value, @ReferenceDate, @Source, @FetchedAt)
                ON CONFLICT(code) DO UPDATE SET value=excluded.value, reference_date=excluded.reference_date, source=excluded.source, fetched_at=excluded.fetched_at
                """, indicator, transaction);
        transaction.Commit();
        return new MarketRefreshCounts(savedRates, savedIndicators);
    }

    public void SetMarketRefreshResult(string? refreshedAt, string? error)
    {
        using var connection = factory.CreateOpenConnection();
        connection.Execute("UPDATE settings SET market_last_refresh_at=COALESCE(@refreshedAt, market_last_refresh_at), market_last_error=@error WHERE id=1", new { refreshedAt, error });
    }

    public void SetManualRate(string currency, string rateBrl, string at)
    {
        using var connection = factory.CreateOpenConnection();
        connection.Execute("""
            INSERT INTO exchange_rates(currency, rate_brl, change_pct, source, fetched_at, manual) VALUES (@currency, @rateBrl, NULL, 'Manual', @at, 1)
            ON CONFLICT(currency) DO UPDATE SET rate_brl=excluded.rate_brl, change_pct=NULL, source='Manual', fetched_at=excluded.fetched_at, manual=1
            """, new { currency, rateBrl, at });
    }

    public bool ClearManualRate(string currency)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Execute("UPDATE exchange_rates SET manual=0 WHERE currency=@currency", new { currency }) > 0;
    }

    // ---------- Débito automático ----------

    public IReadOnlyList<Subscription> ListActiveSubscriptions()
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Query<Subscription>($"{RecordModuleCatalog.SubscriptionSelect} ORDER BY s.id").AsList();
    }

    public IReadOnlySet<string> ListSubscriptionChargeDates(long subscriptionId)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Query<string>("SELECT charge_date FROM subscription_charges WHERE subscription_id=@subscriptionId", new { subscriptionId })
            .ToHashSet(StringComparer.Ordinal);
    }

    // ---------- Relatórios e patrimônio ----------

    public IReadOnlyList<ReportTransaction> ListReportTransactions(string fromDate, string toDateExclusive)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Query<ReportTransaction>("""
            SELECT t.id, t.date, t.description, t.kind, t.category_id, c.name category_name, c.kind category_kind, c.bucket category_bucket, t.payment_method,
                   a.name account_name, k.name card_name, t.currency, t.amount_cents, COALESCE(t.base_amount_cents, t.amount_cents) base_amount_cents, t.notes
            FROM transactions t
            LEFT JOIN categories c ON c.id=t.category_id
            LEFT JOIN bank_accounts a ON a.id=t.account_id
            LEFT JOIN cards k ON k.id=t.card_id
            WHERE t.deleted_at IS NULL AND t.date>=@fromDate AND t.date<@toDateExclusive
            ORDER BY t.date, t.id
            """, new { fromDate, toDateExclusive }).AsList();
    }

    public IReadOnlyList<Holding> ListHoldings()
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Query<HoldingRow>("""
            SELECT 'bank' kind, currency, current_balance_cents native_cents FROM bank_accounts WHERE active=1
            UNION ALL
            SELECT 'investment', currency, current_cents FROM investments WHERE active=1
            """).Select(row => new Holding(row.Kind, row.Currency, row.NativeCents)).ToList();
    }

    public void UpsertNetWorthSnapshot(NetWorthSnapshot snapshot, string updatedAt)
    {
        using var connection = factory.CreateOpenConnection();
        connection.Execute("""
            INSERT INTO net_worth_snapshots(month, bank_cents, investments_cents, total_cents, updated_at) VALUES (@Month, @BankCents, @InvestmentsCents, @TotalCents, @updatedAt)
            ON CONFLICT(month) DO UPDATE SET bank_cents=excluded.bank_cents, investments_cents=excluded.investments_cents, total_cents=excluded.total_cents, updated_at=excluded.updated_at
            """, new { snapshot.Month, snapshot.BankCents, snapshot.InvestmentsCents, snapshot.TotalCents, updatedAt });
    }

    public IReadOnlyList<NetWorthSnapshot> ListNetWorthSnapshots(string fromMonth, string toMonth)
    {
        using var connection = factory.CreateOpenConnection();
        return connection.Query<SnapshotRow>(
                "SELECT month, bank_cents, investments_cents, total_cents FROM net_worth_snapshots WHERE month>=@fromMonth AND month<=@toMonth ORDER BY month",
                new { fromMonth, toMonth })
            .Select(row => new NetWorthSnapshot(row.Month, row.BankCents, row.InvestmentsCents, row.TotalCents)).ToList();
    }
}

/// <summary>Serialização das preferências de interface: leitura tolerante (valores inválidos voltam ao padrão).</summary>
internal static class UiPreferencesJson
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    public static string Serialize(UiPreferences preferences) => JsonSerializer.Serialize(preferences, Options);

    public static UiPreferences Deserialize(string? json)
    {
        var defaults = UiPreferenceRules.Default;
        if (string.IsNullOrWhiteSpace(json)) return defaults;
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return defaults;
            return new UiPreferences(
                Text(root, UiPreferenceRules.ThemeKey, UiPreferenceRules.Themes) ?? defaults.Theme,
                Text(root, UiPreferenceRules.AccentKey, UiPreferenceRules.Accents) ?? defaults.Accent,
                Text(root, UiPreferenceRules.DensityKey, UiPreferenceRules.Densities) ?? defaults.Density,
                Flag(root, UiPreferenceRules.AnimationsKey) ?? defaults.Animations,
                Flag(root, UiPreferenceRules.HideValuesKey) ?? defaults.HideValues,
                Flag(root, UiPreferenceRules.ShowMarketTickerKey) ?? defaults.ShowMarketTicker,
                Widgets(root) ?? defaults.DashboardWidgets);
        }
        catch (JsonException)
        {
            return defaults;
        }
    }

    private static string? Text(JsonElement root, string key, IReadOnlySet<string> options) =>
        root.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String && options.Contains(value.GetString()!) ? value.GetString() : null;

    private static bool? Flag(JsonElement root, string key) =>
        root.TryGetProperty(key, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False ? value.GetBoolean() : null;

    private static List<string>? Widgets(JsonElement root)
    {
        if (!root.TryGetProperty(UiPreferenceRules.DashboardWidgetsKey, out var value) || value.ValueKind != JsonValueKind.Array) return null;
        return value.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.String).Select(item => item.GetString()!)
            .Where(item => UiPreferenceRules.Widgets.Contains(item, StringComparer.Ordinal)).Distinct(StringComparer.Ordinal).ToList();
    }
}

internal sealed class SettingsRow
{
    public long Id { get; init; }
    public bool SetupCompleted { get; init; }
    public string DisplayName { get; init; } = "";
    public string Currency { get; init; } = "BRL";
    public long MonthlyNetIncomeCents { get; init; }
    public long MonthlySpendingLimitCents { get; init; }
    public int EmergencyMonthsTarget { get; init; }
    public bool TourCompleted { get; init; }
    public string CreatedAt { get; init; } = "";
    public string UpdatedAt { get; init; } = "";
    public string? UiPreferences { get; init; }
    public bool MarketAutoRefresh { get; init; } = true;
    public long? EmergencyGoalId { get; init; }
    public bool EmergencyGoalAuto { get; init; } = true;
    public bool? LinkedGoalActive { get; init; }
    public int? PlanFixedPct { get; init; }
    public int? PlanFunPct { get; init; }
    public int? PlanInvestPct { get; init; }
    public int FreedomMultiplier { get; init; } = PlanRules.DefaultFreedomMultiplier;
    public long? FreedomGoalId { get; init; }
    public bool FreedomGoalAuto { get; init; } = true;
    public bool? LinkedFreedomGoalActive { get; init; }
}

internal sealed class MarketStatusRow
{
    public bool MarketAutoRefresh { get; init; }
    public string? MarketLastRefreshAt { get; init; }
    public string? MarketLastError { get; init; }
}

internal sealed class HoldingRow
{
    public string Kind { get; init; } = "";
    public string Currency { get; init; } = "BRL";
    public long NativeCents { get; init; }
}

internal sealed class SnapshotRow
{
    public string Month { get; init; } = "";
    public long BankCents { get; init; }
    public long InvestmentsCents { get; init; }
    public long TotalCents { get; init; }
}
