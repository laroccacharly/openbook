CREATE TABLE message_delivery_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_response_id INTEGER NOT NULL UNIQUE REFERENCES message_responses(id),
  provider TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  provider_status TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (provider, provider_message_id)
);
