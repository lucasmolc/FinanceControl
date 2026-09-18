-- v1.2 (usabilidade): resgate em metas e cobranças lançadas de assinaturas.
-- Somente alterações aditivas: nenhuma linha existente é modificada (aportes antigos passam a valer como 'contribution').
ALTER TABLE goal_entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'contribution' CHECK(kind IN ('contribution','withdrawal'));

CREATE TABLE IF NOT EXISTS subscription_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  charge_date TEXT NOT NULL,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subscription_id, charge_date)
);
CREATE INDEX IF NOT EXISTS ix_subscription_charges_transaction ON subscription_charges(transaction_id);
