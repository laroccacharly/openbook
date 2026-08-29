ALTER TABLE configuration
  ADD COLUMN enable_message_delivery INTEGER NOT NULL DEFAULT 0
    CHECK (enable_message_delivery IN (0, 1));
