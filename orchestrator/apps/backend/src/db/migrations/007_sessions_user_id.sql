-- Scope sessions to the user that created them. Added after the pre-auth
-- sessions were manually cleared out, so no backfill is needed — NOT NULL is
-- safe to add directly.
ALTER TABLE sessions
  ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
