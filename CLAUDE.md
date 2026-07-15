# Orchestrator — Claude Code Context File
# Read this fully before writing any code.

---

## ⚠️ This document is a living plan, not a fixed spec — read this every time

Everything below reflects the architecture and decisions as of right now,
today. It is NOT final, it is NOT a contract, and it should NOT be treated
as ground truth just because it's written down in a file. This project is
being designed and built iteratively by Shiva, on his own timeline, in
whatever order makes sense as his understanding develops. There is no
fixed roadmap. What's described here WILL keep changing — sections may
be rewritten, deferred, scoped down, scoped back up, or dropped entirely
between one session and the next.

Concretely this means:
- Some sections below (e.g. the event system, classifier, compression
  engine) describe a FULL target architecture that may be far ahead of
  what's actually built in the codebase right now. Always verify against
  the real code — what files exist, what routes are registered, what
  tables are actually migrated — rather than assuming this file is
  current reality.
- The project may currently be running a deliberately scoped-down MVP
  version of what's described here (e.g. raw message persistence instead
  of the full event log). That is not a contradiction to fix — it's an
  intentional, temporary simplification. Don't "correct" simplified code
  to match the full architecture unless explicitly asked to.
- Tables, fields, flows, and even entire mechanisms described here can be
  renamed, restructured, or removed in a future session — do not treat
  any single section as permanent just because it's written down today.
- If something in the actual codebase disagrees with this file, that is
  a signal to run /project:sync and reconcile with Shiva — never a signal
  to silently trust whichever one looks more "official."
- Do not assume a past decision here is still current if it's been more
  than a few sessions — always check with Shiva first, especially before
  making any structural change based on something you read here.

Bottom line: keep an eye on this file changing over time, treat it as
the best available snapshot of intent right now, and stay ready for it
to look different tomorrow.

---

## What this project is

A cross-LLM multi-agent orchestration tool. Multiple LLM providers (Claude,
GPT-4, Gemini) run simultaneously inside a shared operator UI. A central node
maintains shared memory across all agents. Agents communicate via a structured
event schema — not raw message history.

This is being built as a future product. Every line of code must be readable,
logged, and debuggable. No magic, no shortcuts that hide complexity.

---

## Architecture in one paragraph

The user sends a message to an agent panel in the UI. The backend intercepts it,
fetches a context delta from the central node (only new events since this agent's
last cursor position), builds an enriched system prompt, calls OpenRouter, parses
the response, runs it through the event classifier, writes any valid event to the
Postgres event log, updates the agent's cursor, and returns the response text to
the UI. The compression engine runs asynchronously when the uncompressed event
count hits 15 — it routes events through tier logic into long-term memory.
WebSockets push live central node updates to the UI.

---

## Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vite + React + TypeScript + Tailwind + react-router-dom | Faster dev loop than Next.js App Router for a scoped-down SPA phase; explicit client routing |
| Backend | Node.js + Express + TypeScript | Simplest routing for this phase; schema validation deferred (traded away Fastify's built-in validation deliberately) |
| WebSockets | ws (npm) | Simple, no socket.io overhead |
| Database | Postgres + pg (pool) | MVCC, JSONB, reliable |
| Providers | OpenRouter | Single endpoint, OpenAI-compatible SDK, all models |
| Classifier model | gpt-4o-mini via OpenRouter | Fast, cheap, structured output |
| Deployment | Docker Compose | Node app + Postgres |

---

## Project structure

```
/orchestrator
  /apps
    /backend
      /src
        /config         ← env vars, model strings, constants
        /db             ← pg Pool instance, migration runner
          /migrations   ← numbered SQL files (001_sessions.sql, etc.)
        /routes         ← HTTP route handlers (thin — call services only)
        /services       ← all business logic lives here
          sessionsService.ts      ← DB reads/writes for sessions
          messagesService.ts      ← DB reads/writes for raw per-agent messages
          agentPipe.ts            ← per-agent OpenRouter pipeline
          centralNodeService.ts   ← (future, not yet built) DB reads/writes for central node
          classifier.ts           ← (future, not yet built) event classifier (pure function)
          compressionEngine.ts    ← (future, not yet built) async tier-based compression
          wsManager.ts            ← (future, not yet built) WebSocket connection management
      index.ts          ← Express server entry, starts everything
      package.json
    /frontend
      /src
        /routes         ← page-level route components (react-router-dom)
        /components     ← UI components
        /api            ← typed fetch client
        /types          ← shared type definitions (manually kept in sync with backend)
        main.tsx
        App.tsx
        vite.config.ts
      360labs-DESIGN.md ← design tokens/system reference
  docker-compose.yml    ← Postgres only — backend is not dockerized, runs via `npm run dev`
  .env
  .env.example
  CLAUDE.md           ← this file
  README.md
```

---

## Postgres schema (all tables)

### sessions
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
created_at  TIMESTAMPTZ DEFAULT NOW()
deleted_at  TIMESTAMPTZ
```

### events
```sql
id                TEXT PRIMARY KEY        -- format: evt_XXXX
session_id        UUID REFERENCES sessions(id)
type              TEXT NOT NULL           -- FINDING|DECISION|QUESTION|BLOCKER|CONTRADICTION|OUTPUT|HANDOFF
agent             TEXT NOT NULL           -- claude|gpt4|gemini
summary           TEXT NOT NULL
payload           JSONB NOT NULL          -- type-specific fields
confidence        TEXT                    -- high|medium|low
resolves          TEXT REFERENCES events(id)
resolved_by       TEXT REFERENCES events(id)
requires_response BOOLEAN DEFAULT false
preserve          BOOLEAN DEFAULT false
tier              INTEGER                 -- 1|2|3, set by compression engine
compressed        BOOLEAN DEFAULT false
deleted_at        TIMESTAMPTZ
created_at        TIMESTAMPTZ DEFAULT NOW()
```

### agent_cursors
```sql
session_id       UUID REFERENCES sessions(id)
agent            TEXT                    -- claude|gpt4|gemini
last_event_id    TEXT REFERENCES events(id)
last_lt_version  INTEGER DEFAULT 0
updated_at       TIMESTAMPTZ DEFAULT NOW()
PRIMARY KEY (session_id, agent)
```

### messages
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
session_id  UUID NOT NULL REFERENCES sessions(id)
agent       TEXT NOT NULL           -- claude|gpt4|gemini
role        TEXT NOT NULL           -- user|assistant
content     TEXT NOT NULL
created_at  TIMESTAMPTZ DEFAULT NOW()
```

Index: `(session_id, agent, created_at)` — used to fetch one agent's
ordered conversation history for a session quickly.

**Purpose**: stores the full raw back-and-forth per agent per session,
for rendering the chat UI and for reopening a session with complete
history intact. This is separate from and independent of the `events`
table — `events` holds structured signals extracted by the classifier
for cross-agent reasoning, `messages` holds the literal text exchanged
with each agent. Both exist and serve different purposes; neither
replaces the other. When building the context injector, the OpenRouter
call for a given agent should be seeded with that agent's own message
history from this table (last N messages), not with other agents'
messages — cross-agent context comes from the event system, not from
reading another agent's raw thread.

### short_term_memory
```sql
session_id        UUID REFERENCES sessions(id) PRIMARY KEY
event_window      JSONB DEFAULT '[]'     -- last 20 event objects (denormalized)
agent_states      JSONB DEFAULT '{}'     -- per-agent state snapshots
pending_questions JSONB DEFAULT '[]'     -- open QUESTION event IDs
updated_at        TIMESTAMPTZ DEFAULT NOW()
```

### long_term_memory
```sql
session_id              UUID REFERENCES sessions(id) PRIMARY KEY
version                 INTEGER DEFAULT 0
session_narrative       TEXT DEFAULT ''
settled_facts           JSONB DEFAULT '[]'
decision_log            JSONB DEFAULT '[]'      -- verbatim DECISION events
contradiction_registry  JSONB DEFAULT '[]'
entity_map              JSONB DEFAULT '{}'
updated_at              TIMESTAMPTZ DEFAULT NOW()
```

---

## Event types and their payload contracts

### FINDING
```json
{ "summary": "", "detail": "", "domain": "", "confidence": "", "contradicts": null }
```

### DECISION
```json
{
  "summary": "", "chosen": "", "alternatives_considered": [],
  "reasoning": "", "reversible": true, "decided_by": "", "triggered_by": null
}
```

### QUESTION
```json
{ "summary": "", "directed_at": "", "requires_response": true, "urgency": "" }
```

### BLOCKER
```json
{ "summary": "", "what_is_blocked": "", "blocked_agent": "", "what_resolves_it": "", "resolved": false }
```

### CONTRADICTION
```json
{
  "summary": "",
  "claim_a": { "event_id": "", "summary": "" },
  "claim_b": { "event_id": "", "summary": "" },
  "resolved": false
}
```

### OUTPUT
```json
{ "summary": "", "artifact_type": "", "artifact_ref": "", "supersedes": null }
```

### HANDOFF
```json
{ "summary": "", "from_agent": "", "to_agent": "", "what_is_being_handed": "", "context_refs": [] }
```

---

## Compression tier logic

| Tier | Event types | Action |
|---|---|---|
| 1 | DECISION, CONTRADICTION, unresolved BLOCKER | Preserve verbatim in long-term |
| 2 | FINDING, OUTPUT, HANDOFF | Summarize into long-term slots |
| 3 | Answered QUESTION, resolved BLOCKER | Discard |

Compression triggers when uncompressed event count for a session >= 15.
Events are NEVER deleted from the events table — only marked compressed = true.
All long-term memory updates in one compression pass must be wrapped in a Postgres transaction.

---

## Context injection format (system prompt structure)

```
You are {agent}, operating inside a multi-agent orchestration system.

══════════════════════════════════════
CENTRAL NODE CONTEXT — read this first.
This is NOT the user's message. This is shared memory from the collective session.
══════════════════════════════════════

[SESSION NARRATIVE]
{long_term.session_narrative}

[SETTLED FACTS]
{long_term.settled_facts as bullet list}

[RECENT EVENTS]
{short_term_delta formatted as "- TYPE [agent]: summary"}

[OPEN QUESTIONS DIRECTED AT YOU]
{pending questions with event IDs, or "None."}

[YOUR ROLE]
You are {agent}. Your co-agents are {others}.
Build on their findings. Do not duplicate their work.

When your response contains a decision, finding, question, blocker,
contradiction, output, or handoff — append this block:

[EVENT_CANDIDATE]
type: ...
summary: ...
confidence: high|medium|low
resolves: evt_XXXX (only if answering an open question)
[/EVENT_CANDIDATE]

══════════════════════════════════════
USER QUERY — respond to this
══════════════════════════════════════
```

---

## Delta injection (cursor system)

Each agent has a cursor: { last_event_id, last_lt_version }
Context fetch returns ONLY events after last_event_id.
Long-term is only included in the response if lt version > last_lt_version.
Cursor is updated atomically after every successful injection.
Full re-injection happens when: agent toggles back on (cursor stale) OR
context window is near token limit (re-grounding).

---

## OpenRouter model strings

```javascript
const MODELS = {
  claude: "anthropic/claude-sonnet-5",
  gpt4:   "openai/gpt-4o",
  gemini: "google/gemini-2.5-pro"
}
```

Note: these slugs were updated from the originally-documented ones
(claude-3-5-sonnet, gemini-1.5-pro) after both were confirmed removed from
OpenRouter's live model catalog. Re-verify against
`https://openrouter.ai/api/v1/models` if calls start 404ing again — OpenRouter
retires older model slugs over time.

Classifier always uses: "openai/gpt-4o-mini"
All calls use the openai npm SDK with baseURL: "https://openrouter.ai/api/v1"

---

## Logging rules (enforced from Phase 10, referenced from Phase 1)

Use pino. Every log line is a JSON object:
```json
{ "level": "", "timestamp": "", "session_id": "", "agent": "", "step": "", "message": "", "duration_ms": 0 }
```

Every pipeline step logs start, end (with duration_ms), and fail (with error).
Pretty-printed in development, raw JSON in production.
Every HTTP response includes a request_id header for log tracing.

---

## Development approach

There is no fixed phase plan. This project is being built iteratively —
Shiva decides what to build next, in what order, based on what makes
sense as understanding develops. Do not assume a "Phase N" exists or
infer one from git history — always check the actual codebase state
directly (what files exist, what routes are registered, what tables
are migrated) rather than relying on any prior phase list.

If you need to know what's currently built, look at the code — don't
trust a checklist, because none is being maintained anymore.

---

## Hard rules for code generation

1. No raw SQL in route files — all DB logic in service files
2. No single Postgres client — always use the pg Pool
3. No hardcoded API keys — always process.env
4. Every async function has try/catch — no unhandled promise rejections
5. Every event write + short_term update in a single Postgres transaction
6. Events are never deleted from the DB — only soft-deleted or marked compressed
7. The classifier is a pure function — callable without HTTP, testable in isolation
8. agentPipe.js logs every step with step number, input summary, and output summary
9. WebSocket broadcast never throws — if no subscribers, log and return
10. OpenRouter calls retry up to 2 times on 429 or network error with 1s delay