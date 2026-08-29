-- Customers created from inbound messages.

CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX customers_from_email_idx ON customers (from_email);
