ALTER TABLE configuration
  ADD COLUMN chat_language_model TEXT NOT NULL DEFAULT 'openai/gpt-5.6-sol'
    CHECK (length(chat_language_model) > 0);
