CREATE TABLE IF NOT EXISTS long_term_memory (
  session_id              UUID PRIMARY KEY REFERENCES sessions(id),
  version                 INTEGER DEFAULT 0,
  session_narrative       TEXT DEFAULT '',
  settled_facts           JSONB DEFAULT '[]',
  decision_log            JSONB DEFAULT '[]',
  contradiction_registry  JSONB DEFAULT '[]',
  entity_map              JSONB DEFAULT '{}',
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
