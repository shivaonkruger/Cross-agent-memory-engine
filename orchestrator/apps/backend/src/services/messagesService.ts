import { pool } from "../db/pool";
import type { Agent, ChatMessage } from "../types/shared";

interface MessageRow {
  id: string;
  agent: Agent;
  role: "user" | "assistant";
  content: string;
  created_at: Date;
}

function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    agent: row.agent,
    role: row.role,
    content: row.content,
    createdAt: row.created_at.toISOString(),
  };
}

export async function insertMessage(params: {
  sessionId: string;
  agent: Agent;
  role: "user" | "assistant";
  content: string;
}): Promise<ChatMessage> {
  const result = await pool.query<MessageRow>(
    `INSERT INTO messages (session_id, agent, role, content)
     VALUES ($1, $2, $3, $4)
     RETURNING id, agent, role, content, created_at`,
    [params.sessionId, params.agent, params.role, params.content]
  );
  return toChatMessage(result.rows[0]!);
}

export async function getMessagesAfter(
  sessionId: string,
  agent: Agent,
  afterMessageId: string | null
): Promise<ChatMessage[]> {
  const result = await pool.query<MessageRow>(
    `SELECT id, agent, role, content, created_at
     FROM messages
     WHERE session_id = $1 AND agent = $2
       AND ($3::uuid IS NULL OR created_at > (SELECT created_at FROM messages WHERE id = $3::uuid))
     ORDER BY created_at ASC`,
    [sessionId, agent, afterMessageId]
  );
  return result.rows.map(toChatMessage);
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const result = await pool.query<MessageRow>(
    `SELECT id, agent, role, content, created_at
     FROM messages
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );
  return result.rows.map(toChatMessage);
}
