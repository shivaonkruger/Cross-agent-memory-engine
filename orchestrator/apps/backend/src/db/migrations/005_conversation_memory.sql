CREATE TABLE IF NOT EXISTS conversation_memory (
  session_id                       UUID NOT NULL REFERENCES sessions(id),
  agent                            TEXT NOT NULL,
  rolling_summary                  TEXT DEFAULT '',
  last_summarized_message_id       UUID REFERENCES messages(id),
  updated_at                       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (session_id, agent)
);
