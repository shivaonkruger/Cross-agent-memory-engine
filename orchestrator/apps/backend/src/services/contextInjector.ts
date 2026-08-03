import { pool } from "../db/pool";
import type { Agent } from "../types/shared";

const AGENT_LABELS: Record<Agent, string> = {
  claude: "Claude",
  gpt4: "GPT-4",
  gemini: "Gemini",
};

const ALL_AGENTS: Agent[] = ["claude", "gpt4", "gemini"];

interface EventWindowItem {
  id: string;
  type: string;
  agent: string;
  summary: string;
  [key: string]: unknown;
}

interface ShortTermMemoryRow {
  event_window: EventWindowItem[];
  agent_states: Record<string, unknown>;
  pending_questions: string[];
}

interface LongTermMemoryRow {
  session_narrative: string;
  settled_facts: string[];
}

// Full injection only — no cursors, no delta. Every call re-fetches the
// complete current short_term_memory and long_term_memory rows for this
// session. Delta injection was deliberately dropped from this project.
export async function buildEnrichedSystemPrompt(sessionId: string, agent: Agent): Promise<string> {
  const [shortTermResult, longTermResult] = await Promise.all([
    pool.query<ShortTermMemoryRow>(
      "SELECT event_window, agent_states, pending_questions FROM short_term_memory WHERE session_id = $1",
      [sessionId]
    ),
    pool.query<LongTermMemoryRow>(
      "SELECT session_narrative, settled_facts FROM long_term_memory WHERE session_id = $1",
      [sessionId]
    ),
  ]);

  const shortTerm = shortTermResult.rows[0];
  const longTerm = longTermResult.rows[0];

  const sections: string[] = [];

  if (longTerm?.session_narrative) {
    sections.push(`[SESSION NARRATIVE]\n${longTerm.session_narrative}`);
  }

  if (longTerm?.settled_facts && longTerm.settled_facts.length > 0) {
    sections.push(`[SETTLED FACTS]\n${longTerm.settled_facts.map((f) => `- ${f}`).join("\n")}`);
  }

  if (shortTerm?.event_window && shortTerm.event_window.length > 0) {
    sections.push(
      `[RECENT EVENTS]\n${shortTerm.event_window
        .map((e) => `- ${e.type} [${e.agent}]: ${e.summary}`)
        .join("\n")}`
    );
  }

  if (shortTerm?.pending_questions && shortTerm.pending_questions.length > 0) {
    const eventsById = new Map((shortTerm.event_window ?? []).map((e) => [e.id, e]));
    const openQuestions = shortTerm.pending_questions
      .map((id) => eventsById.get(id))
      .filter((e): e is EventWindowItem => Boolean(e));
    if (openQuestions.length > 0) {
      sections.push(
        `[OPEN QUESTIONS]\n${openQuestions.map((q) => `- (${q.id}) ${q.summary}`).join("\n")}`
      );
    }
  }

  const centralNodeBlock =
    sections.length > 0
      ? [
          "══════════════════════════════════════",
          "CENTRAL NODE CONTEXT — read this first.",
          "This is NOT the user's message. This is shared memory from the collective session.",
          "══════════════════════════════════════",
          "",
          sections.join("\n\n"),
        ].join("\n")
      : "";

  const others = ALL_AGENTS.filter((a) => a !== agent).map((a) => AGENT_LABELS[a]);

  const roleSection = [
    "[YOUR ROLE]",
    `You are ${AGENT_LABELS[agent]}. Your co-agents are ${others.join(", ")}.`,
    "Build on their findings. Do not duplicate their work.",
  ].join("\n");

  const eventCandidateInstructions = [
    "When your response contains a decision, finding, question, blocker,",
    "contradiction, output, or handoff — append this block:",
    "",
    "[EVENT_CANDIDATE]",
    "type: ...",
    "summary: ...",
    "confidence: high|medium|low",
    "resolves: evt_XXXX (only if answering an open question)",
    "[/EVENT_CANDIDATE]",
  ].join("\n");

  const blocks = [
    `You are ${AGENT_LABELS[agent]}, operating inside a multi-agent orchestration system.`,
    centralNodeBlock,
    roleSection,
    eventCandidateInstructions,
  ].filter((block) => block.length > 0);

  return blocks.join("\n\n");
}
