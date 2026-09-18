-- v1.1: vínculos entre lançamentos, contas bancárias e pagamentos; histórico estornável de movimentações.
-- Somente alterações aditivas: colunas novas com padrão NULL e índices.
ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE bill_payments ADD COLUMN transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE goal_entries ADD COLUMN deleted_at TEXT;
ALTER TABLE investment_entries ADD COLUMN deleted_at TEXT;
ALTER TABLE investment_entries ADD COLUMN invested_delta_cents INTEGER;
ALTER TABLE investment_entries ADD COLUMN current_delta_cents INTEGER;
ALTER TABLE bank_entries ADD COLUMN deleted_at TEXT;
ALTER TABLE bank_entries ADD COLUMN delta_cents INTEGER;
ALTER TABLE bank_entries ADD COLUMN transfer_entry_id INTEGER REFERENCES bank_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS ix_bill_payments_month ON bill_payments(month);
CREATE INDEX IF NOT EXISTS ix_goal_entries_goal ON goal_entries(goal_id);
CREATE INDEX IF NOT EXISTS ix_investment_entries_investment ON investment_entries(investment_id);
CREATE INDEX IF NOT EXISTS ix_bank_entries_account ON bank_entries(account_id);
