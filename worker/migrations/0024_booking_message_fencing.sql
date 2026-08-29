ALTER TABLE bookings ADD COLUMN cancelled_by_message_id INTEGER
  REFERENCES messages(id);

ALTER TABLE bookings ADD COLUMN rescheduled_by_message_id INTEGER
  REFERENCES messages(id);

CREATE UNIQUE INDEX bookings_cancelled_by_message_id_idx
  ON bookings (cancelled_by_message_id)
  WHERE cancelled_by_message_id IS NOT NULL;
