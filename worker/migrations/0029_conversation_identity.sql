-- Require conversation identity: contact methods, non-null conversation FKs.
-- Applied after stage DB reset; does not preserve legacy rows.

PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS messages_advance_conversation;
DROP TRIGGER IF EXISTS message_responses_delete_promoted_draft;

CREATE TABLE customers_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

DROP TABLE customers;
ALTER TABLE customers_new RENAME TO customers;

CREATE TABLE customer_contact_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  address TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (channel, address)
);

CREATE INDEX customer_contact_methods_customer_id_idx
  ON customer_contact_methods (customer_id);

CREATE TABLE conversations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_method_id INTEGER NOT NULL UNIQUE REFERENCES customer_contact_methods(id),
  latest_message_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

DROP TABLE conversations;
ALTER TABLE conversations_new RENAME TO conversations;

CREATE TABLE messages_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  external_id TEXT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

DROP INDEX IF EXISTS messages_external_id_idx;
DROP INDEX IF EXISTS messages_conversation_idx;
DROP INDEX IF EXISTS messages_conversation_id_idx;
DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

CREATE UNIQUE INDEX messages_external_id_idx
  ON messages (external_id);
CREATE INDEX messages_conversation_id_idx
  ON messages (conversation_id, created_at, id);

CREATE TRIGGER messages_advance_conversation
AFTER INSERT ON messages
BEGIN
  UPDATE conversations
  SET latest_message_id = NEW.id,
      updated_at = unixepoch()
  WHERE id = NEW.conversation_id;
END;

CREATE TABLE response_drafts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL UNIQUE REFERENCES messages(id),
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  body TEXT NOT NULL,
  proposed_datetime INTEGER,
  pipeline_state TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

DROP INDEX IF EXISTS response_drafts_conversation_idx;
DROP TABLE response_drafts;
ALTER TABLE response_drafts_new RENAME TO response_drafts;

CREATE UNIQUE INDEX response_drafts_conversation_idx
  ON response_drafts (conversation_id);

CREATE TRIGGER message_responses_delete_promoted_draft
AFTER INSERT ON message_responses
BEGIN
  DELETE FROM response_drafts WHERE id = NEW.source_draft_id;
END;

PRAGMA foreign_keys = ON;
