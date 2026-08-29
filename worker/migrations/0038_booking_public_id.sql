-- Public booking links are only valid for bookings created after this feature.
-- Calendar associations must be cleared first because they reference bookings.
DELETE FROM google_calendar_events;
DROP TABLE bookings;

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE CHECK (
    length(public_id) = 16
    AND public_id NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  worker_ids TEXT NOT NULL DEFAULT '[]',
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  email_id TEXT,
  customer_id INTEGER,
  address TEXT,
  estimated_price INTEGER,
  cancelled_at INTEGER,
  rescheduled_at INTEGER,
  delete_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  message_id INTEGER REFERENCES messages(id),
  cancelled_by_message_id INTEGER REFERENCES messages(id),
  rescheduled_by_message_id INTEGER REFERENCES messages(id)
);

CREATE INDEX bookings_customer_id_idx ON bookings (customer_id);
CREATE INDEX bookings_start_time_idx ON bookings (start_time);
CREATE UNIQUE INDEX bookings_message_id_idx
  ON bookings (message_id)
  WHERE message_id IS NOT NULL;
CREATE UNIQUE INDEX bookings_cancelled_by_message_id_idx
  ON bookings (cancelled_by_message_id)
  WHERE cancelled_by_message_id IS NOT NULL;
