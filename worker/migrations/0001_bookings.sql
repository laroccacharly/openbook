-- Bookings table (ported from cmail BookingRow).
-- Timestamps are Unix seconds. worker_ids is a JSON array of integers.

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX bookings_customer_id_idx ON bookings (customer_id);
CREATE INDEX bookings_start_time_idx ON bookings (start_time);
