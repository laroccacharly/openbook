CREATE TABLE job_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  estimated_price_dollars INTEGER NOT NULL CHECK (estimated_price_dollars > 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  worker_count INTEGER NOT NULL CHECK (worker_count > 0)
);

INSERT INTO job_catalog (
  name,
  estimated_price_dollars,
  duration_minutes,
  worker_count
) VALUES
  ('Replacing/fixing sinks', 500, 60, 1),
  ('Fixing hot water heaters', 1000, 120, 1),
  ('Replacing a bathtub', 2000, 120, 2);
