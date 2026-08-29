CREATE TABLE holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE
    CHECK (date GLOB '????-??-??'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
