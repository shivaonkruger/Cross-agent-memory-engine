import { pool } from "../db/pool";
import type { Agent, Session } from "../types/shared";

const ALL_AGENTS: Agent[] = ["claude", "gpt4", "gemini"];

export async function createSession(): Promise<Session> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{ id: string; created_at: Date }>(
      "INSERT INTO sessions DEFAULT VALUES RETURNING id, created_at"
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
    return { sessionId: row.id, createdAt: row.created_at.toISOString() };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listActiveSessions(): Promise<Session[]> {
  const result = await pool.query<{ id: string; created_at: Date }>(
    "SELECT id, created_at FROM sessions WHERE deleted_at IS NULL ORDER BY created_at DESC"
  );
  return result.rows.map((row) => ({
    sessionId: row.id,
    createdAt: row.created_at.toISOString(),
  }));
}
