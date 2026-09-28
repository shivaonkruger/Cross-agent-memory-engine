-- Existing sessions get a default name since there's no prior value to
-- backfill from; every session created going forward will always pass a
-- real name explicitly (see sessionsService.createSession).
ALTER TABLE sessions
  ADD COLUMN name TEXT NOT NULL DEFAULT 'New session';
