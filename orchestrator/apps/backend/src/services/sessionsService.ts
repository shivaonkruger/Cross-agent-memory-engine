import { pool } from "../db/pool";
import type { Session } from "../types/shared";

export async function createSession(): Promise<Session> {
  const result = await pool.query<{ id: string; created_at: Date }>(
    "INSERT INTO sessions DEFAULT VALUES RETURNING id, created_at"
  );
  const row = result.rows[0]!;
  return { sessionId: row.id, createdAt: row.created_at.toISOString() };
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
