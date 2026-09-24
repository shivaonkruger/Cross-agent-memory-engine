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

    // The classifier's `resolves` comes from an LLM and cannot be trusted
    // as-is: it can hallucinate an id that doesn't exist, reference a real
    // event belonging to a DIFFERENT session, point at something that isn't
    // even a QUESTION, or re-target a QUESTION that's already resolved.
    // Whether this response's reasoning actually answers that question is
    // unavoidably the model's judgment call — but whether the target is
    // real, ours, the right type, and still open is pure state safety, and
    // gets enforced here before anything touches the database. An invalid
    // reference is stripped and logged, never allowed to corrupt the graph
    // and never allowed to fail the write.
    let validatedResolves: string | null = null;
    if (event.resolves) {
      const targetCheck = await client.query(
        `SELECT id FROM events
         WHERE id = $1
           AND session_id = $2
           AND type = 'QUESTION'
           AND resolved_by IS NULL
           AND deleted_at IS NULL`,
        [event.resolves, sessionId]
      );

      if (targetCheck.rows.length === 0) {
        console.warn(
          `eventWriter: invalid resolves reference "${event.resolves}" for session ${sessionId} — ` +
            `target does not exist, belongs to another session, is not an open QUESTION, or was ` +
            `already resolved. Stripping the pointer; new event will be written without a resolves link.`
        );
        validatedResolves = null;
      } else {
        validatedResolves = event.resolves;
      }
    }

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
        validatedResolves,
        requiresResponse,
      ]
    );

    if (validatedResolves) {
      await client.query("UPDATE events SET resolved_by = $1 WHERE id = $2", [eventId, validatedResolves]);
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
    if (validatedResolves) {
      pendingQuestions = pendingQuestions.filter((id) => id !== validatedResolves);
    }

    await client.query(
      `UPDATE short_term_memory
       SET event_window = $1, agent_states = $2, pending_questions = $3, updated_at = NOW()
       WHERE session_id = $4`,
      [JSON.stringify(eventWindow), JSON.stringify(agentStates), JSON.stringify(pendingQuestions), sessionId]
    );

    await client.query("COMMIT");
    const resolvesLogValue = validatedResolves
      ? validatedResolves
      : event.resolves
        ? "none (stripped invalid reference)"
        : "none";
    console.log(
      `eventWriter: wrote ${eventId}, type=${event.type}, session=${sessionId}, agent=${agent}, resolves=${resolvesLogValue}`
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
