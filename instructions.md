# Instructions — Maintaining build_log.md

build_log.md is an append-only historical record of what has actually
been built and verified in this project. Follow these rules whenever
you finish a unit of work in this codebase.

## When to append a new phase entry

Append a new phase entry ONLY when a piece of work is fully built AND
verified — every relevant test/curl/psql check in that task's
instructions has passed. Do not append while work is still in
progress, partially done, or unverified. If you're unsure whether
something is "done enough" to count as a phase, ask before appending
rather than guessing.

Do not create a new phase entry for a small fix, a bug patch, or a
tweak to something already logged in an existing phase — fold that
into the existing phase's entry instead (see "Editing an existing
entry" below). A new phase is for a genuinely new capability or
component being added to the system, not a correction to one already
logged.

## How to append

1. Read build_log.md in full first.
2. Determine the next sequential phase number (one higher than the
   highest existing phase number).
3. Append a new section using EXACTLY this template:

## Phase N — <short title>

**Goal**: <one or two sentences — what problem this phase solves>

**What was built**: <bullet list of concrete things added — tables,
functions, routes, files, config>

**Key decisions**: <bullet list of any non-obvious choices made and
why, especially anything that overrides or permanently rules out a
previously considered alternative>

**Verified**: <what was actually tested and confirmed working — be
specific, e.g. "sent message X, confirmed Y in logs, confirmed Z in
psql," not just "tested and it works">

**Deferred at this stage**: <what was deliberately left unbuilt or
unfinished, so a future phase doesn't have to rediscover this by
reading code>

4. If there is a "## Next up" section at the bottom of the file
   describing what this new phase just built, remove or update that
   section so it no longer describes completed work — it should only
   ever describe genuinely upcoming, not-yet-built work.
5. Never rewrite, delete, or "clean up" a previous phase's entry.
   History is permanent. If a past decision was later reversed or
   corrected, note that in the NEW phase's entry (e.g. "reverses the
   approach taken in Phase 4 because...") rather than editing the old
   one.

## Editing an existing entry (rare — only for small fixes)

If a bug fix, small correction, or minor addition doesn't warrant its
own phase, add a short dated addendum line inside the relevant existing
phase's "What was built" or "Deferred at this stage" section, clearly
marked, e.g.:
  "(fix, later): corrected the resolution check to also match
  case-insensitive event types"
Do not rewrite the original bullet it's correcting — append the
addendum near it instead, so the original reasoning stays visible.

## What NOT to put in this file

- Architecture intent, product vision, or "why we're building this at
  all" — that belongs in context.md, not here
- Anything not yet verified working
- Detailed code walkthroughs — this is a log of what exists and why,
  not a tutorial