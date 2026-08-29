CREATE TABLE worker_timeoff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (end_time > start_time)
);

CREATE INDEX worker_timeoff_worker_id_idx
  ON worker_timeoff (worker_id);

CREATE INDEX worker_timeoff_range_idx
  ON worker_timeoff (start_time, end_time);
