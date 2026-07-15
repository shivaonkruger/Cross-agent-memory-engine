CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id),
  agent       TEXT NOT NULL,        -- claude | gpt4 | gemini
  role        TEXT NOT NULL,        -- user | assistant
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_agent
  ON messages (session_id, agent, created_at);
