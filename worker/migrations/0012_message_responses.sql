-- Mutable outbound drafts and immutable approved replies.

CREATE TABLE response_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL UNIQUE REFERENCES messages(id),
  conversation_id INTEGER REFERENCES conversations(id),
  body TEXT NOT NULL,
  proposed_datetime INTEGER,
  pipeline_state TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX response_drafts_conversation_idx
  ON response_drafts (conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE TABLE message_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_draft_id INTEGER NOT NULL UNIQUE,
  message_id INTEGER NOT NULL UNIQUE REFERENCES messages(id),
  body TEXT NOT NULL,
  proposed_datetime INTEGER,
  pipeline_state TEXT,
  approved_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TRIGGER message_responses_delete_promoted_draft
AFTER INSERT ON message_responses
BEGIN
  DELETE FROM response_drafts WHERE id = NEW.source_draft_id;
END;
