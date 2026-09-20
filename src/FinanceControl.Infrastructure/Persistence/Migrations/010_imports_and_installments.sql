-- v1.4: importação de fatura/extrato, parcelamento e saldo por data.
-- Somente aditiva: colunas novas e índices. A única linha alterada é `transactions.balance_applied`, preenchida para
-- que os saldos das contas continuem exatamente iguais aos de antes da migração (ver abaixo).

-- Últimos 4 dígitos do cartão: é por eles que a importação diz qual cartão do banco foi usado em cada compra.
ALTER TABLE cards ADD COLUMN last_digits TEXT;

-- Origem da linha importada (hash determinístico de arquivo + destino + data + descrição + valor + ocorrência).
-- Não nulo = lançamento veio de uma importação; reimportar o mesmo arquivo não duplica.
ALTER TABLE transactions ADD COLUMN import_fingerprint TEXT;

-- Série de parcelas: mesmo grupo para as N parcelas da mesma compra, com a posição e o total ("6/10").
ALTER TABLE transactions ADD COLUMN installment_group TEXT;
ALTER TABLE transactions ADD COLUMN installment_number INTEGER;
ALTER TABLE transactions ADD COLUMN installment_count INTEGER;

-- Saldo da conta só conta lançamento cuja data já chegou. `balance_applied` diz se o lançamento já entrou no saldo;
-- os que ainda não venceram entram quando a data chega (job de débito automático). Lançamentos existentes são
-- marcados como aplicados (removidos, não), que é exatamente o estado dos saldos gravados hoje.
ALTER TABLE transactions ADD COLUMN balance_applied INTEGER NOT NULL DEFAULT 0;
UPDATE transactions SET balance_applied = 1 WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_transactions_import ON transactions(import_fingerprint);
CREATE INDEX IF NOT EXISTS ix_transactions_installment ON transactions(installment_group);
CREATE INDEX IF NOT EXISTS ix_transactions_pending_balance ON transactions(balance_applied, date) WHERE account_id IS NOT NULL;
