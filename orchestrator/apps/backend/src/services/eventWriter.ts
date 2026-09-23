import { nanoid } from "nanoid";
import { pool } from "../db/pool";
import type { EventCandidate } from "./responseParser";

const EVENT_WINDOW_CAP = 20;

interface ShortTermMemoryRow {
  event_window: Array<Record<string, unknown>>;
  agent_states: Record<string, unknown>;
  pending_questions: string[];
}

/**
 * Writes a classifier-validated event: inserts the real events-table row
 * (source of truth), links it to whatever it resolves, and refreshes
 * short_term_memory's event_window/agent_states/pending_questions (the
 * denormalized read cache) — all inside one transaction. Throws (after
 * rolling back) rather than swallowing a failure, so the caller knows the
 * write did not happen.
 */
export async function writeEvent(
  sessionId: string,
  agent: string,
  event: EventCandidate
): Promise<{ eventId: string }> {
  const eventId = `evt_${nanoid(8)}`;
  const requiresResponse = event.type === "QUESTION";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO events (id, session_id, type, agent, summary, confidence, resolves, requires_response, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '{}'::jsonb)`,
      [
        eventId,
        sessionId,
        event.type,
        agent,
        event.summary,
        event.confidence || null,
        event.resolves,
        requiresResponse,
      ]
    );

    if (event.resolves) {
      await client.query("UPDATE events SET resolved_by = $1 WHERE id = $2", [eventId, event.resolves]);
    }

    const shortTermResult = await client.query<ShortTermMemoryRow>(
      "SELECT event_window, agent_states, pending_questions FROM short_term_memory WHERE session_id = $1 FOR UPDATE",
      [sessionId]
    );
    const shortTerm = shortTermResult.rows[0] ?? {
      event_window: [],
      agent_states: {},
      pending_questions: [],
    };

    const newWindowItem = {
      id: eventId,
      type: event.type,
      agent,
      summary: event.summary,
      confidence: event.confidence || null,
    };
    const eventWindow = [newWindowItem, ...shortTerm.event_window].slice(0, EVENT_WINDOW_CAP);

    const agentStates = {
      ...shortTerm.agent_states,
      [agent]: { last_output_type: event.type, last_output_summary: event.summary },
    };

    let pendingQuestions = shortTerm.pending_questions;
    if (requiresResponse) {
      pendingQuestions = [...pendingQuestions, eventId];
    }
    if (event.resolves) {
      pendingQuestions = pendingQuestions.filter((id) => id !== event.resolves);
    }

    await client.query(
      `UPDATE short_term_memory
       SET event_window = $1, agent_states = $2, pending_questions = $3, updated_at = NOW()
       WHERE session_id = $4`,
      [JSON.stringify(eventWindow), JSON.stringify(agentStates), JSON.stringify(pendingQuestions), sessionId]
    );

    await client.query("COMMIT");
    console.log(
      `eventWriter: wrote ${eventId}, type=${event.type}, session=${sessionId}, agent=${agent}, resolves=${event.resolves ?? "none"}`
    );
    return { eventId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`eventWriter: failed to write event for session=${sessionId}, agent=${agent}`, err);
    throw err;
  } finally {
    client.release();
  }
}
