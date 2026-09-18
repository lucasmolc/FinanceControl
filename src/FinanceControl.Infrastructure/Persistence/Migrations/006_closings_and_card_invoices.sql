-- v1.3 (plataforma): fechamento mensal com resumo congelado e faturas de cartão.
-- Somente alterações aditivas: colunas novas com padrão NULL, uma tabela nova e índices; nenhuma linha existente é modificada.
ALTER TABLE transactions ADD COLUMN card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL;
ALTER TABLE monthly_closings ADD COLUMN summary_json TEXT;

CREATE TABLE IF NOT EXISTS card_invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  date TEXT NOT NULL,
  account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
  bank_entry_id INTEGER REFERENCES bank_entries(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(card_id, month)
);

CREATE INDEX IF NOT EXISTS ix_transactions_card ON transactions(card_id, date);
