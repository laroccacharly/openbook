ALTER TABLE configuration
  ADD COLUMN booking_buffer_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (booking_buffer_minutes >= 0);
