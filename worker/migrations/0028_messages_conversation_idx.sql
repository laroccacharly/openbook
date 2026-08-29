DROP INDEX messages_from_email_idx;

CREATE INDEX messages_conversation_idx
  ON messages (from_email, channel, created_at, id);

CREATE INDEX messages_conversation_id_idx
  ON messages (conversation_id, created_at, id);
