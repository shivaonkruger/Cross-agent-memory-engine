CREATE TABLE IF NOT EXISTS short_term_memory (
  session_id        UUID PRIMARY KEY REFERENCES sessions(id),
  event_window      JSONB DEFAULT '[]',
  agent_states      JSONB DEFAULT '{}',
  pending_questions JSONB DEFAULT '[]',
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
