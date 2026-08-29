CREATE TABLE workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  workflow_instance_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'completed', 'failed')
  ),
  stage TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  failed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (record_name, record_id)
);

CREATE INDEX workflows_status_idx ON workflows (status);
