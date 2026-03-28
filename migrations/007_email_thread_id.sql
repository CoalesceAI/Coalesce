-- Add email_thread_id to sessions for email channel multi-turn continuity.
-- When a support email arrives, we look up the session by AgentMail thread_id
-- so follow-up replies continue the same conversation.

ALTER TABLE sessions ADD COLUMN email_thread_id TEXT;

CREATE INDEX idx_sessions_email_thread_id ON sessions (email_thread_id) WHERE email_thread_id IS NOT NULL;
