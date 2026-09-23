import { getOpenrouterClient } from "../lib/openrouterClient";
import { CLASSIFIER_MODEL } from "../config/models";
import { withRetry, isRetryableOpenRouterError } from "../utils/retry";
import type { EventCandidate } from "./responseParser";

export interface SessionContext {
  recentEvents: unknown[];
  pendingQuestions: string[];
  settledFacts: string[];
}

export interface ClassifyEventInput {
  agentName: string;
  candidate: EventCandidate | null;
  agentResponseText: string;
  sessionContext: SessionContext;
}

export interface ClassifyEventResult {
  emit: boolean;
  event: EventCandidate | null;
  rejectionReason: string | null;
}

interface ClassifierRawOutput {
  emit?: boolean;
  type?: string | null;
  summary?: string | null;
  confidence?: string | null;
  resolves?: string | null;
  rejection_reason?: string | null;
}

const EVENT_TYPES = ["FINDING", "DECISION", "QUESTION", "BLOCKER", "CONTRADICTION", "OUTPUT", "HANDOFF"];

function buildClassifierPrompt(input: ClassifyEventInput): string {
  const { agentName, candidate, agentResponseText, sessionContext } = input;

  const candidateSection = candidate
    ? `The agent self-annotated this candidate event:\n${JSON.stringify(candidate, null, 2)}`
    : "The agent did NOT self-annotate a candidate event. You must passively scan its response below for event-worthy signal.";

  const recentEventsText =
    sessionContext.recentEvents.length > 0
      ? JSON.stringify(sessionContext.recentEvents, null, 2)
      : "(none)";
  const pendingQuestionsText =
    sessionContext.pendingQuestions.length > 0 ? sessionContext.pendingQuestions.join(", ") : "(none)";
  const settledFactsText =
    sessionContext.settledFacts.length > 0 ? sessionContext.settledFacts.join("\n- ") : "(none)";

  return `You are the event classifier for a multi-agent orchestration system.
Agent "${agentName}" just produced a response. Your job is to decide whether
this response contains something worth writing to permanent shared memory as
a structured event, and if so, shape it correctly.

EVENT TYPES: ${EVENT_TYPES.join(", ")}

CURRENT SESSION CONTEXT:
[RECENT EVENTS]
${recentEventsText}

[PENDING QUESTIONS] (event ids still awaiting an answer)
${pendingQuestionsText}

[SETTLED FACTS]
- ${settledFactsText}

CANDIDATE:
${candidateSection}

FULL AGENT RESPONSE TEXT:
${agentResponseText}

Perform these checks IN ORDER:
1. Resolution check — does this response directly answer any of the pending
   questions above? If so, set "resolves" to that question's exact event id.
2. Novelty check — is this genuinely new information, not already present in
   recentEvents or settledFacts? If it's a restatement of something already
   known, do not emit.
3. If no candidate was given, passively scan the full response text above for
   event-worthy signal (the same criteria the agent itself was instructed to
   use) before deciding not to emit.

Respond with ONLY a JSON object matching this exact shape — no markdown
fences, no preamble, no explanation:
{"emit": boolean, "type": string | null, "summary": string | null, "confidence": string | null, "resolves": string | null, "rejection_reason": string | null}`;
}

function stripMarkdownFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return fenced ? fenced[1]! : text;
}

export async function classifyEvent(input: ClassifyEventInput): Promise<ClassifyEventResult> {
  const prompt = buildClassifierPrompt(input);

  let rawContent: string;
  try {
    const completion = await withRetry(
      async () => {
        try {
          return await getOpenrouterClient().chat.completions.create({
            model: CLASSIFIER_MODEL,
            messages: [{ role: "system", content: prompt }],
            max_tokens: 512,
            response_format: { type: "json_object" },
          });
        } catch (err) {
          // Some free-tier providers reject response_format outright — retry
          // once without it rather than treating that as a hard failure.
          console.log("classifier: response_format json_object rejected, retrying without it");
          return await getOpenrouterClient().chat.completions.create({
            model: CLASSIFIER_MODEL,
            messages: [{ role: "system", content: prompt }],
            max_tokens: 512,
          });
        }
      },
      { retries: 2, delayMs: 1000, shouldRetry: isRetryableOpenRouterError }
    );
    rawContent = completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    console.error("classifier: OpenRouter call failed", err);
    console.log("classifier: emit=false, type=n/a, reason=classifier_unavailable");
    return { emit: false, event: null, rejectionReason: "classifier_unavailable" };
  }

  let parsed: ClassifierRawOutput;
  try {
    parsed = JSON.parse(stripMarkdownFences(rawContent).trim());
  } catch (err) {
    console.error("classifier: failed to parse response as JSON, raw content:", rawContent);
    console.log("classifier: emit=false, type=n/a, reason=classifier_parse_failure");
    return { emit: false, event: null, rejectionReason: "classifier_parse_failure" };
  }

  if (!parsed.emit) {
    const reason = parsed.rejection_reason ?? "not_event_worthy";
    console.log(`classifier: emit=false, type=n/a, reason=${reason}`);
    return { emit: false, event: null, rejectionReason: reason };
  }

  if (!parsed.type || !parsed.summary) {
    console.log("classifier: emit=false, type=n/a, reason=classifier_incomplete_output");
    return { emit: false, event: null, rejectionReason: "classifier_incomplete_output" };
  }

  const event: EventCandidate = {
    type: parsed.type.toUpperCase(),
    summary: parsed.summary,
    confidence: (parsed.confidence ?? "medium").toLowerCase(),
    resolves: parsed.resolves ?? null,
  };

  console.log(`classifier: emit=true, type=${event.type}, reason=n/a`);
  return { emit: true, event, rejectionReason: null };
}
