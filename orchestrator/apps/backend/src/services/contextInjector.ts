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

export interface MemoryRows {
  shortTerm: ShortTermMemoryRow | undefined;
  longTerm: LongTermMemoryRow | undefined;
}

// Full injection only — no cursors, no delta. Every call re-fetches the
// complete current short_term_memory and long_term_memory rows for this
// session. Delta injection was deliberately dropped from this project.
//
// Shared by buildEnrichedSystemPrompt below AND by the classifier (via
// agentPipe.ts), which needs the same recentEvents/pendingQuestions/
// settledFacts to build its own prompt — extracted here so the query logic
// isn't duplicated between the two call sites.
export async function fetchMemoryRows(sessionId: string): Promise<MemoryRows> {
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

  return { shortTerm: shortTermResult.rows[0], longTerm: longTermResult.rows[0] };
}

export async function buildEnrichedSystemPrompt(sessionId: string, agent: Agent): Promise<string> {
  const { shortTerm, longTerm } = await fetchMemoryRows(sessionId);

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
    "Do not use emojis in your responses.",
  ].join("\n");

  // ALWAYS present, regardless of what memory exists (even a completely
  // fresh session with no memory at all) — unlike the sections above, this
  // is an instruction to the model, not context data, so it is never
  // conditionally omitted.
  const eventCandidateInstructions = [
    "When your response contains any of the following — a new finding, a",
    "decision with reasoning, a question that needs an answer from another",
    "agent or the user, something blocking progress, a direct contradiction",
    "with something previously established, a concrete artifact you",
    "produced, or a handoff to another agent — append EXACTLY ONE block like",
    "this at the very end of your response, after your normal answer:",
    "",
    "[EVENT_CANDIDATE]",
    "type: FINDING | DECISION | QUESTION | BLOCKER | CONTRADICTION | OUTPUT | HANDOFF",
    "summary: one sentence describing what happened",
    "confidence: high | medium | low",
    "resolves: evt_XXXXXXXX",
    "[/EVENT_CANDIDATE]",
    "",
    "Only include the 'resolves' line if your response directly answers one",
    "of the open questions listed above (use its exact event ID). Omit the",
    "'resolves' line entirely otherwise — do not write 'resolves: none' or",
    "leave it blank, just don't include that line at all.",
    "",
    "If your response is a normal reply that doesn't represent any of the",
    "above (a clarifying question back to the user, small talk, an",
    "acknowledgment, routine conversation), do NOT include this block at",
    "all. Do not force one when there is nothing meaningful to report.",
  ].join("\n");

  const blocks = [
    `You are ${AGENT_LABELS[agent]}, operating inside a multi-agent orchestration system.`,
    centralNodeBlock,
    roleSection,
    eventCandidateInstructions,
  ].filter((block) => block.length > 0);

  return blocks.join("\n\n");
}
