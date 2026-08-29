-- Allow customers without a known display name (e.g. SMS-first contacts).
PRAGMA defer_foreign_keys = on;

CREATE TABLE customers_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO customers_new (id, name, created_at)
SELECT id, name, created_at FROM customers;

DROP TABLE customers;
ALTER TABLE customers_new RENAME TO customers;

PRAGMA defer_foreign_keys = off;
