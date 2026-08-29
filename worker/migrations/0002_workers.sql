CREATE TABLE weekly_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  monday INTEGER NOT NULL CHECK (monday IN (0, 1)),
  tuesday INTEGER NOT NULL CHECK (tuesday IN (0, 1)),
  wednesday INTEGER NOT NULL CHECK (wednesday IN (0, 1)),
  thursday INTEGER NOT NULL CHECK (thursday IN (0, 1)),
  friday INTEGER NOT NULL CHECK (friday IN (0, 1)),
  saturday INTEGER NOT NULL CHECK (saturday IN (0, 1)),
  sunday INTEGER NOT NULL CHECK (sunday IN (0, 1)),
  start_minutes INTEGER NOT NULL CHECK (start_minutes BETWEEN 0 AND 1439),
  end_minutes INTEGER NOT NULL CHECK (end_minutes BETWEEN 1 AND 1440),
  CHECK (end_minutes > start_minutes)
);

CREATE TABLE workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  weekly_schedule_id INTEGER NOT NULL REFERENCES weekly_schedules(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX workers_weekly_schedule_id_idx
  ON workers (weekly_schedule_id);
