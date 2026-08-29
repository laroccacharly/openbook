CREATE UNIQUE INDEX llm_tasks_message_type_idx
  ON llm_tasks (message_id, task_type);
