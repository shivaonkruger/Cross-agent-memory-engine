import { pool } from "../db/pool";
import type { Agent, Session } from "../types/shared";

const ALL_AGENTS: Agent[] = ["claude", "gpt4", "gemini"];

export async function createSession(userId: string, name: string): Promise<Session> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{ id: string; created_at: Date; name: string }>(
      "INSERT INTO sessions (user_id, name) VALUES ($1, $2) RETURNING id, created_at, name",
      [userId, name]
    );
    const row = result.rows[0]!;

    await client.query("INSERT INTO short_term_memory (session_id) VALUES ($1)", [row.id]);
    await client.query("INSERT INTO long_term_memory (session_id) VALUES ($1)", [row.id]);
    for (const agent of ALL_AGENTS) {
      await client.query("INSERT INTO conversation_memory (session_id, agent) VALUES ($1, $2)", [
        row.id,
        agent,
      ]);
    }

    await client.query("COMMIT");
    return { sessionId: row.id, createdAt: row.created_at.toISOString(), name: row.name };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listActiveSessions(userId: string): Promise<Session[]> {
  const result = await pool.query<{ id: string; created_at: Date; name: string }>(
    "SELECT id, created_at, name FROM sessions WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC",
    [userId]
  );
  return result.rows.map((row) => ({
    sessionId: row.id,
    createdAt: row.created_at.toISOString(),
    name: row.name,
  }));
}

/**
 * Renames a session — only if it exists, isn't deleted, and is owned by
 * userId (same ownership guard as deleteSession). Returns the updated
 * session, or null if not found/not yours, so the route can 404 rather
 * than leak whether a session id belongs to someone else.
 */
export async function renameSession(
  sessionId: string,
  userId: string,
  name: string
): Promise<Session | null> {
  const result = await pool.query<{ id: string; created_at: Date; name: string }>(
    "UPDATE sessions SET name = $1 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id, created_at, name",
    [name, sessionId, userId]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return { sessionId: row.id, createdAt: row.created_at.toISOString(), name: row.name };
}

/** Returns the owning user's id, or null if the session doesn't exist (or was deleted). */
export async function getSessionOwnerId(sessionId: string): Promise<string | null> {
  const result = await pool.query<{ user_id: string }>(
    "SELECT user_id FROM sessions WHERE id = $1 AND deleted_at IS NULL",
    [sessionId]
  );
  return result.rows[0]?.user_id ?? null;
}

/**
 * Soft-deletes a session (sets deleted_at) — only if it exists, isn't
 * already deleted, and is owned by userId. Returns true if a row was
 * actually updated, false otherwise (not found / not yours / already gone),
 * so the route can tell those apart from a real failure.
 */
export async function deleteSession(sessionId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE sessions SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    [sessionId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}
