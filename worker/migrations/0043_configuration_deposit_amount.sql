ALTER TABLE configuration
  ADD COLUMN deposit_amount INTEGER NOT NULL DEFAULT 50
    CHECK (deposit_amount > 0);
