-- Stable provider / caller identity for inbound message deduplication.
-- SQLite treats NULLs as distinct, so many rows may omit external_id.
-- Callers own namespacing (e.g. email vs sms) inside the key when needed.

ALTER TABLE messages ADD COLUMN external_id TEXT;

CREATE UNIQUE INDEX messages_external_id_idx
  ON messages (external_id);
