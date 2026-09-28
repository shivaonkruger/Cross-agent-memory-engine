CREATE EXTENSION IF NOT EXISTS vector;

-- all-MiniLM-L6-v2 outputs 384-dimensional embeddings.
ALTER TABLE events ADD COLUMN embedding vector(384);

-- events.id is TEXT ("evt_" + nanoid), not uuid, so corroborated_by matches
-- that rather than uuid[].
ALTER TABLE events ADD COLUMN corroborated_by TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE events ADD COLUMN corroboration_count INTEGER NOT NULL DEFAULT 0;

-- HNSW, not IVFFlat: IVFFlat's `lists` parameter needs tuning against a
-- meaningful row count to be effective, and this table is still small —
-- HNSW has no equivalent cold-start problem and works well from day one.
-- vector_cosine_ops matches the <=> cosine-distance operator used in the
-- application query.
CREATE INDEX IF NOT EXISTS idx_events_embedding_hnsw
  ON events USING hnsw (embedding vector_cosine_ops);
