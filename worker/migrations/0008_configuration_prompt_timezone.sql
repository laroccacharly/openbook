ALTER TABLE configuration
  ADD COLUMN master_system_prompt TEXT NOT NULL
    DEFAULT 'You are a customer service agent for a Plumbing business';

ALTER TABLE configuration
  ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Toronto';
