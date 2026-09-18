ALTER TABLE transactions ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS ix_transactions_date_active ON transactions(date, deleted_at);
