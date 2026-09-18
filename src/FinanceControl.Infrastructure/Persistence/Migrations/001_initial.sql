CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), setup_completed INTEGER NOT NULL DEFAULT 0,
  display_name TEXT NOT NULL DEFAULT 'Usuário', currency TEXT NOT NULL DEFAULT 'BRL',
  monthly_net_income_cents INTEGER NOT NULL DEFAULT 0, monthly_spending_limit_cents INTEGER NOT NULL DEFAULT 0,
  emergency_months_target INTEGER NOT NULL DEFAULT 6, tour_completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO settings (id) VALUES (1);
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('income','expense','investment')), monthly_budget_cents INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, description TEXT NOT NULL, category_id INTEGER, kind TEXT NOT NULL CHECK(kind IN ('income','expense','investment')), amount_cents INTEGER NOT NULL, payment_method TEXT NOT NULL DEFAULT 'card', notes TEXT, FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, amount_cents INTEGER NOT NULL, due_day INTEGER NOT NULL DEFAULT 10, category_id INTEGER, recurring INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS bill_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER NOT NULL, month TEXT NOT NULL, paid INTEGER NOT NULL DEFAULT 0, paid_at TEXT, UNIQUE(bill_id, month), FOREIGN KEY(bill_id) REFERENCES bills(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'custom', target_cents INTEGER NOT NULL, current_cents INTEGER NOT NULL DEFAULT 0, target_date TEXT, currency TEXT NOT NULL DEFAULT 'BRL', active INTEGER NOT NULL DEFAULT 1, notes TEXT);
CREATE TABLE IF NOT EXISTS goal_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_id INTEGER NOT NULL, date TEXT NOT NULL, amount_cents INTEGER NOT NULL, notes TEXT, FOREIGN KEY(goal_id) REFERENCES goals(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS investments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, institution TEXT, type TEXT NOT NULL DEFAULT 'fixed_income', invested_cents INTEGER NOT NULL DEFAULT 0, current_cents INTEGER NOT NULL DEFAULT 0, liquidity TEXT, benchmark TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS investment_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, investment_id INTEGER NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('deposit','withdrawal','yield','adjustment')), amount_cents INTEGER NOT NULL, notes TEXT, FOREIGN KEY(investment_id) REFERENCES investments(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, closing_day INTEGER NOT NULL DEFAULT 25, due_day INTEGER NOT NULL DEFAULT 5, real_limit_cents INTEGER NOT NULL DEFAULT 0, personal_limit_cents INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS bank_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, institution TEXT NOT NULL, account_type TEXT NOT NULL DEFAULT 'checking', current_balance_cents INTEGER NOT NULL DEFAULT 0, color_label TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS bank_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, date TEXT NOT NULL, description TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('deposit','withdrawal','transfer_in','transfer_out','adjustment')), amount_cents INTEGER NOT NULL, related_account_id INTEGER, notes TEXT, FOREIGN KEY(account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE, FOREIGN KEY(related_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, amount_cents INTEGER NOT NULL, billing_day INTEGER NOT NULL DEFAULT 1, category_id INTEGER, card_id INTEGER, frequency TEXT NOT NULL DEFAULT 'monthly', next_billing_date TEXT, active INTEGER NOT NULL DEFAULT 1, notes TEXT, FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL, FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS monthly_closings (month TEXT PRIMARY KEY, closed INTEGER NOT NULL DEFAULT 0, closed_at TEXT, notes TEXT);
INSERT INTO categories(name,kind,monthly_budget_cents)
SELECT name,kind,budget FROM (
 SELECT 'Moradia/Contas' name,'expense' kind,0 budget UNION ALL SELECT 'Alimentação','expense',100000
 UNION ALL SELECT 'Combustível','expense',45000 UNION ALL SELECT 'Lazer','expense',90000
 UNION ALL SELECT 'Compras pessoais','expense',40000 UNION ALL SELECT 'Moto','expense',50000
 UNION ALL SELECT 'Outros','expense',30000 UNION ALL SELECT 'Salário','income',0
 UNION ALL SELECT 'Investimentos','investment',0
) WHERE NOT EXISTS (SELECT 1 FROM categories);
