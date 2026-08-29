ALTER TABLE configuration
  ADD COLUMN language_model TEXT NOT NULL DEFAULT 'openai/gpt-5.6-luna'
    CHECK (length(language_model) > 0);
