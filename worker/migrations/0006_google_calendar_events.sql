-- Google Calendar synchronization state, decoupled from bookings.
-- Drop the bookings column and create the new table. No migration of old data.
-- Rows are never cascade-deleted: a soft-deleted booking may still need its
-- remote event cleaned up.

CREATE TABLE google_calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  connection_id INTEGER NOT NULL REFERENCES google_calendar_connection(id),
  calendar_id TEXT NOT NULL,
  google_event_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN (
      'pending',
      'synchronized',
      'failed',
      'delete_pending',
      'delete_failed',
      'deleted'
    )
  ),
  last_error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  synchronized_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (connection_id, calendar_id, google_event_id)
);

CREATE INDEX google_calendar_events_status_idx
  ON google_calendar_events (status);

ALTER TABLE bookings DROP COLUMN google_calendar_event_id;
