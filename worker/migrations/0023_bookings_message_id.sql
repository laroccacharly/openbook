ALTER TABLE bookings ADD COLUMN message_id INTEGER
  REFERENCES messages(id);

CREATE UNIQUE INDEX bookings_message_id_idx
  ON bookings (message_id)
  WHERE message_id IS NOT NULL;
