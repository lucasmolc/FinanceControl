UPDATE settings
SET display_name = '', updated_at = CURRENT_TIMESTAMP
WHERE TRIM(display_name) IN ('Usuário', 'Usuario');

DELETE FROM categories
WHERE active = 1
  AND NOT EXISTS (SELECT 1 FROM transactions WHERE transactions.category_id = categories.id)
  AND NOT EXISTS (SELECT 1 FROM bills WHERE bills.category_id = categories.id)
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE subscriptions.category_id = categories.id)
  AND (
    (name = 'Moradia/Contas' AND kind = 'expense' AND monthly_budget_cents = 0) OR
    (name = 'Alimentação' AND kind = 'expense' AND monthly_budget_cents = 100000) OR
    (name = 'Combustível' AND kind = 'expense' AND monthly_budget_cents = 45000) OR
    (name = 'Lazer' AND kind = 'expense' AND monthly_budget_cents = 90000) OR
    (name = 'Compras pessoais' AND kind = 'expense' AND monthly_budget_cents = 40000) OR
    (name = 'Moto' AND kind = 'expense' AND monthly_budget_cents = 50000) OR
    (name = 'Outros' AND kind = 'expense' AND monthly_budget_cents = 30000) OR
    (name = 'Salário' AND kind = 'income' AND monthly_budget_cents = 0) OR
    (name = 'Investimentos' AND kind = 'investment' AND monthly_budget_cents = 0)
  );
