import { pool } from "../db/pool";
import { getOpenrouterClient } from "../lib/openrouterClient";
import { getMessagesAfter } from "./messagesService";
import { SUMMARIZER_MODEL } from "../config/models";
import type { Agent, ChatMessage } from "../types/shared";

const SUMMARIZATION_THRESHOLD = 20;
const RECENCY_WINDOW_SIZE = 6;

interface ConversationMemoryRow {
  rolling_summary: string;
  last_summarized_message_id: string | null;
}

interface RecentMessage {
  role: "user" | "assistant";
  content: string;
}

function buildSummarizationPrompt(existingSummary: string, chunkMessages: ChatMessage[]): string {
  const existingSummaryText = existingSummary || "None yet — this is the first summarization.";
  const newMessagesText = chunkMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  return `You maintain a rolling summary of an ongoing conversation between
a user and an AI assistant. You will be given the EXISTING SUMMARY
(may be empty if this is the first summarization) and NEW MESSAGES
to fold in. Produce an UPDATED summary that:
- Preserves all names, numbers, commitments, preferences, and facts
  the user has stated
- Preserves the thread of what has been discussed and decided
- Is concise — do not simply concatenate, actually compress
- Reads as a coherent paragraph, not a bullet list of every message

EXISTING SUMMARY:
${existingSummaryText}

NEW MESSAGES TO FOLD IN:
${newMessagesText}

Return ONLY the updated summary text. No preamble, no explanation.`;
}

export async function getAgentConversationContext(
  sessionId: string,
  agent: Agent
): Promise<{ summary: string; recentMessages: RecentMessage[] }> {
  // Defensive: sessions created before this table existed won't have a row.
  await pool.query(
    "INSERT INTO conversation_memory (session_id, agent) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [sessionId, agent]
  );

  const memoryResult = await pool.query<ConversationMemoryRow>(
    "SELECT rolling_summary, last_summarized_message_id FROM conversation_memory WHERE session_id = $1 AND agent = $2",
    [sessionId, agent]
  );
  const memoryRow = memoryResult.rows[0]!;

  let rollingSummary = memoryRow.rolling_summary;
  let uncoveredMessages = await getMessagesAfter(
    sessionId,
    agent,
    memoryRow.last_summarized_message_id
  );

  if (uncoveredMessages.length > SUMMARIZATION_THRESHOLD) {
    const chunkToFold = uncoveredMessages.slice(0, uncoveredMessages.length - RECENCY_WINDOW_SIZE);
    const recencyWindow = uncoveredMessages.slice(uncoveredMessages.length - RECENCY_WINDOW_SIZE);

    try {
      const prompt = buildSummarizationPrompt(rollingSummary, chunkToFold);
      const completion = await getOpenrouterClient().chat.completions.create({
        model: SUMMARIZER_MODEL,
        messages: [{ role: "system", content: prompt }],
        max_tokens: 1024,
      });
      const newSummary = completion.choices[0]?.message?.content?.trim() ?? rollingSummary;
      const lastFoldedMessage = chunkToFold[chunkToFold.length - 1]!;

      await pool.query(
        `UPDATE conversation_memory
         SET rolling_summary = $1, last_summarized_message_id = $2, updated_at = NOW()
         WHERE session_id = $3 AND agent = $4`,
        [newSummary, lastFoldedMessage.id, sessionId, agent]
      );

      console.log(
        `conversation_memory: summarized ${chunkToFold.length} messages for session ${sessionId}, agent ${agent}, new summary length ${newSummary.length}`
      );

      rollingSummary = newSummary;
      uncoveredMessages = recencyWindow;
    } catch (err) {
      console.error(
        `conversation_memory: summarization failed for session ${sessionId}, agent ${agent}`,
        err
      );
      // Fall back: keep the old summary and ALL uncovered messages — no data
      // loss, just skip compression this call and try again next time.
    }
  }

  return {
    summary: rollingSummary,
    recentMessages: uncoveredMessages.map((m) => ({ role: m.role, content: m.content })),
  };
}
