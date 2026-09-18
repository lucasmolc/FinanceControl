-- Banco de contas (accounts.db): quem entra na aplicação. Os dados financeiros de cada usuário ficam em
-- users/<id>/finance.db. AUTOINCREMENT garante que um id nunca é reutilizado (nenhum usuário novo herda o banco de outro).
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  security_stamp TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
