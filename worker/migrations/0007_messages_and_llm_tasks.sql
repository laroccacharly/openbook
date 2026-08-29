-- Inbound messages and structured LLM task outputs.

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  address TEXT NOT NULL,
  latest_message_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (channel, address)
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  from_email TEXT,
  conversation_id INTEGER REFERENCES conversations(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TRIGGER messages_advance_conversation
AFTER INSERT ON messages
WHEN NEW.conversation_id IS NOT NULL
BEGIN
  UPDATE conversations
  SET latest_message_id = NEW.id,
      updated_at = unixepoch()
  WHERE id = NEW.conversation_id;
END;

CREATE TABLE llm_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id),
  task_type TEXT NOT NULL,
  result TEXT,
  model TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  failed_at INTEGER,
  error TEXT
);

CREATE INDEX llm_tasks_message_id_idx ON llm_tasks (message_id);
