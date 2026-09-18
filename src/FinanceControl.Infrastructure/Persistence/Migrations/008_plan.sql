-- v1.3: plano 70-20-10 (MEL-45) e número da liberdade.
-- Somente alterações aditivas: colunas novas cujos padrões preservam o comportamento anterior (sem plano, multiplicador 150,
-- nenhuma meta da liberdade vinculada, categorias sem balde). Nenhuma linha existente é modificada.

ALTER TABLE settings ADD COLUMN plan_fixed_pct INTEGER;
ALTER TABLE settings ADD COLUMN plan_fun_pct INTEGER;
ALTER TABLE settings ADD COLUMN plan_invest_pct INTEGER;
ALTER TABLE settings ADD COLUMN freedom_multiplier INTEGER NOT NULL DEFAULT 150;
ALTER TABLE settings ADD COLUMN freedom_goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL;
ALTER TABLE settings ADD COLUMN freedom_goal_auto INTEGER NOT NULL DEFAULT 1;

ALTER TABLE categories ADD COLUMN bucket TEXT CHECK (bucket IS NULL OR bucket IN ('fixo','lazer','investimento','fora'));
