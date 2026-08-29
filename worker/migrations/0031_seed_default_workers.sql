-- Seed the shared full-time schedule and two default workers.
-- Idempotent: reuses an existing "full-time" schedule and skips workers that already exist by name.

INSERT INTO weekly_schedules (
  name, monday, tuesday, wednesday, thursday,
  friday, saturday, sunday, start_minutes, end_minutes
)
SELECT 'full-time', 1, 1, 1, 1, 1, 0, 0, 540, 1020
WHERE NOT EXISTS (
  SELECT 1 FROM weekly_schedules WHERE name = 'full-time'
);

INSERT OR IGNORE INTO workers (name, weekly_schedule_id)
SELECT 'Seed Worker 1', id
FROM weekly_schedules
WHERE name = 'full-time'
ORDER BY id ASC
LIMIT 1;

INSERT OR IGNORE INTO workers (name, weekly_schedule_id)
SELECT 'Seed Worker 2', id
FROM weekly_schedules
WHERE name = 'full-time'
ORDER BY id ASC
LIMIT 1;
