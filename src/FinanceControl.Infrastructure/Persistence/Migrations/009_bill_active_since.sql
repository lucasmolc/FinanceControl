-- R1: conta a pagar só existe a partir do mês em que foi cadastrada (R1-BILLS-1).
-- Somente aditiva: contas existentes ficam com active_since NULL (sem restrição, como antes). Nenhuma linha é modificada.

ALTER TABLE bills ADD COLUMN active_since TEXT;
