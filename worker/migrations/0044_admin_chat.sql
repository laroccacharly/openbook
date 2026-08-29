CREATE TABLE admin_chat (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  messages TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO admin_chat (id) VALUES (1);
