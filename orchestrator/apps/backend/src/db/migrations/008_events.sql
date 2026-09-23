CREATE TABLE IF NOT EXISTS events (
  id                  TEXT PRIMARY KEY,
  session_id          UUID NOT NULL REFERENCES sessions(id),
  type                TEXT NOT NULL,          -- FINDING|DECISION|QUESTION|BLOCKER|CONTRADICTION|OUTPUT|HANDOFF
  agent               TEXT NOT NULL,          -- claude|gpt4|gemini
  summary             TEXT NOT NULL,
  payload             JSONB NOT NULL DEFAULT '{}',
  confidence          TEXT,                   -- high|medium|low
  resolves            TEXT REFERENCES events(id),
  resolved_by         TEXT REFERENCES events(id),
  requires_response   BOOLEAN DEFAULT false,
  preserve            BOOLEAN DEFAULT false,
  tier                INTEGER,                -- set later by compression engine, nullable for now
  compressed          BOOLEAN DEFAULT false,  -- set later by compression engine
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_session_created
  ON events (session_id, created_at DESC);
