ALTER TABLE configuration
  ADD COLUMN allow_same_day_bookings INTEGER NOT NULL DEFAULT 1
    CHECK (allow_same_day_bookings IN (0, 1));
