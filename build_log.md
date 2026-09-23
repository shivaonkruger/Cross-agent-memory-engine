# Build Log — Orchestrator

This file is a running, append-only record of what has actually been
built and verified in this project, in the order it was built. It is
NOT the architecture doc (see context.md for product intent) — this is
a historical log: what exists, why it was built that way, and what was
deliberately left unfinished at each step.

Each phase entry below reflects something that was BUILT AND VERIFIED,
not planned or discussed. Do not add a phase for something still under
discussion or mid-build — see append-phase-instructions.md for the rule
governing when and how new entries get added here.

---

## Phase 1 — Project skeleton (Turborepo + backend foundation)

**Goal**: get a working monorepo with a backend that can talk to Postgres.

**What was built**:
- Turborepo monorepo scaffolded, unused default apps (docs, web) and
  packages (ui) removed
- apps/backend created: Express + TypeScript
- tsconfig.json configured — target esnext, module nodenext, rootDir
  src, outDir dist
- nodemon + ts-node wired for dev (nodemon watches src, runs
  ts-node src/index.ts directly — no compile step in dev)
- Postgres running via Docker Compose (postgres:16 image), with a
  named volume so data survives container restarts
- .env / .env.example created with DATABASE_URL, PORT, NODE_ENV

**Key decisions**:
- No ORM — raw SQL via the `pg` package throughout
- npm workspaces + Turborepo, no Nx

**Verified**: `docker compose up -d` starts Postgres cleanly, backend
connects, `/health` (added shortly after) confirms DB connectivity.

**Deferred at this stage**: no tables yet, no routes, no frontend.

---

## Phase 2 — Core schema: sessions, short_term_memory, long_term_memory

**Goal**: create the foundational tables the rest of the system sits on.

**What was built**:
- Migration file(s) under apps/backend/src/db/migrations/, run
  automatically on server start
- `sessions` table: id (uuid), created_at, deleted_at
- `short_term_memory` table (one row per session): event_window
  (jsonb array), agent_states (jsonb object), pending_questions
  (jsonb array), updated_at
- `long_term_memory` table (one row per session): version,
  session_narrative (text), settled_facts (jsonb array), decision_log
  (jsonb array), contradiction_registry (jsonb array), entity_map
  (jsonb object), updated_at

**Key decisions**:
- Both memory tables are one-to-one with sessions (enforced by using
  session_id as the primary key on each)
- ERD produced and confirmed against this shape

**Verified**: tables confirmed via psql; ERD matched actual schema.

**Deferred at this stage**: no relational `events` table yet — event
data only exists as JSON inside short_term_memory.event_window.
No write-path exists yet — nothing populates these tables except
manual seeding (added in Phase 4).

---

## Phase 3 — Frontend scaffold + single-agent OpenRouter wire

**Goal**: the bare end-to-end wire — user types a message to one agent,
gets a real response, sees it in a UI, and it persists.

**What was built**:
- `messages` table added: id, session_id, agent, role (user|assistant),
  content, created_at — indexed on (session_id, agent, created_at)
- `sendAgentMessage(sessionId, agent, message)` in agentPipe.ts:
  inserts user message → fetches that agent's own message history →
  calls OpenRouter (openai SDK, baseURL pointed at OpenRouter) →
  inserts assistant response → returns response text
- Routes: POST /api/agents/message, POST /api/sessions,
  GET /api/sessions, GET /api/sessions/:sessionId/messages
- Shared TypeScript types (Session, ChatMessage, request/response
  shapes) — duplicated between backend and frontend for now (no shared
  workspace package yet)
- Frontend: apps/frontend scaffolded with Vite + React + TypeScript +
  Tailwind, react-router-dom added
- Two routes: "/" (session list, create-new-session) and
  "/session/:sessionId" (three independent chat panels — Claude, GPT-4,
  Gemini — each with its own input, history, and pending state)
- A DESIGN.md placed in apps/frontend governs visual/layout decisions

**Key decisions**:
- messages table is explicitly NOT a replacement for the future event
  system — it's the raw chat thread for UI rendering only
- Single-agent-at-a-time for now — broadcast-to-all-three explicitly
  deferred
- Route naming: `/session/:sessionId`, not `/chat-<id>`, to stay
  consistent with the `sessions` table and API naming throughout

**Verified**: full manual flow tested — create session, send message to
Claude panel via curl and via UI, response persists, reload restores
history, GPT-4/Gemini panels work independently.

**Deferred at this stage**: no shared context between agents yet (each
panel is fully isolated), no memory injection at all yet.

---

## Phase 4 — Context injector (central node read-path, full injection)

**Goal**: get shared cross-agent memory into the system prompt, using
hand-seeded mock data (no write-path / classifier yet).

**What was built**:
- Session creation now also creates default short_term_memory and
  long_term_memory rows in the same transaction (previously these
  tables existed but nothing populated them per-session)
- `buildEnrichedSystemPrompt(sessionId, agent)` in contextInjector.ts:
  fetches short_term_memory + long_term_memory in FULL every call,
  builds the system prompt with CONDITIONAL sections — any section
  with no data (empty narrative, empty settled_facts, empty
  event_window, empty pending_questions) is fully omitted, never shown
  as an empty placeholder header
- Wired directly into sendAgentMessage — every call through
  POST /api/agents/message now includes this context automatically
- A temporary seed script (later deleted) populated realistic mock
  data into short_term_memory and long_term_memory for one specific
  test session: `dbc5d842-62aa-4fac-b2df-9486285577f4`

**Key decisions (major)**:
- Delta injection (per-agent cursors, incremental context) was
  evaluated and explicitly, PERMANENTLY dropped. Full injection every
  call is the intended long-term strategy, not a stepping stone. Do
  not reintroduce cursor-based tracking without an explicit new
  decision to do so.
- This context is additive to (not a replacement for) the messages
  table logic — central node context lives in the `system` message,
  agent's own conversation history lives in the `messages` array of
  the OpenRouter payload

**Verified**: seeded session's system prompt correctly included
narrative/facts/events/questions; a fresh session with no seeded data
produced a prompt with those sections fully absent (not empty); a real
question asked against the seeded session ("what did we decide about
the schema?") got an answer reflecting the mock decision, proving the
injected context actually reached the model.

**Deferred at this stage**: nothing writes real events into these
tables yet — still 100% hand-seeded mock data. No classifier, no
response parsing, no events table.

---

## Phase 5 — Recursive per-agent conversation memory

**Goal**: stop feeding an agent's full raw message history into every
call (unbounded token growth) — replace with a bounded, recursively
summarized approach.

**What was built**:
- `conversation_memory` table: one row per (session_id, agent) —
  rolling_summary (text), last_summarized_message_id (references
  messages), updated_at
- `getAgentConversationContext(sessionId, agent)` in
  conversationMemory.ts: fetches uncovered messages (after
  last_summarized_message_id), and if uncovered count exceeds a
  threshold (20), folds everything except the last 6 into an updated
  rolling summary via a cheap OpenRouter call, storing the new summary
  and advancing last_summarized_message_id — the most recent 6 stay
  raw as a "recency window"
- Wired into sendAgentMessage: the OpenRouter payload's `messages`
  array now uses the recency window (not full history), with the
  rolling summary appended as a section inside the system prompt
- Failure handling: if the summarization call fails, falls back to the
  old summary unchanged and returns ALL uncovered messages rather than
  losing data or throwing

**Key decisions**:
- This is entirely separate from and does not change central node
  context injection (Phase 4) — this only changes how an agent's OWN
  conversational continuity with the user is fed in, not cross-agent
  shared memory
- Session creation now also creates one conversation_memory row per
  agent, alongside the existing short_term_memory / long_term_memory
  rows

**Verified**: continuity confirmed within the recency window (a stated
name/preference recalled two messages later); summarization confirmed
to trigger past the 20-message threshold, with the rolling summary in
Postgres correctly preserving a fact (a stated deadline) that had
already scrolled out of the raw recency window; a fresh session
confirmed to have zero memory bleed from other sessions.

**Deferred at this stage**: none directly — this closed out the
per-agent memory gap. Cross-agent event writing is still the open gap
(see Phase 7 onward).

---

## Phase 6 — Swap to free OpenRouter models (temporary, cost-driven)

**Goal**: keep testing the pipeline after paid OpenRouter credits ran
out, without changing any pipeline logic.

**What was built**:
- apps/backend/src/config/models.ts: a single source-of-truth config
  with an ACTIVE_MODEL_SET flag ("free" | "paid"), PAID_MODELS and
  FREE_MODELS maps keyed by agent (claude/gpt4/gemini), and a
  SUMMARIZER_MODEL resolved the same way
- Free models in use: OpenAI gpt-oss-20b (free), Google Gemma 4 26B
  A4B (free), NVIDIA Nemotron 3 Ultra (free) — assigned across the
  three agent keys; Nemotron specifically backs the summarizer role
  (large context window, positioned for long-running/orchestration
  workloads)
- GET /api/config/active-models endpoint added, frontend shows the
  actual active model string as a small subtitle under each panel
  header, so it's visually clear when free stand-ins are in use
- All previously hardcoded model strings removed in favor of importing
  from this one config file

**Key decisions**:
- The summarizer must NEVER silently resolve to a paid model while
  ACTIVE_MODEL_SET is "free" — it fires automatically and repeatedly,
  and could burn remaining paid credits without direct visibility
- Internal agent keys (claude/gpt4/gemini) never change regardless of
  which real model backs them — only the model string changes

**Verified**: re-ran all Phase 4 and Phase 5 verification tests against
the free models. Pipeline behavior (correct data reaching the model,
per logged payloads) confirmed correct independent of model quality —
free models are weaker and were explicitly not held to the same output
quality bar, only to correct data flow.

**Deferred at this stage**: swapping back to paid models once credits
are available is a one-line config change (ACTIVE_MODEL_SET = "paid"),
not a rebuild.

(fix, 2026-09-13): `openai/gpt-oss-20b:free` was pulled from
OpenRouter's free tier (started 404ing with "unavailable for free, use
openai/gpt-oss-20b instead"). Replaced in both the `claude` slot and
`SUMMARIZER_MODEL_FREE` with `poolside/laguna-s-2.1:free`, confirmed
free and working via a live OpenRouter API call before swapping it in.
Noted but not swapped: `google/gemma-4-26b-a4b-it:free` (the `gpt4`
slot) returned `429 Provider returned error` on two attempts — read as
the free provider being transiently overloaded, not removed like
gpt-oss was, so left as-is pending further evidence.

---

## Phase 7 — JWT authentication + per-user session authorization

**Goal**: require sign-in to use the app, and make sure one user's
sessions are only ever visible/usable by that user — not a shared pool
across every signed-in account.

**What was built**:
- `users` table (006_users.sql): id (uuid), email (unique), password_hash,
  created_at
- `authService.ts`: `signUp`/`signIn` (email format + min-length
  password validation, duplicate-email check), `getUserById`,
  `issueToken`/`verifyToken` via `jsonwebtoken`
- `middleware/auth.ts`: `requireAuth` — verifies the `Bearer` token,
  attaches `req.userId`, otherwise 401s
- `routes/auth.ts`: `POST /api/auth/signup`, `POST /api/auth/login`,
  `GET /api/auth/me`
- `requireAuth` now guards `/api/sessions`, `/api/agents`,
  `/api/config` in index.ts — `/api/auth` stays public
- `sessions.user_id` (007_sessions_user_id.sql): NOT NULL, FK →
  `users(id)` ON DELETE CASCADE, indexed
- `sessionsService.ts`: `createSession`/`listActiveSessions` now take
  and scope by `userId`; added `getSessionOwnerId(sessionId)`
- `routes/sessions.ts` (`GET /:sessionId/messages`) and
  `routes/agents.ts` (`POST /message`) both check the session's owner
  against `req.userId` before touching it
- Frontend: `AuthContext` (token persisted in localStorage, restores
  user on load via `GET /api/auth/me`), `SignInPage`/`SignUpPage`,
  `ProtectedRoute` (redirects to `/signin`), and `api/client.ts`
  rewritten so every request goes through one `authedFetch` helper
  that attaches the bearer token — no call site sends it manually

**Key decisions**:
- Sessions that exist but belong to another user return 404, not 403,
  on both the messages-fetch and agent-message routes — a session id
  can't be used to probe whether it belongs to someone else
- `sessions.user_id` was added as NOT NULL with no backfill migration,
  because all pre-auth sessions were manually cleared from the dev DB
  before this migration ran — there was nothing to backfill
- (major, deliberate regression) Password hashing (bcrypt) was built
  first, then explicitly pulled back out on request — passwords are
  currently stored and compared as PLAINTEXT in `password_hash`. This
  is flagged in a comment at the top of authService.ts and is NOT an
  oversight: it must be reintroduced before this goes near real users
- JWT secret/expiry come from env (`JWT_SECRET`, `JWT_EXPIRES_IN`),
  validated lazily on first use — same pattern as `OPENROUTER_API_KEY`,
  so the server still boots without it and only fails on an actual
  auth call

**Verified**: backend and frontend both type-check clean. Migrations
006 and 007 applied cleanly against the live dev database. End-to-end
curl pass: signed up two fresh users A and B; A created a session;
confirmed A's `GET /api/sessions` includes it and B's list does not;
confirmed B gets HTTP 404 on both `GET /api/sessions/:id/messages` and
`POST /api/agents/message` against A's session; confirmed A can read
her own session's messages (200); confirmed a request with no token at
all gets 401. Cross-checked in psql that the session's `user_id`
correctly joins to user A's row, not B's. Test users/session deleted
from the dev DB after verification. User separately confirmed sign-in/
sign-up works through the real frontend UI.

**Deferred at this stage**: password hashing (see key decision above —
this is the most important open item, not routine cleanup); no
password reset, email verification, or rate limiting on the auth
routes; no refresh tokens or revocation — a single 7-day JWT is issued
at login with no way to invalidate it early if it leaks; short_term_memory
/ long_term_memory / conversation_memory rows have no direct per-user
query surface of their own — they're only reachable indirectly, via an
already-ownership-checked session id.

---

## Phase 8 — Response parser + event classifier (real events table)

(The task doc that specified this called it "Phase 7" — that number was
already taken by the JWT auth/authorization work logged just above, so
this is Phase 8.)

**Goal**: replace hand-seeded mock memory with real events derived from
live agent responses — an agent self-annotates a candidate event, a
classifier validates/shapes it (or passively scans if none was given),
and a validated event gets written to a real relational table.

**What was built**:
- `events` table (008_events.sql): id (`evt_` + nanoid(8)), session_id,
  type, agent, summary, payload (jsonb), confidence, resolves/resolved_by
  (self-referencing FKs), requires_response, preserve, tier, compressed,
  deleted_at, created_at — indexed on (session_id, created_at DESC).
  `tier`/`compressed` are present but unused, reserved for the
  compression engine
- `contextInjector.ts`: the event-candidate instructions block
  (previously a short, under-specified version already present but not
  logged) replaced with the full spec wording, confirmed unconditional
  in code — always in the prompt regardless of what memory exists, not
  gated behind the same-file's memory-section conditionals. Query logic
  extracted into `fetchMemoryRows(sessionId)` so the classifier reuses
  it instead of a second copy
- `responseParser.ts`: `parseAgentResponse()` — pure/sync, splits
  `[EVENT_CANDIDATE]...[/EVENT_CANDIDATE]` out of the raw response,
  discards malformed blocks (missing type/summary) while still
  stripping them from the user-visible text
- `classifier.ts`: `classifyEvent()` — builds a prompt from the
  candidate (or instructs a passive scan if none), recentEvents,
  pendingQuestions, settledFacts; calls OpenRouter with
  `response_format: json_object`, falling back to a second call without
  it if a provider rejects that param; defensively strips markdown
  fences before `JSON.parse`; never throws — returns
  `classifier_parse_failure` / `classifier_incomplete_output` /
  `classifier_unavailable` on any failure mode instead
- `CLASSIFIER_MODEL_PAID`/`FREE`/resolved in models.ts, same
  never-silently-resolve-to-paid-while-free rule as `SUMMARIZER_MODEL`
- `eventWriter.ts`: `writeEvent()` — single transaction: inserts the
  events row, backlinks `resolved_by` on the resolved event, refreshes
  `short_term_memory` (event_window prepended and capped at 20,
  agent_states, pending_questions add/remove) in one UPDATE; rolls back
  and rethrows on any failure
- Wired into `agentPipe.ts` between the OpenRouter call and message
  persistence: parse → classify → (maybe) write → insert `cleanText`
  (not the raw response with the candidate block still in it) as the
  assistant message

**Key decisions**:
- `events` is the source of truth; `short_term_memory.event_window` is
  a denormalized read cache of it — same known, accepted drift tradeoff
  named when this was planned (a resolved event's cached copy in
  event_window can go stale), still deliberately unsolved, still
  deferred to the compression engine phase
- Resilience was extended beyond what the task doc literally asked for:
  it required classifier failures to never block the user's reply; the
  actual guard wraps classify AND write together, so an eventWriter DB
  failure also can't drop the user's answer — only the side-channel
  write is lost, logged clearly
- The task doc's suggested free classifier slug (`openai/gpt-oss-20b:free`)
  is the same dead model already replaced in Phase 6 — used the
  already-verified `poolside/laguna-s-2.1:free` instead
- Test setup diverged from the doc's assumption: the referenced fixture
  session (`dbc5d842-...`) no longer existed (cleared out during the
  auth phase), and sessions now require a real user (Phase 7). Verified
  against a new session created via the real authenticated API under
  the actual account `shivafy02@gmail.com`, seeded with equivalent mock
  data (a DECISION and an open QUESTION, same content the doc itself
  described) directly in Postgres — deleted after verification

**Verified**: ran all four required tests against a second backend
instance (port 3001) so real console output could be captured directly,
cross-checked in psql. Test A (trivial greeting): no candidate, classifier
emit=false, events count and event_window unchanged. Test B (decision-
eliciting prompt): agent self-annotated DECISION, classifier emit=true,
new row written, user-visible response had zero trace of the
[EVENT_CANDIDATE] block. Test C (resolution linking): the same Test B
response also resolved the seeded open question in one turn — confirmed
in psql that the new event's `resolves` points to it, that event's
`resolved_by` points back to the new event, and pending_questions went
from one entry to empty. Test D (classifier down): forced a hard 400
"invalid model ID" from OpenRouter, confirmed emit=false/
reason=classifier_unavailable, user still got a normal response, no
event written, server didn't crash; classifier model reverted afterward
and reconfirmed correct via the main dev server.

Incidental finding during Test D setup (not a defect in this phase's
code, but worth recording): OpenRouter does not reliably hard-fail on a
malformed model string — appending garbage to a valid slug got silently
fuzzy-matched down to the base paid model (`:free` suffix dropped,
real nonzero cost incurred) rather than erroring. A genuinely unknown
vendor/model string does hard-fail (400), which is what Test D actually
exercised. No guardrail against the fuzzy-match case exists yet anywhere
model strings are configured.

**Deferred at this stage**: the compression engine / tiering system
(`tier`, `compressed` columns exist but nothing sets them) — this was
and remains the next real gap, including the event/event_window drift
tradeoff named above; no dedup or rate-limiting on classifier calls (it
fires on every single agent response, free or paid); verification only
exercised the `claude` agent slot (`poolside/laguna-s-2.1:free`) — the
`gpt4`/`gemini` classifier paths weren't separately tested; no guardrail
against OpenRouter's fuzzy model-string matching silently routing a typo
to a paid model instead of erroring.

---

## Next up (not yet built — do not treat as done)

Compression engine / tiering system. `events.tier` and
`events.compressed` already exist as columns but nothing sets them yet.
This is also where the event ↔ event_window drift tradeoff accepted in
Phase 8 (a resolved event's cached copy in short_term_memory.event_window
can go stale relative to the real row) is meant to finally get addressed
— it was deliberately left unsolved twice now, not rediscovered.