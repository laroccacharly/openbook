-- Single-owner Google Calendar OAuth connection.

CREATE TABLE google_oauth_states (
  state TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE google_calendar_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token TEXT NOT NULL,
  email TEXT,
  connected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
