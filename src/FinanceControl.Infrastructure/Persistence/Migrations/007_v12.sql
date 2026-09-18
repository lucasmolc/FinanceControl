-- v1.2: múltiplas moedas, cotações e indicadores, débito automático, patrimônio mensal, preferências de interface,
-- marcas/logos/ícones/cores, reserva de emergência vinculada a uma meta e vínculo do pagamento de fatura com a saída.
-- Aditiva: tabelas e colunas novas (padrões preservam o comportamento anterior). Dados alterados apenas para preencher
-- as colunas novas: base_amount_cents/exchange_rate dos lançamentos (valor em BRL = valor, cotação "1"), o vínculo
-- bank_entries → fatura dos pagamentos já feitos e, quando inequívoca, a meta da reserva de emergência.

CREATE TABLE IF NOT EXISTS exchange_rates (
  currency TEXT PRIMARY KEY,
  rate_brl TEXT NOT NULL,
  change_pct REAL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  manual INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS market_indicators (
  code TEXT PRIMARY KEY,
  value REAL NOT NULL,
  reference_date TEXT,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  month TEXT PRIMARY KEY,
  bank_cents INTEGER NOT NULL,
  investments_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE settings ADD COLUMN ui_preferences TEXT;
ALTER TABLE settings ADD COLUMN market_auto_refresh INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN market_last_refresh_at TEXT;
ALTER TABLE settings ADD COLUMN market_last_error TEXT;
ALTER TABLE settings ADD COLUMN emergency_goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL;
ALTER TABLE settings ADD COLUMN emergency_goal_auto INTEGER NOT NULL DEFAULT 1;

ALTER TABLE bank_accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE bank_accounts ADD COLUMN brand TEXT;
ALTER TABLE bank_accounts ADD COLUMN logo_data TEXT;

ALTER TABLE investments ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE investments ADD COLUMN brand TEXT;
ALTER TABLE investments ADD COLUMN logo_data TEXT;

ALTER TABLE cards ADD COLUMN brand TEXT;
ALTER TABLE cards ADD COLUMN network TEXT;
ALTER TABLE cards ADD COLUMN color TEXT;

ALTER TABLE categories ADD COLUMN icon TEXT;
ALTER TABLE categories ADD COLUMN color TEXT;

ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE transactions ADD COLUMN base_amount_cents INTEGER;
ALTER TABLE transactions ADD COLUMN exchange_rate TEXT;
ALTER TABLE transactions ADD COLUMN brand TEXT;
UPDATE transactions SET base_amount_cents = amount_cents, exchange_rate = '1' WHERE base_amount_cents IS NULL;

ALTER TABLE bills ADD COLUMN auto_debit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN auto_debit_since TEXT;
ALTER TABLE bills ADD COLUMN account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE bills ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE bills ADD COLUMN icon TEXT;
ALTER TABLE bills ADD COLUMN brand TEXT;

ALTER TABLE subscriptions ADD COLUMN auto_debit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN auto_debit_since TEXT;
ALTER TABLE subscriptions ADD COLUMN account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE subscriptions ADD COLUMN icon TEXT;
ALTER TABLE subscriptions ADD COLUMN brand TEXT;

ALTER TABLE bill_payments ADD COLUMN auto_debit_skipped INTEGER NOT NULL DEFAULT 0;

-- Saída de pagamento de fatura: estornar pelo extrato desfaz o pagamento e desfazer o estorno o refaz (MEL-44).
ALTER TABLE bank_entries ADD COLUMN invoice_card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL;
ALTER TABLE bank_entries ADD COLUMN invoice_month TEXT;
UPDATE bank_entries
SET invoice_card_id = (SELECT p.card_id FROM card_invoice_payments p WHERE p.bank_entry_id = bank_entries.id),
    invoice_month = (SELECT p.month FROM card_invoice_payments p WHERE p.bank_entry_id = bank_entries.id)
WHERE id IN (SELECT bank_entry_id FROM card_invoice_payments WHERE bank_entry_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS ix_bills_auto_debit ON bills(auto_debit, active);
CREATE INDEX IF NOT EXISTS ix_subscriptions_auto_debit ON subscriptions(auto_debit, active);
CREATE INDEX IF NOT EXISTS ix_bank_entries_invoice ON bank_entries(invoice_card_id, invoice_month);

-- Reserva de emergência (MEL-43): com salário informado, vincula a única meta ativa do tipo "emergência";
-- sem nenhuma meta desse tipo, vincula a única meta ativa cujo nome começa com "Reserva de emerg" (bancos anteriores
-- ao tipo). Em qualquer outro caso nada é vinculado (a sincronização cria ou escolhe a meta no próximo salvamento).
UPDATE settings
SET emergency_goal_id = (SELECT id FROM goals WHERE active = 1 AND type = 'emergency')
WHERE id = 1 AND monthly_net_income_cents > 0
  AND (SELECT COUNT(*) FROM goals WHERE active = 1 AND type = 'emergency') = 1;

UPDATE settings
SET emergency_goal_id = (SELECT id FROM goals WHERE active = 1 AND LOWER(name) LIKE 'reserva de emerg%')
WHERE id = 1 AND monthly_net_income_cents > 0 AND emergency_goal_id IS NULL
  AND (SELECT COUNT(*) FROM goals WHERE active = 1 AND type = 'emergency') = 0
  AND (SELECT COUNT(*) FROM goals WHERE active = 1 AND LOWER(name) LIKE 'reserva de emerg%') = 1;
