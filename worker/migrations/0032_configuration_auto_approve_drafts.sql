ALTER TABLE configuration
  ADD COLUMN auto_approve_drafts INTEGER NOT NULL DEFAULT 0
    CHECK (auto_approve_drafts IN (0, 1));
