-- Drop old constraint and replace with one that matches the domain SessionStatus type
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('active', 'resolved', 'expired', 'needs_info', 'unknown'));
