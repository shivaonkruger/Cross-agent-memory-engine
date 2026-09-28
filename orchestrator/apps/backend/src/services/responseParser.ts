export interface EventCandidate {
  type: string;
  summary: string;
  confidence: string;
  resolves: string | null;
  // Per-type required fields (see eventWriter.ts's REQUIRED_FIELDS) —
  // optional here since only CONTRADICTION/BLOCKER use them, and nothing
  // upstream (self-annotation parsing, the classifier's JSON schema)
  // populates them yet. A direct writeEvent() caller (e.g. a test) can set
  // them; the real agent/classifier pipeline does not, for now.
  claim_a?: string;
  claim_b?: string;
  what_is_blocked?: string;
  what_resolves_it?: string;
}

export interface ParsedAgentResponse {
  cleanText: string;
  candidate: EventCandidate | null;
}

const CANDIDATE_BLOCK_RE = /\[EVENT_CANDIDATE\]([\s\S]*?)\[\/EVENT_CANDIDATE\]/;

/**
 * Splits an agent's raw response into the prose shown to the user and an
 * optional self-annotated event candidate. Pure/synchronous — no DB access,
 * no OpenRouter calls.
 */
export function parseAgentResponse(rawResponse: string): ParsedAgentResponse {
  const match = rawResponse.match(CANDIDATE_BLOCK_RE);

  if (!match) {
    console.log("responseParser: no candidate");
    return { cleanText: rawResponse.trim(), candidate: null };
  }

  const blockContent = match[1]!;
  const cleanText = (rawResponse.slice(0, match.index) + rawResponse.slice(match.index! + match[0].length)).trim();

  const fields: Record<string, string> = {};
  for (const line of blockContent.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();
    if (key) fields[key] = value;
  }

  const type = fields.type;
  const summary = fields.summary;

  if (!type || !summary) {
    console.log("responseParser: malformed candidate block, discarded");
    return { cleanText, candidate: null };
  }

  const candidate: EventCandidate = {
    type: type.toUpperCase(),
    summary,
    confidence: (fields.confidence ?? "").toLowerCase(),
    resolves: fields.resolves ? fields.resolves : null,
  };

  console.log(`responseParser: candidate found, type=${candidate.type}`);
  return { cleanText, candidate };
}
