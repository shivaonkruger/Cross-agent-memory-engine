import { nanoid } from "nanoid";
import { pool } from "../db/pool";
import { getEmbedding, toVectorLiteral } from "../lib/embeddings";
import type { EventCandidate } from "./responseParser";

const EVENT_WINDOW_CAP = 20;


const CORROBORATION_THRESHOLD = 0.8;

// Second validation layer, on top of the type/summary check the classifier
// already enforces before an event ever reaches here. Only these two types
// carry extra required fields right now; a type not listed here has no
// extra requirements and skips this check entirely.
const REQUIRED_FIELDS: Record<string, string[]> = {
  CONTRADICTION: ["claim_a", "claim_b"],
  BLOCKER: ["what_is_blocked", "what_resolves_it"],
};

interface CorroborationCandidate {
  id: string;
  agent: string;
  summary: string;
  similarity: number;
}

interface ShortTermMemoryRow {
  event_window: Array<Record<string, unknown>>;
  agent_states: Record<string, unknown>;
  pending_questions: string[];
}

export async function writeEvent(
  sessionId: string,
  agent: string,
  event: EventCandidate
): Promise<{ eventId: string } | null> {
  const eventId = `evt_${nanoid(8)}`;
  const requiresResponse = event.type === "QUESTION";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");


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
    const payload: Record<string, unknown> = { summary: event.summary, confidence: event.confidence || null };
    if (event.claim_a !== undefined) payload.claim_a = event.claim_a;
    if (event.claim_b !== undefined) payload.claim_b = event.claim_b;
    if (event.what_is_blocked !== undefined) payload.what_is_blocked = event.what_is_blocked;
    if (event.what_resolves_it !== undefined) payload.what_resolves_it = event.what_resolves_it;

    const requiredFields = REQUIRED_FIELDS[event.type];
    if (requiredFields) {
      const invalidFields: string[] = [];
      for (const field of requiredFields) {
        const value = payload[field];
        if (typeof value !== "string" || !value.trim()) {
          invalidFields.push(field);
        }
      }

      // claim_a/claim_b aren't just required to be non-empty — they must
      // reference real events in this session, not any arbitrary string.
      if (event.type === "CONTRADICTION") {
        for (const field of ["claim_a", "claim_b"]) {
          if (invalidFields.includes(field)) continue;
          const targetId = payload[field] as string;
          const targetCheck = await client.query(
            "SELECT 1 FROM events WHERE id = $1 AND session_id = $2 AND deleted_at IS NULL",
            [targetId, sessionId]
          );
          if (targetCheck.rows.length === 0) {
            invalidFields.push(field);
          }
        }
      }

      if (invalidFields.length > 0) {
        console.warn(
          `eventWriter: schema_validation_failed — type=${event.type}, invalid/missing field(s): ${invalidFields.join(", ")}`
        );
        await client.query("ROLLBACK");
        return null;
      }
    }

    const embedding = await getEmbedding(event.summary);
    const vectorLiteral = toVectorLiteral(embedding);

    const candidatesResult = await client.query<CorroborationCandidate>(
      `SELECT id, agent, summary, 1 - (embedding <=> $1::vector) AS similarity
       FROM events
       WHERE session_id = $2
         AND agent != $3
         AND embedding IS NOT NULL
         AND deleted_at IS NULL
       ORDER BY embedding <=> $1::vector`,
      [vectorLiteral, sessionId, agent]
    );

    const matchedIds: string[] = [];
    for (const candidate of candidatesResult.rows) {

      console.log(
        `corroboration-tuning: new="${event.summary}" (agent=${agent}) vs ` +
          `existing="${candidate.summary}" (id=${candidate.id}, agent=${candidate.agent}) ` +
          `similarity=${candidate.similarity.toFixed(4)}`
      );

      if (candidate.similarity > CORROBORATION_THRESHOLD) {
        matchedIds.push(candidate.id);
      }
    }

    await client.query(
      `INSERT INTO events (id, session_id, type, agent, summary, confidence, resolves, requires_response, payload, embedding, corroborated_by, corroboration_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11, $12)`,
      [
        eventId,
        sessionId,
        event.type,
        agent,
        event.summary,
        event.confidence || null,
        validatedResolves,
        requiresResponse,
        JSON.stringify(payload),
        vectorLiteral,
        matchedIds,
        matchedIds.length,
      ]
    );

    if (validatedResolves) {
      await client.query("UPDATE events SET resolved_by = $1 WHERE id = $2", [eventId, validatedResolves]);
    }

    for (const matchedId of matchedIds) {
      await client.query(
        `UPDATE events
         SET corroborated_by = array_append(corroborated_by, $1),
             corroboration_count = corroboration_count + 1
         WHERE id = $2`,
        [eventId, matchedId]
      );
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
