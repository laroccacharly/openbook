-- Responses are created at approval time; approved_at duplicated created_at.

ALTER TABLE message_responses DROP COLUMN approved_at;
