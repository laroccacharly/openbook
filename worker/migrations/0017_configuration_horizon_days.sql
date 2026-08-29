ALTER TABLE configuration
  ADD COLUMN horizon_days INTEGER NOT NULL DEFAULT 365
    CHECK (horizon_days > 0);
