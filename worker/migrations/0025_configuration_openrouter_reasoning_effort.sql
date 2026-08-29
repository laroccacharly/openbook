ALTER TABLE configuration
  ADD COLUMN openrouter_reasoning_effort TEXT
    CHECK (openrouter_reasoning_effort IN ('max', 'xhigh', 'high', 'medium', 'low', 'minimal', 'none'));
