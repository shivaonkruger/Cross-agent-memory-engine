# Tests — Orchestrator

Append-only record of test runs performed against this project — distinct
from build_log.md, which records what was *built*. This file records what
was *tested*: what a test targeted, why it was run, how it was carried
out, and what the results actually were (including failures and bugs
found, not just passes).

One entry per test run, appended in the order performed. Never rewrite or
delete a past entry — if a later test contradicts or supersedes an
earlier one, say so in the new entry, the way build_log.md handles
superseded decisions.

---

## Test 1 — Classifier stress test: 20-turn multi-agent conversation (2026-09-23)

**What was tested**: the response parser → event classifier → event
writer pipeline (build_log.md Phase 8), under real multi-turn,
multi-agent load — every event type, a resolution chain, a
contradiction, cross-agent behavior, ordinary no-event turns, and the
`event_window` 20-item eviction cap.

**Why**: Phase 8's original verification (build_log.md) only ran 4
short, isolated turns. This was a deliberately harder, longer,
multi-agent run to see whether the pipeline holds up under realistic
conversational volume and variety, not just the happy-path cases.

**How**: Created a fresh session (`07e43940-e4ac-4ad5-b7f0-0068ac922109`)
under the real account (`shivafy02@gmail.com`), confirmed its baseline
memory state was empty, then sent 20 scripted messages in order through
`POST /api/agents/message` (2s apart), alternating `claude`/`gpt4`/
`gemini`, against a dedicated backend instance on port 3001 so console
output could be captured directly. After the 20 turns, ran full psql
dumps of `events`, `short_term_memory`, `long_term_memory`,
`conversation_memory`, and `messages` for that session. Then, since only
9 real events resulted (not enough to exercise the 20-item cap), wrote a
temporary script (`forceEventVolume.ts`, deleted after use) that called
`eventWriter.writeEvent` directly — bypassing the classifier — to insert
15 synthetic events and force real eviction. Session and all its data
deleted from the account afterward.

**Results**:
- 9 of 20 turns produced a real event: 4× DECISION, 1× CONTRADICTION,
  3× FINDING, 1× HANDOFF. QUESTION, BLOCKER, and OUTPUT were never
  triggered (see findings below for why).
- Eviction cap verified exactly: after forcing the total to 24 events,
  `event_window` held exactly 20 items, and they were exactly the 20
  most recent by `created_at` — the 4 oldest (all real events) were
  evicted from the cache but remained permanently in the `events` table.
- Resolution-chain test (Turn 4 QUESTION → Turn 5 DECISION resolving it)
  could not be exercised — Turn 4's API call failed outright, so no
  QUESTION event ever existed for Turn 5 to resolve.
- gpt4 (`google/gemma-4-26b-a4b-it:free`) failed on **every single
  turn** (6/6) — all API-level failures, zero successful completions.

**Findings / issues surfaced** (not fixed, reported for follow-up):
1. **Real code bug**: `agentPipe.ts:60` — `completion.choices[0]`
   throws `TypeError: Cannot read properties of undefined` when
   `completion.choices` itself is `undefined` (optional chaining only
   guards past the `[0]`, not the array access itself). Caused Turn 9
   to crash mid-request, leaving an orphaned user message in `messages`
   with no assistant reply.
2. **Two distinct 429 causes conflated by symptom**: (a) gpt4's free
   model got throttled by its upstream provider (Google AI Studio
   shared pool) on every attempt; (b) separately, Turn 20 hit
   OpenRouter's account-wide **daily free-tier cap** (50 requests/day,
   `x-ratelimit-remaining: 0`) — a harder limit that would eventually
   block every agent, not just gpt4.
3. **Self-annotation format not always followed**: Turn 19's response
   used a malformed `[DECISION]...[DECISION]` tag instead of the real
   `[EVENT_CANDIDATE]...[/EVENT_CANDIDATE]` format. It leaked into the
   user-visible response text (the parser only strips the correct tag
   format). The classifier's passive-scan fallback still caught it and
   classified correctly, which is a genuine resilience win, but the
   leak into user-visible text is a real UX defect.
4. **`resolves` used more loosely than designed**: Turn 6's
   CONTRADICTION set `resolves` to the DECISION it contradicted, not an
   open QUESTION (the field's intended use). Mechanically harmless
   here since that id was never in `pending_questions`, but shows model
   behavior drifting from the intended "resolves = answers a pending
   question" semantics.
5. **Cross-turn context bleed from a crashed turn**: Turn 9's orphaned
   user message (see #1) stayed in the recency window and visibly
   shaped a later turn's (15) response and classification, well after
   the original turn had "failed" from the caller's perspective.
6. **Turn 8 didn't test OUTPUT as intended** — the test script handed
   Claude pre-written code to react to, rather than asking Claude to
   produce code itself, so it was correctly classified as FINDING
   (feedback), not OUTPUT. Test-design gap, not a system defect.

**Logging note**: per the task's own instructions, this was deliberately
NOT logged as a new build_log.md phase (it's verification of Phase 8,
not a new capability). Pending the user's confirmation, it will instead
become a dated addendum to Phase 8's "Verified" section.

---

## Test 2 — eventWriter.ts `resolves` validation hardening (2026-09-23)

**What was tested**: a fix to `eventWriter.ts` (build_log.md Phase 8)
that validates the classifier's `resolves` field before trusting it —
the target must exist, belong to the same session, be type `QUESTION`,
and be currently unresolved, or the pointer is stripped rather than
written.

**Why**: Test 1's stress test surfaced that `resolves` was being used
more loosely than designed (Turn 6 pointed it at a DECISION, not an
open QUESTION). Separately flagged as a real risk: an LLM-supplied
`resolves` value could hallucinate a nonexistent id, leak across
sessions, target the wrong event type, or re-target an already-resolved
question — none of which code was validating before this fix.

**How**: created two fresh sessions (`3e563ec5-049e-487f-8ce2-96652fea24de`
as the primary, `c5278a3b-1230-447d-8e75-e3703e2394c9` for the
cross-session case). Wrote a temporary script
(`testEventWriterResolves.ts`, deleted after use) that called
`eventWriter.writeEvent` directly — bypassing the classifier — for five
cases: (A) a hallucinated id, (B) a real QUESTION belonging to the
*other* session, (C) a real event of the wrong type (FINDING), (D) a
real QUESTION that's already resolved by something else, (E) a genuine
open QUESTION in the same session (regression check that valid
resolution still works). Verified every outcome directly via psql.
Both sessions and all their data deleted afterward.

**Results**: all 5 passed exactly as specified.
- A/B/C/D: the new event was written successfully with `resolves: NULL`
  in every case (never the invalid value); the referenced target event
  (where one genuinely existed — B, C, D) was confirmed **completely
  untouched** — session 2's question in B, the FINDING in C, and D's
  question's `resolved_by` still pointed at its original resolver, not
  overwritten.
- E: the regression check passed — new event's `resolves` correctly
  set, the target question's `resolved_by` correctly backlinked, and
  `pending_questions` correctly emptied.

**A finding worth recording**: the task doc assumed a hallucinated id
(case A) would be "silently accepted, corrupting the graph." That's not
quite what the *old*, unvalidated code would actually have done —
`events.resolves` has a real FK constraint (`REFERENCES events(id)`),
so a truly nonexistent id would have thrown a foreign-key violation on
insert, rolling back the whole transaction. Since `agentPipe.ts` catches
and swallows classifier/write failures to protect the user-facing
reply, the old failure mode for case A specifically would have been
**silent total loss of that event** (not corruption) — arguably worse
than described, since the event vanishes rather than persisting with a
bad pointer. Cases B and D, by contrast, matched the doc's description
exactly: the referenced event is real, so the FK is satisfied and the
old code's `UPDATE resolved_by` would have silently corrupted an
unrelated session's (B) or an already-settled (D) event's state. Either
way, the fix is correct and necessary — this only refines *why*.

**Logging note**: per the task's own instructions, this is a correction
to Phase 8, not a new capability, so it won't get its own build_log.md
phase. Pending the user's confirmation, it becomes a dated addendum
inside Phase 8's entry instead.

---

## Test 3 — eventWriter.ts `payload` fix verification (2026-09-28)

**What was tested**: a fix making `events.payload` a real, parameterized
JSONB value instead of a hardcoded `'{}'::jsonb` literal.

**Why**: requested as a bug fix ("real data going into payload instead
of an empty object"), but a read-only audit performed first (per the
task's own step 1) found the premise didn't fully hold — see finding
below. User chose, when asked, to mirror `EventCandidate`'s existing
fields into payload rather than extend the pipeline to capture genuinely
new per-type data.

**How**: created a fresh session (`d2607523-aa68-4c2f-beb0-dd20ae2761f7`),
wrote a temporary script (`testPayloadFix.ts`, deleted after use) that
called `eventWriter.writeEvent` directly for two different event types
(DECISION, QUESTION), then queried the `events` table via psql to
inspect the actual `payload` values. Session and its data deleted
afterward.

**Results**: both events had a distinct, non-empty `payload` matching
their own `summary`/`confidence` — `{"summary": "test decision for
payload verification", "confidence": "high"}` and `{"summary": "test
question for payload verification", "confidence": "low"}` respectively.
Confirms the INSERT is now genuinely parameterized (not the old literal)
and varies per call.

**A finding worth recording** (surfaced during the read-only audit
requested before this fix, not during this test itself): `EventCandidate`
— the only object `writeEvent` ever receives — has exactly four fields
(`type`, `summary`, `confidence`, `resolves`), and **all four already
have their own dedicated columns** in `events`. So `payload = {}` was not
actually discarding any real data; there was never any type-specific
information (e.g. OUTPUT's code, HANDOFF's target agent) produced
anywhere upstream to discard in the first place — the original Phase 8
spec even called this out explicitly as a deliberate deferral, not an
oversight. This fix is therefore honestly a duplication of
`summary`/`confidence` into a dynamic, forward-compatible slot — not a
recovery of previously-lost data. Genuine per-type richness would
require new upstream work (threading the raw response or a parsed
target-agent through `responseParser.ts`/`agentPipe.ts`), which was
explicitly out of scope for this fix.

**Logging note**: per the task's own instructions, this is a correction
to Phase 8, not a new capability. Pending the user's confirmation, it
becomes a dated addendum inside Phase 8's entry.

---

## Test 4 — Corroboration feature: environment blockers + 3-case verification (2026-09-28)

**What was tested**: a new event-corroboration feature (pgvector
embeddings + cross-agent similarity matching) — genuinely new
functionality, not a fix to something already built. This is NOT logged
to build_log.md yet; the user asked to batch this with other pending
fixes into one Phase 8 update later, on request.

**Why**: to link events from different agents in the same session that
say the same thing, tracked via `corroborated_by`/`corroboration_count`
on the `events` table, using sentence-embedding cosine similarity.

**How**: two hard environment assumptions were verified before writing
any code (both failed on the first attempt, both fixed):
- **pgvector**: the running Postgres was vanilla `postgres:16` —
  `CREATE EXTENSION vector` failed outright. `docker-compose.yml` was
  already pointed at `pgvector/pgvector:pg16` (pre-edited, not yet
  applied) — recreating the container picked it up. Verified: extension
  0.8.6 active, and all 8 pre-existing sessions/tables survived the
  image swap intact (same underlying data directory/volume, compatible
  Postgres major version).
- **@xenova/transformers** (the spec's named library): failed to install
  — pulls in `sharp`, whose prebuilt binary download timed out and whose
  source-build fallback needs a Visual Studio C++ toolchain not present
  on this machine. Confirmed on a retry, not transient. Swapped to
  `@huggingface/transformers` (the actively-maintained successor) on the
  user's direction — installed cleanly, no native build step. Verified
  with a real smoke test: loaded `Xenova/all-MiniLM-L6-v2` and generated
  an actual 384-dimensional embedding before writing the real feature
  code around it.

Built: migration `009_add_corroboration.sql` (`embedding vector(384)`,
`corroborated_by TEXT[] DEFAULT '{}'`, `corroboration_count INTEGER
DEFAULT 0`, HNSW index — chosen over IVFFlat since IVFFlat needs a
meaningful row count to tune `lists` against and this table is still
small); `lib/embeddings.ts` (`getEmbedding`, model loaded once and
reused); matching logic added to `eventWriter.ts` (embed the new
event's summary, query same-session/different-agent candidates via
`<=>` cosine distance, log every computed score under a clearly marked
TEMP block, link everything above `CORROBORATION_THRESHOLD = 0.85`).
Diff shown to the user before finalizing, as requested.

Then created a fresh session and ran the three required cases directly
against `eventWriter.writeEvent` (bypassing the classifier) via a
temporary script, deleted after use along with the test session.

**Results**:
- Case 2 (same agent, identical summaries): correctly **not** linked —
  and structurally guaranteed, not threshold-dependent: the SQL's
  `agent != $3` filter excludes same-agent rows from the candidate set
  entirely.
- Case 3 (different agents, unrelated summaries): correctly **not**
  linked — similarities near zero or negative (-0.07 to 0.03).
- Case 1 (different agents, near-identical summaries — the spec's own
  example pair: "The bug is in the auth module" / "Looks like the issue
  is in the authentication module"): **not** linked. Real measured
  similarity was **0.8311**, below the placeholder `0.85` threshold.

**This is not a bug** — it's the first real tuning data point the TEMP
logging exists to produce, and it says the placeholder threshold is
probably a little high for genuine paraphrases. The threshold was left
at `0.85` exactly as specified rather than adjusted to make the demo
pass, per the spec's own instruction not to hardcode a "final" value.
Flagged plainly to the user rather than silently tuned.

**Logging note**: this is new functionality (Phase 8 already covers the
events table/classifier/eventWriter it extends), but the user explicitly
asked to hold off on any build_log.md entry until they give the word to
batch it with other pending fixes.

---

## Test 5 — Stop-response feature: real client abort mid-request (2026-09-28)

**What was tested**: the new "stop response" feature — `AgentPanel.tsx`
(Stop button + `AbortController`), `api/client.ts` (forwards the
signal), `routes/agents.ts` (`req.on("close")` → aborts a per-request
`AbortController`), and `agentPipe.ts` (passes the signal into the
OpenRouter call, checks `signal.aborted` both on throw and on the
post-completion race, never writes the assistant message or runs the
classifier/eventWriter when aborted).

**Why**: before this, once a message was sent there was no way to cancel
it — the request always ran to completion, cost the full OpenRouter
call, and always got written to `messages`/`events`. Also surfaced and
resolved a scope question first: the app doesn't actually do token-level
streaming today (`chat.completions.create` is a single blocking call,
no `stream: true`, no SSE) — the pasted spec's "while it's streaming"
framing doesn't literally apply. User chose to scope this as
cancel-the-in-flight-request rather than also building real token
streaming first.

**How**: found and killed a stale leftover backend process from earlier
in this session that was still bound to port 3000 serving old
pre-fix code (a real process-management bug worth noting for future
sessions: backgrounding `npm run dev` with plain shell `&` inside a
Bash tool call does not reliably survive the tool call ending — it
either got orphaned or silently exited; using the tool's dedicated
`run_in_background` mechanism instead kept it alive correctly). Started
a clean backend instance, created a disposable test user
(`stoptest@example.com`) and session (`e1acbade-e50e-4108-b8e9-
7769cd5456d7`), then sent a real `POST /api/agents/message` request via
curl with `--max-time 1` against a prompt long enough that the model
call would still be in flight at the 1-second mark — forcing curl to
drop the connection client-side, the same effect a browser's
`AbortController.abort()` has on the underlying fetch. Checked the
backend's live console output and queried `messages`/`events` via psql
afterward. Test session soft-deleted via `DELETE /api/sessions/:id`
afterward (the delete-session feature itself, exercised incidentally).

**Results**: curl exited with code 28 (client-side timeout), confirming
a real dropped connection, not a simulated one. Backend log showed the
full intended sequence with no crash — `step=insert_user_message` had
already run, then `step=call_openrouter` started, then
`step=aborted_by_client — response discarded, not written` fired
immediately on the `req.on("close")` → `controller.abort()` →
OpenRouter call rejection chain, then the route handler logged the
abort and returned cleanly (no 500, no unhandled rejection). psql
confirmed: the user's message was saved (`role=user`, correct content,
correct timestamp) exactly as intended — "the user's own prompt stays
saved, only the incomplete AI response is thrown away" — while `events`
had zero rows for the session and no assistant-role row was ever
written to `messages`. Ran the same abort twice (once accidentally
against the stale process before it was killed, once against the fixed
one); both left the same clean state, so the result isn't a fluke of
one particular timing.

**Not exercised by this test**: the actual React UI (button swapping to
"Stop", the click handler, the `AbortError` branch in `AgentPanel.tsx`'s
catch block) — this test verified the backend half of the contract
(client disconnect → server stops calling the LLM → nothing partial
gets written) against a real dropped connection, not a browser click.
The frontend half is small and mirrors patterns already manually
verified elsewhere in this project (e.g. the delete-session confirm
dialog), but wasn't independently clicked through in a browser this
time.

**Logging note**: this is a new capability (Phase 8 didn't have any
notion of cancellation), not a fix to something already logged. Pending
the user's confirmation, per convention it would get its own
build_log.md phase rather than being folded into an existing one.

---

## Test 6 — Named sessions: create-with-name, rename, validation (2026-09-28)

**What was tested**: the new `sessions.name` column, `createSession`
now requiring a name, the new `renameSession`/`PATCH /:sessionId`
endpoint, and the create/rename empty-name validation.

**Why**: sessions previously had no name at all (list UI only ever
showed the raw UUID and a timestamp) — this adds a real, editable label
at creation time and afterward.

**How**: applied migration `010_add_session_name.sql`
(`ALTER TABLE sessions ADD COLUMN name TEXT NOT NULL DEFAULT 'New
session'`) via `npm run migrate` against the real dev database, then
exercised every path directly with curl against the live backend
(same instance already running from the stop-response test, hot-reloaded
by nodemon on the code changes): create with an explicit name, list
(confirms persistence), rename, rename with a whitespace-only name,
create with an empty-string name, create with the `name` field omitted
entirely, and rename of a nonexistent/not-owned session id. Both test
sessions soft-deleted afterward.

**Results**: all 7 cases behaved exactly as implemented —
- Create with `{"name":"Stress test planning"}` → `201` with that exact
  name in the response.
- `GET /api/sessions` → the same name comes back in the list.
- `PATCH .../:id` with `{"name":"Renamed session"}` → `200`, name
  updated.
- `PATCH` with `{"name":"   "}` (whitespace-only) → `400 "name is
  required"`, nothing written.
- `POST /` with `{"name":""}` → `400 "name must be a non-empty
  string"`.
- `POST /` with `{}` (no `name` key at all) → `201`, server-side default
  `"New session"` applied — this path exists for API robustness; the
  actual frontend modal always sends an explicit name.
- `PATCH` on a random nonexistent UUID → `404 "Session not found"` (same
  ownership-ambiguity pattern as delete/list — doesn't distinguish
  "doesn't exist" from "not yours").

**Validation choice** (spec offered two options — block, or fall back to
the previous name — and asked to pick one and note it): chose **block**
on the backend (empty/whitespace name → `400`, no write happens) and
**fall back to the previous name** on the frontend's inline rename UI
specifically (`SessionListItem.tsx`'s `commitRename`: an empty or
unchanged trimmed value is a silent no-op, reverting the input back to
`session.name` with no request sent at all). The creation modal's
Create button is simply disabled on an empty/whitespace name, so that
path can't submit empty in the first place. Three different UI-layer
answers to the same rule (backend rejects outright; the modal disables
its button; the inline rename silently reverts) rather than one
mechanism, because each is the natural fit for its own interaction
shape — reported plainly since it's a design choice, not a spec
requirement.

**Not exercised by this test**: the actual React UI — the modal's
Enter/Escape handling, the inline rename's double-click/edit-icon
trigger, Enter/Escape/blur handling, and the commit-once `settledRef`
guard against a double-fire between Enter and the blur it triggers.
Verified by code reading and the same pattern already used successfully
elsewhere in this project (`ConfirmDialog.tsx`'s Escape handling), but
not independently clicked through in a browser this session.

---

## Test 7 — Prompt box auto-grow + Shift+Enter (2026-09-28)

**What was tested**: `AgentPanel.tsx`'s message input switched from
`<input>` to an auto-growing `<textarea>` (caps at 200px / ~8-10 lines,
then scrolls internally), plus Enter-sends / Shift+Enter-inserts-newline
keydown handling.

**Why**: requested as a pure frontend UX fix — no backend involvement.

**How**: this environment has no browser-automation tool available (no
Playwright/Puppeteer-style tool was found via a capability search), so
this could not be click-tested in an actual running browser the way the
system's own UI-testing expectation calls for. What *was* done: `npx
tsc --noEmit` (clean) and a full production build (`npm run build`,
clean — 284 modules transformed, no errors) to catch any compile-time
or bundling problems. The resize logic itself (`useLayoutEffect` keyed
on `input`, collapse-to-auto-then-measure-`scrollHeight`-then-clamp)
was verified by re-reading it against the standard auto-grow-textarea
technique, not by watching it run.

**Results**: typecheck and production build both clean. **The actual
in-browser behavior — does it grow smoothly, does it shrink back down
on delete, does it avoid a page-jump, does Shift+Enter really insert a
newline instead of sending — was not verified this session.** Flagging
this plainly rather than claiming a UI test that didn't happen: this
is a real gap, not just a formality, given three of the four
requirements in the spec (no page-jump, shrink-on-delete, reset-after-
send) are specifically about runtime visual behavior a type/build check
cannot catch.

---

## Test 8 — Per-type event schema validation (2026-09-28)

**What was tested**: a new second validation layer in `eventWriter.ts`
— CONTRADICTION requires `claim_a`/`claim_b` (both must reference real,
existing events in the same session), BLOCKER requires
`what_is_blocked`/`what_resolves_it`, all other types have no extra
requirements. Rejected events are dropped (not inserted) and logged
with reason `schema_validation_failed`.

**Why**: requested as new validation logic layered on top of the
existing type/summary check, explicitly not touching corroboration or
the already-fixed payload-writing mechanism.

**A scope conflict surfaced before writing any code**: `EventCandidate`
only ever had 4 fields (`type`, `summary`, `confidence`, `resolves`) —
nothing upstream (the agent's self-annotation format, the classifier's
JSON schema) produces `claim_a`/`claim_b`/`what_is_blocked`/
`what_resolves_it`, and `eventWriter.ts`'s `payload` was built as
exactly `{ summary, confidence }`. Implementing the check literally
as specified, without touching anything else, would have made
CONTRADICTION and BLOCKER **permanently unwritable** — the new check's
own required test case ("valid claim_a/claim_b gets accepted") would
have been impossible to satisfy, since there'd be no way to get those
values into `payload` at all. Flagged to the user via AskUserQuestion
before proceeding; they chose to widen `payload`'s construction to
include these fields when present on the incoming event (additive
only — the existing summary/confidence behavior and the parameterized-
JSON mechanism itself are unchanged), rather than ship validation logic
that could never do anything but reject.

**How**: extended `EventCandidate` (`responseParser.ts`) with 4 new
*optional* fields — additive, doesn't affect any existing caller.
Added `REQUIRED_FIELDS` map and the validation block to `eventWriter.ts`
(placed right after `payload` is built, before the embedding call —
so a rejected event never even pays for an embedding). On rejection:
logs `schema_validation_failed` with the type and exactly which
field(s) were missing/invalid, then `ROLLBACK`s and returns `null`
(changed `writeEvent`'s return type from `{ eventId: string }` to
`{ eventId: string } | null`; the only real caller, `agentPipe.ts`,
never used the return value, so this needed no change there).

Created a fresh session (`39f2128b-6c45-4120-8a2a-35bf27d20413`), wrote
a temporary script (`testSchemaValidation.ts`, deleted after use) that
called `eventWriter.writeEvent` directly (bypassing the classifier,
same pattern as every other eventWriter test in this file) for all 5
required cases, then queried `events` via psql. Session deleted
afterward.

**Results**: all 5 passed exactly as specified.
- CONTRADICTION missing `claim_a` → rejected, logged
  `invalid/missing field(s): claim_a`, not inserted.
- CONTRADICTION with `claim_a` pointing at a nonexistent event id →
  rejected the same way, not inserted.
- CONTRADICTION with real, existing `claim_a`/`claim_b` → accepted;
  psql confirmed the row exists with
  `payload = {"claim_a": "evt_...", "claim_b": "evt_...", "summary":
  ..., "confidence": "high"}`.
- BLOCKER missing `what_resolves_it` → rejected, not inserted.
- FINDING with only the common fields → accepted normally,
  `payload = {"summary": ..., "confidence": "low"}`, confirming
  untyped-requirement types are unaffected.

A final psql count on the test session showed exactly 4 rows (2 setup
FINDINGs + the 1 accepted CONTRADICTION + the 1 accepted FINDING) —
the 3 rejected attempts (2× CONTRADICTION, 1× BLOCKER) never touched
the table, confirmed by row count as well as by each individual result.

**Not fixed / still true after this task**: the real agent → classifier
pipeline still cannot produce `claim_a`/`claim_b`/`what_is_blocked`/
`what_resolves_it` for a live CONTRADICTION or BLOCKER — this task only
added the validation layer and the minimum payload-plumbing needed to
make it testable, not the upstream wiring (self-annotation format,
classifier prompt/schema) that would let a real agent response ever
populate these fields. Until that separate, out-of-scope work happens,
every real CONTRADICTION/BLOCKER the classifier emits will be rejected
by this new check — which is arguably correct today (undefined
"claims" shouldn't be inserted) but is worth knowing before assuming
this feature is fully wired end-to-end.
