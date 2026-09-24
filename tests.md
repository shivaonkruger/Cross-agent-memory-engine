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
