using FinanceControl.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Xunit;

namespace FinanceControl.Api.Tests;

public sealed class MigrationTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "finance-control-tests", Guid.NewGuid().ToString("N"));
    private readonly List<SqliteConnectionFactory> _factories = [];

    [Fact]
    public async Task Migrator_preserves_records_from_database_without_migration_history()
    {
        var path = Path.Combine(_directory, "legacy.db");
        Directory.CreateDirectory(_directory);
        await using (var legacy = new SqliteConnection($"Data Source={path};Pooling=False"))
        {
            await legacy.OpenAsync();
            var command = legacy.CreateCommand();
            command.CommandText = """
                CREATE TABLE transactions (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  date TEXT NOT NULL,
                  description TEXT NOT NULL,
                  category_id INTEGER,
                  kind TEXT NOT NULL,
                  amount_cents INTEGER NOT NULL,
                  payment_method TEXT NOT NULL DEFAULT 'card',
                  notes TEXT
                );
                CREATE TABLE categories (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  kind TEXT NOT NULL,
                  monthly_budget_cents INTEGER NOT NULL DEFAULT 0,
                  active INTEGER NOT NULL DEFAULT 1
                );
                INSERT INTO categories(id,name,kind,monthly_budget_cents)
                VALUES (1,'Alimentação','expense',100000);
                INSERT INTO transactions(date,description,category_id,kind,amount_cents)
                VALUES ('2026-08-30','Registro legado',1,'expense',2590);
                """;
            await command.ExecuteNonQueryAsync();
        }

        var factory = Track(new SqliteConnectionFactory(new DatabaseOptions { Path = path }));
        await new DatabaseMigrator(factory).MigrateAsync();
        await new DatabaseMigrator(factory).MigrateAsync();

        await using var migrated = factory.CreateOpenConnection();
        var verify = migrated.CreateCommand();
        verify.CommandText = "SELECT COUNT(*) FROM transactions WHERE description='Registro legado' AND deleted_at IS NULL AND account_id IS NULL";
        Assert.Equal(1L, (long)(await verify.ExecuteScalarAsync())!);
        verify.CommandText = "SELECT COUNT(*) FROM categories WHERE id=1 AND name='Alimentação'";
        Assert.Equal(1L, (long)(await verify.ExecuteScalarAsync())!);
        verify.CommandText = "SELECT COUNT(*) FROM schema_migrations";
        Assert.Equal(10L, (long)(await verify.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task Migration_004_adds_nullable_link_and_history_columns_to_a_new_database()
    {
        var factory = Track(new SqliteConnectionFactory(new DatabaseOptions { Path = Path.Combine(_directory, "novo", "finance.db") }));
        await new DatabaseMigrator(factory).MigrateAsync();

        await using var connection = factory.CreateOpenConnection();
        var expected = new Dictionary<string, string[]>
        {
            ["transactions"] = ["account_id"],
            ["bill_payments"] = ["transaction_id"],
            ["goal_entries"] = ["deleted_at"],
            ["investment_entries"] = ["deleted_at", "invested_delta_cents", "current_delta_cents"],
            ["bank_entries"] = ["deleted_at", "delta_cents", "transfer_entry_id"]
        };
        foreach (var (table, columns) in expected)
        {
            var command = connection.CreateCommand();
            command.CommandText = $"SELECT name, \"notnull\", dflt_value FROM pragma_table_info('{table}')";
            var found = new Dictionary<string, (long NotNull, object Default)>();
            await using (var reader = await command.ExecuteReaderAsync())
                while (await reader.ReadAsync()) found[reader.GetString(0)] = (reader.GetInt64(1), reader.GetValue(2));
            foreach (var column in columns)
            {
                Assert.True(found.ContainsKey(column), $"{table}.{column}");
                Assert.Equal(0L, found[column].NotNull);
                Assert.Equal(DBNull.Value, found[column].Default);
            }
        }

        var indexes = connection.CreateCommand();
        indexes.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name IN ('ix_transactions_account','ix_bill_payments_month','ix_goal_entries_goal','ix_investment_entries_investment','ix_bank_entries_account')";
        Assert.Equal(5L, (long)(await indexes.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task Migration_005_adds_goal_entry_kind_and_subscription_charges_to_a_new_database()
    {
        var factory = Track(new SqliteConnectionFactory(new DatabaseOptions { Path = Path.Combine(_directory, "novo-005", "finance.db") }));
        await new DatabaseMigrator(factory).MigrateAsync();

        await using var connection = factory.CreateOpenConnection();
        var kind = connection.CreateCommand();
        kind.CommandText = "SELECT \"notnull\", dflt_value FROM pragma_table_info('goal_entries') WHERE name='kind'";
        await using (var reader = await kind.ExecuteReaderAsync())
        {
            Assert.True(await reader.ReadAsync());
            Assert.Equal(1L, reader.GetInt64(0));
            Assert.Equal("'contribution'", reader.GetString(1));
        }

        var columns = connection.CreateCommand();
        columns.CommandText = "SELECT group_concat(name, ',') FROM (SELECT name FROM pragma_table_info('subscription_charges') ORDER BY cid)";
        Assert.Equal("id,subscription_id,charge_date,transaction_id,created_at", (string)(await columns.ExecuteScalarAsync())!);

        var insert = connection.CreateCommand();
        insert.CommandText = """
            INSERT INTO subscriptions(name,amount_cents) VALUES ('Teste',100);
            INSERT INTO subscription_charges(subscription_id,charge_date) VALUES (last_insert_rowid(),'2026-01-01');
            """;
        await insert.ExecuteNonQueryAsync();
        var duplicate = connection.CreateCommand();
        duplicate.CommandText = "INSERT INTO subscription_charges(subscription_id,charge_date) SELECT subscription_id,charge_date FROM subscription_charges";
        Assert.Throws<SqliteException>(() => duplicate.ExecuteNonQuery());
        var invalidKind = connection.CreateCommand();
        invalidKind.CommandText = "INSERT INTO goals(name,target_cents) VALUES ('G',1); INSERT INTO goal_entries(goal_id,date,amount_cents,kind) VALUES (last_insert_rowid(),'2026-01-01',1,'gift')";
        Assert.Throws<SqliteException>(() => invalidKind.ExecuteNonQuery());
    }

    [Fact]
    public async Task Migration_005_keeps_existing_rows_from_a_v11_database()
    {
        var path = Path.Combine(_directory, "v11", "finance.db");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using (var v11 = new SqliteConnection($"Data Source={path};Pooling=False"))
        {
            await v11.OpenAsync();
            var assembly = typeof(DatabaseMigrator).Assembly;
            var scripts = assembly.GetManifestResourceNames().Where(name => name.EndsWith(".sql", StringComparison.Ordinal)).Order(StringComparer.Ordinal).ToList();
            Assert.Contains(scripts, name => name.EndsWith("005_usability.sql", StringComparison.Ordinal));
            var setup = v11.CreateCommand();
            setup.CommandText = "CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);";
            await setup.ExecuteNonQueryAsync();
            // Reproduz um banco da v1.1: somente as migrações anteriores à 005.
            foreach (var script in scripts)
            {
                var id = script[(script.IndexOf(".Migrations.", StringComparison.Ordinal) + ".Migrations.".Length)..^4];
                if (string.CompareOrdinal(id, "005") >= 0) continue;
                await using var stream = assembly.GetManifestResourceStream(script)!;
                using var reader = new StreamReader(stream);
                var command = v11.CreateCommand();
                command.CommandText = await reader.ReadToEndAsync() + Environment.NewLine + $"INSERT INTO schema_migrations(id) VALUES ('{id}');";
                await command.ExecuteNonQueryAsync();
            }
            var data = v11.CreateCommand();
            data.CommandText = """
                INSERT INTO goals(id,name,target_cents,current_cents) VALUES (1,'Viagem',10000,700);
                INSERT INTO goal_entries(goal_id,date,amount_cents) VALUES (1,'2026-01-01',500),(1,'2026-01-02',200);
                INSERT INTO subscriptions(name,amount_cents,frequency) VALUES ('Anual sem data',12000,'yearly');
                """;
            await data.ExecuteNonQueryAsync();
        }

        var factory = Track(new SqliteConnectionFactory(new DatabaseOptions { Path = path }));
        await new DatabaseMigrator(factory).MigrateAsync();

        await using var migrated = factory.CreateOpenConnection();
        var verify = migrated.CreateCommand();
        verify.CommandText = "SELECT COUNT(*) FROM goal_entries WHERE kind='contribution' AND deleted_at IS NULL";
        Assert.Equal(2L, (long)(await verify.ExecuteScalarAsync())!);
        verify.CommandText = "SELECT current_cents FROM goals WHERE id=1";
        Assert.Equal(700L, (long)(await verify.ExecuteScalarAsync())!);
        verify.CommandText = "SELECT COUNT(*) FROM subscriptions WHERE frequency='yearly' AND next_billing_date IS NULL";
        Assert.Equal(1L, (long)(await verify.ExecuteScalarAsync())!);
        verify.CommandText = "SELECT COUNT(*) FROM subscription_charges";
        Assert.Equal(0L, (long)(await verify.ExecuteScalarAsync())!);
        verify.CommandText = "SELECT group_concat(id, ',') FROM (SELECT id FROM schema_migrations ORDER BY id)";
        Assert.Equal("001_initial,002_transaction_soft_delete,003_remove_placeholder_data,004_links_and_movement_history,005_usability,006_closings_and_card_invoices,007_v12,008_plan,009_bill_active_since,010_imports_and_installments", (string)(await verify.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task Migration_006_adds_card_link_closing_summary_and_invoice_payments_to_a_new_database()
    {
        var factory = Track(new SqliteConnectionFactory(new DatabaseOptions { Path = Path.Combine(_directory, "novo-006", "finance.db") }));
        await new DatabaseMigrator(factory).MigrateAsync();

        await using var connection = factory.CreateOpenConnection();
        Assert.Equal(1L, await ScalarAsync<long>(connection, "SELECT COUNT(*) FROM pragma_table_info('transactions') WHERE name='card_id' AND \"notnull\"=0 AND dflt_value IS NULL"));
        Assert.Equal("cards", await ScalarAsync<string>(connection, "SELECT \"table\" FROM pragma_foreign_key_list('transactions') WHERE \"from\"='card_id'"));
        Assert.Equal("SET NULL", await ScalarAsync<string>(connection, "SELECT on_delete FROM pragma_foreign_key_list('transactions') WHERE \"from\"='card_id'"));
        Assert.Equal(1L, await ScalarAsync<long>(connection, "SELECT COUNT(*) FROM pragma_table_info('monthly_closings') WHERE name='summary_json' AND \"notnull\"=0 AND dflt_value IS NULL"));
        Assert.Equal("id,card_id,month,amount_cents,paid_at,date,account_id,bank_entry_id,created_at",
            await ScalarAsync<string>(connection, "SELECT group_concat(name, ',') FROM (SELECT name FROM pragma_table_info('card_invoice_payments') ORDER BY cid)"));
        Assert.Equal(1L, await ScalarAsync<long>(connection, "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='ix_transactions_card'"));

        var insert = connection.CreateCommand();
        insert.CommandText = "INSERT INTO cards(name) VALUES ('C'); INSERT INTO card_invoice_payments(card_id,month,amount_cents,paid_at,date) VALUES (last_insert_rowid(),'2026-01',100,'x','2026-01-05');";
        await insert.ExecuteNonQueryAsync();
        var duplicate = connection.CreateCommand();
        duplicate.CommandText = "INSERT INTO card_invoice_payments(card_id,month,amount_cents,paid_at,date) SELECT card_id,month,1,'x','2026-01-06' FROM card_invoice_payments";
        Assert.Throws<SqliteException>(() => duplicate.ExecuteNonQuery());
    }

    [Fact]
    public async Task Migration_006_keeps_existing_rows_from_a_v12_database()
    {
        var path = Path.Combine(_directory, "v12", "finance.db");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using (var v12 = new SqliteConnection($"Data Source={path};Pooling=False"))
        {
            await v12.OpenAsync();
            await ApplyMigrationsBeforeAsync(v12, "006");
            var data = v12.CreateCommand();
            data.CommandText = """
                INSERT INTO cards(id,name,closing_day,due_day) VALUES (1,'Roxo',25,5);
                INSERT INTO transactions(date,description,kind,amount_cents) VALUES ('2026-08-01','Mercado','expense',1500),('2026-08-02','Salário','income',500000);
                INSERT INTO monthly_closings(month,closed,closed_at,notes) VALUES ('2026-07',1,'2026-08-01T00:00:00Z','antigo');
                """;
            await data.ExecuteNonQueryAsync();
        }

        var factory = Track(new SqliteConnectionFactory(new DatabaseOptions { Path = path }));
        await new DatabaseMigrator(factory).MigrateAsync();

        await using var migrated = factory.CreateOpenConnection();
        Assert.Equal(2L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM transactions WHERE card_id IS NULL AND deleted_at IS NULL"));
        Assert.Equal(1L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM monthly_closings WHERE month='2026-07' AND notes='antigo' AND summary_json IS NULL"));
        Assert.Equal(0L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM card_invoice_payments"));
        Assert.Equal(10L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM schema_migrations"));
        Assert.Equal("ok", await ScalarAsync<string>(migrated, "PRAGMA integrity_check"));
    }

    [Fact]
    public async Task Migration_007_adds_v12_tables_and_columns_to_a_new_database()
    {
        var factory = Track(new SqliteConnectionFactory(new DatabaseOptions { Path = Path.Combine(_directory, "novo-007", "finance.db") }));
        await new DatabaseMigrator(factory).MigrateAsync();

        await using var connection = factory.CreateOpenConnection();
        Assert.Equal("currency,rate_brl,change_pct,source,fetched_at,manual", await ScalarAsync<string>(connection, "SELECT group_concat(name, ',') FROM (SELECT name FROM pragma_table_info('exchange_rates') ORDER BY cid)"));
        Assert.Equal("code,value,reference_date,source,fetched_at", await ScalarAsync<string>(connection, "SELECT group_concat(name, ',') FROM (SELECT name FROM pragma_table_info('market_indicators') ORDER BY cid)"));
        Assert.Equal("month,bank_cents,investments_cents,total_cents,updated_at", await ScalarAsync<string>(connection, "SELECT group_concat(name, ',') FROM (SELECT name FROM pragma_table_info('net_worth_snapshots') ORDER BY cid)"));
        var expected = new Dictionary<string, string[]>
        {
            ["settings"] = ["ui_preferences", "market_auto_refresh", "market_last_refresh_at", "market_last_error", "emergency_goal_id", "emergency_goal_auto"],
            ["bank_accounts"] = ["currency", "brand", "logo_data"],
            ["investments"] = ["currency", "brand", "logo_data"],
            ["cards"] = ["brand", "network", "color"],
            ["categories"] = ["icon", "color"],
            ["transactions"] = ["currency", "base_amount_cents", "exchange_rate", "brand"],
            ["bills"] = ["auto_debit", "auto_debit_since", "account_id", "currency", "icon", "brand"],
            ["subscriptions"] = ["auto_debit", "auto_debit_since", "account_id", "currency", "icon", "brand"],
            ["bill_payments"] = ["auto_debit_skipped"],
            ["bank_entries"] = ["invoice_card_id", "invoice_month"]
        };
        foreach (var (table, columns) in expected)
            foreach (var column in columns)
                Assert.True(await ScalarAsync<long>(connection, $"SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name='{column}'") == 1, $"{table}.{column}");
        Assert.Equal("'BRL'", await ScalarAsync<string>(connection, "SELECT dflt_value FROM pragma_table_info('transactions') WHERE name='currency'"));
        Assert.Equal("1", await ScalarAsync<string>(connection, "SELECT dflt_value FROM pragma_table_info('settings') WHERE name='market_auto_refresh'"));
        Assert.Equal("SET NULL", await ScalarAsync<string>(connection, "SELECT on_delete FROM pragma_foreign_key_list('settings') WHERE \"from\"='emergency_goal_id'"));
        Assert.Equal("SET NULL", await ScalarAsync<string>(connection, "SELECT on_delete FROM pragma_foreign_key_list('bills') WHERE \"from\"='account_id'"));
        Assert.Equal(0L, await ScalarAsync<long>(connection, "SELECT COUNT(*) FROM settings WHERE emergency_goal_id IS NOT NULL"));
    }

    [Fact]
    public async Task Migration_007_backfills_brl_values_invoice_links_and_links_the_single_emergency_goal()
    {
        var path = Path.Combine(_directory, "v13", "finance.db");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using (var v13 = new SqliteConnection($"Data Source={path};Pooling=False"))
        {
            await v13.OpenAsync();
            await ApplyMigrationsBeforeAsync(v13, "007");
            var data = v13.CreateCommand();
            data.CommandText = """
                UPDATE settings SET monthly_net_income_cents=500000, emergency_months_target=6;
                INSERT INTO goals(id,name,type,target_cents,current_cents) VALUES (1,'Viagem','travel',100,0),(2,'Reserva','emergency',100,50),(3,'Antiga','emergency',100,90);
                UPDATE goals SET active=0 WHERE id=3;
                INSERT INTO transactions(date,description,kind,amount_cents) VALUES ('2026-08-01','Mercado','expense',1500),('2026-08-02','Salário','income',500000);
                INSERT INTO bank_accounts(id,name,institution,current_balance_cents) VALUES (1,'Conta','Banco',1000);
                INSERT INTO cards(id,name) VALUES (1,'Cartão');
                INSERT INTO bank_entries(id,account_id,date,description,kind,amount_cents,delta_cents) VALUES (1,1,'2026-08-05','Fatura','withdrawal',300,-300),(2,1,'2026-08-06','Outra','deposit',10,10);
                INSERT INTO card_invoice_payments(card_id,month,amount_cents,paid_at,date,account_id,bank_entry_id) VALUES (1,'2026-08',300,'x','2026-08-05',1,1);
                INSERT INTO bills(name,amount_cents) VALUES ('Luz',100);
                INSERT INTO subscriptions(name,amount_cents) VALUES ('Música',100);
                """;
            await data.ExecuteNonQueryAsync();
        }

        var factory = Track(new SqliteConnectionFactory(new DatabaseOptions { Path = path }));
        await new DatabaseMigrator(factory).MigrateAsync();

        await using var migrated = factory.CreateOpenConnection();
        Assert.Equal(2L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM transactions WHERE base_amount_cents=amount_cents AND exchange_rate='1' AND currency='BRL'"));
        Assert.Equal(2L, await ScalarAsync<long>(migrated, "SELECT emergency_goal_id FROM settings"));
        Assert.Equal(1L, await ScalarAsync<long>(migrated, "SELECT emergency_goal_auto FROM settings"));
        Assert.Equal(100L, await ScalarAsync<long>(migrated, "SELECT target_cents FROM goals WHERE id=2"));
        Assert.Equal("1|2026-08", await ScalarAsync<string>(migrated, "SELECT invoice_card_id || '|' || invoice_month FROM bank_entries WHERE id=1"));
        Assert.Equal(1L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM bank_entries WHERE id=2 AND invoice_card_id IS NULL AND invoice_month IS NULL"));
        Assert.Equal(1L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM bills WHERE auto_debit=0 AND auto_debit_since IS NULL AND account_id IS NULL AND currency='BRL'"));
        Assert.Equal(1L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM subscriptions WHERE auto_debit=0 AND currency='BRL'"));
        Assert.Equal(1L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM settings WHERE ui_preferences IS NULL AND market_auto_refresh=1"));
        Assert.Equal(10L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM schema_migrations"));
        Assert.Equal("ok", await ScalarAsync<string>(migrated, "PRAGMA integrity_check"));
        Assert.Equal(0L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM pragma_foreign_key_check"));
    }

    [Theory]
    [InlineData("INSERT INTO goals(name,type,target_cents) VALUES ('Reserva de Emergência','custom',100);", 500000L, 1L)]
    [InlineData("INSERT INTO goals(name,type,target_cents) VALUES ('Reserva de Emergência','custom',100),('Reserva de emergência 2','custom',100);", 500000L, null)]
    [InlineData("INSERT INTO goals(name,type,target_cents) VALUES ('A','emergency',100),('B','emergency',100);", 500000L, null)]
    [InlineData("INSERT INTO goals(name,type,target_cents) VALUES ('Reserva de Emergência','emergency',100);", 0L, null)]
    [InlineData("INSERT INTO goals(name,type,target_cents) VALUES ('Colchão','emergency',100),('Reserva de Emergência','custom',100);", 500000L, 1L)]
    public async Task Migration_007_links_the_reserve_goal_only_when_unambiguous(string goals, long income, long? expectedGoal)
    {
        var path = Path.Combine(_directory, $"reserva-{Guid.NewGuid():N}", "finance.db");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using (var legacy = new SqliteConnection($"Data Source={path};Pooling=False"))
        {
            await legacy.OpenAsync();
            await ApplyMigrationsBeforeAsync(legacy, "007");
            var data = legacy.CreateCommand();
            data.CommandText = goals + $"UPDATE settings SET monthly_net_income_cents={income};";
            await data.ExecuteNonQueryAsync();
        }

        var factory = Track(new SqliteConnectionFactory(new DatabaseOptions { Path = path }));
        await new DatabaseMigrator(factory).MigrateAsync();
        await using var migrated = factory.CreateOpenConnection();
        var command = migrated.CreateCommand();
        command.CommandText = "SELECT emergency_goal_id FROM settings";
        var linked = await command.ExecuteScalarAsync();
        Assert.Equal(expectedGoal, linked is long id ? id : null);
    }

    [Fact]
    public async Task Migration_008_adds_plan_settings_and_category_bucket_to_a_new_database()
    {
        var factory = Track(new SqliteConnectionFactory(new DatabaseOptions { Path = Path.Combine(_directory, "novo-008", "finance.db") }));
        await new DatabaseMigrator(factory).MigrateAsync();

        await using var connection = factory.CreateOpenConnection();
        foreach (var column in new[] { "plan_fixed_pct", "plan_fun_pct", "plan_invest_pct", "freedom_goal_id" })
            Assert.Equal(1L, await ScalarAsync<long>(connection, $"SELECT COUNT(*) FROM pragma_table_info('settings') WHERE name='{column}' AND \"notnull\"=0 AND dflt_value IS NULL AND type='INTEGER'"));
        Assert.Equal("150", await ScalarAsync<string>(connection, "SELECT dflt_value FROM pragma_table_info('settings') WHERE name='freedom_multiplier' AND \"notnull\"=1"));
        Assert.Equal("1", await ScalarAsync<string>(connection, "SELECT dflt_value FROM pragma_table_info('settings') WHERE name='freedom_goal_auto' AND \"notnull\"=1"));
        Assert.Equal("SET NULL", await ScalarAsync<string>(connection, "SELECT on_delete FROM pragma_foreign_key_list('settings') WHERE \"from\"='freedom_goal_id'"));
        Assert.Equal("goals", await ScalarAsync<string>(connection, "SELECT \"table\" FROM pragma_foreign_key_list('settings') WHERE \"from\"='freedom_goal_id'"));
        Assert.Equal(1L, await ScalarAsync<long>(connection, "SELECT COUNT(*) FROM pragma_table_info('categories') WHERE name='bucket' AND \"notnull\"=0 AND dflt_value IS NULL"));
        Assert.Equal(1L, await ScalarAsync<long>(connection, "SELECT COUNT(*) FROM settings WHERE plan_fixed_pct IS NULL AND freedom_multiplier=150 AND freedom_goal_id IS NULL AND freedom_goal_auto=1"));
        Assert.Equal("010_imports_and_installments", await ScalarAsync<string>(connection, "SELECT MAX(id) FROM schema_migrations"));

        var valid = connection.CreateCommand();
        valid.CommandText = "INSERT INTO categories(name,kind,bucket) VALUES ('A','expense','fixo'),('B','expense','lazer'),('C','investment','investimento'),('D','expense','fora'),('E','expense',NULL)";
        await valid.ExecuteNonQueryAsync();
        var invalid = connection.CreateCommand();
        invalid.CommandText = "INSERT INTO categories(name,kind,bucket) VALUES ('F','expense','extra')";
        Assert.Throws<SqliteException>(() => invalid.ExecuteNonQuery());
    }

    [Fact]
    public async Task Migration_008_keeps_existing_rows_from_a_v12_database()
    {
        var path = Path.Combine(_directory, "v12-plan", "finance.db");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using (var v12 = new SqliteConnection($"Data Source={path};Pooling=False"))
        {
            await v12.OpenAsync();
            await ApplyMigrationsBeforeAsync(v12, "008");
            var data = v12.CreateCommand();
            data.CommandText = """
                INSERT INTO goals(id,name,type,target_cents,current_cents) VALUES (1,'Número da liberdade','retirement',100,10),(2,'Reserva','emergency',7800000,50);
                UPDATE settings SET monthly_net_income_cents=1300000, monthly_spending_limit_cents=900000, emergency_months_target=6, emergency_goal_id=2;
                INSERT INTO categories(id,name,kind,monthly_budget_cents) VALUES (1,'Lazer','expense',90000),(2,'Salário','income',0);
                INSERT INTO transactions(date,description,category_id,kind,amount_cents,base_amount_cents,exchange_rate) VALUES ('2026-09-01','Cinema',1,'expense',3000,3000,'1');
                """;
            await data.ExecuteNonQueryAsync();
        }

        var factory = Track(new SqliteConnectionFactory(new DatabaseOptions { Path = path }));
        await new DatabaseMigrator(factory).MigrateAsync();

        await using var migrated = factory.CreateOpenConnection();
        Assert.Equal(10L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM schema_migrations"));
        Assert.Equal(1L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM settings WHERE plan_fixed_pct IS NULL AND plan_fun_pct IS NULL AND plan_invest_pct IS NULL AND freedom_multiplier=150 AND freedom_goal_id IS NULL AND freedom_goal_auto=1 AND emergency_goal_id=2 AND monthly_spending_limit_cents=900000"));
        Assert.Equal(2L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM categories WHERE bucket IS NULL"));
        Assert.Equal(100L, await ScalarAsync<long>(migrated, "SELECT target_cents FROM goals WHERE id=1"));
        Assert.Equal(1L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM transactions"));
        Assert.Equal("ok", await ScalarAsync<string>(migrated, "PRAGMA integrity_check"));
        Assert.Equal(0L, await ScalarAsync<long>(migrated, "SELECT COUNT(*) FROM pragma_foreign_key_check"));
    }

    /// <summary>Reproduz um banco de uma versão anterior: aplica somente as migrações com id menor que <paramref name="firstExcluded"/>.</summary>
    private static async Task ApplyMigrationsBeforeAsync(SqliteConnection connection, string firstExcluded)
    {
        var assembly = typeof(DatabaseMigrator).Assembly;
        var setup = connection.CreateCommand();
        setup.CommandText = "CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);";
        await setup.ExecuteNonQueryAsync();
        foreach (var script in assembly.GetManifestResourceNames().Where(name => name.EndsWith(".sql", StringComparison.Ordinal)).Order(StringComparer.Ordinal))
        {
            var id = script[(script.IndexOf(".Migrations.", StringComparison.Ordinal) + ".Migrations.".Length)..^4];
            if (string.CompareOrdinal(id, firstExcluded) >= 0) continue;
            await using var stream = assembly.GetManifestResourceStream(script)!;
            using var reader = new StreamReader(stream);
            var command = connection.CreateCommand();
            command.CommandText = await reader.ReadToEndAsync() + Environment.NewLine + $"INSERT INTO schema_migrations(id) VALUES ('{id}');";
            await command.ExecuteNonQueryAsync();
        }
    }

    private static async Task<T> ScalarAsync<T>(SqliteConnection connection, string sql)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        return (T)Convert.ChangeType((await command.ExecuteScalarAsync())!, typeof(T), System.Globalization.CultureInfo.InvariantCulture);
    }

    private SqliteConnectionFactory Track(SqliteConnectionFactory factory)
    {
        _factories.Add(factory);
        return factory;
    }

    public void Dispose()
    {
        _factories.ForEach(factory => factory.ClearPool());
        try { Directory.Delete(_directory, recursive: true); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}
