# Context — Orchestrator

## What we are trying to make

A tool where multiple LLM providers (Claude, GPT-4, Gemini) can work on
the same problem at the same time, inside one operator interface, while
sharing a live, structured memory of what the collective has discovered,
decided, and disagreed on — instead of operating as three isolated
chatbots that know nothing about each other.

The core idea we are chasing: today, if you want a second opinion from
another model, you copy-paste context between separate chat tabs by
hand. Every provider's chat is an island. This tool removes the
copy-pasting — agents share a structured, evolving memory automatically,
and an operator (you) can toggle any agent in or out of that shared
memory at any point, live.

## The problem this solves

Running multiple LLMs on one task today means either:
- Manually relaying context between separate tabs (tedious, lossy, slow)
- Using a framework (LangGraph, AutoGen, CrewAI) that treats "shared
  context" as raw message history dumped between agents — which doesn't
  scale, doesn't distinguish signal from noise, and gives no way to
  control which agent knows what at any given moment

This tool is not trying to be a pipeline builder or an agent framework.
It is trying to be an operator's console for running several
frontier models side by side on the same problem, with a memory layer
that is actually structured and actually maintained — not just a
bigger and bigger blob of text getting reinjected every turn.

## What "memory" means in this project — two distinct kinds

There are two separate memory problems, and they must not be conflated:

**1. Cross-agent shared memory (the "central node")**
What do Claude, GPT-4, and Gemini collectively know, decide, and
disagree on in this session? This is the actual point of the product —
the thing that doesn't exist anywhere else. It answers: "what has the
team established so far, regardless of which agent is talking."

**2. Per-agent conversational memory**
Within its own thread with the user, does an individual agent remember
what was said three messages ago? This is a baseline requirement any
chat interface needs — it has nothing to do with the multi-agent
premise, but it must not be solved by just growing the context window
forever, because that defeats the discipline the whole memory engine is
built on. This gets solved with bounded, recursive summarization — not
raw accumulation.

Both are "memory." Neither replaces the other. Conflating them is a
mistake to actively avoid.

## Current direction (subject to change — see below)

- Cross-agent context is injected in FULL on every call, not
  incrementally. Delta injection via per-agent cursors has been
  deliberately dropped from the plan — it added real complexity
  (cursor staleness, catch-up logic, silent desync risk) for a
  saving that isn't worth it at current scale. Full injection is
  now the intended long-term approach, not a stepping stone.

- Per-agent conversational continuity uses a rolling, recursively
  updated summary plus a small fixed recency window of raw messages —
  never the full raw history, no matter how long the session runs.

- The event system (classifier, structured event types, tiered
  compression into long-term memory) is the mechanism intended to
  populate cross-agent shared memory over time. It is being built
  incrementally and is not fully wired yet — check the actual codebase
  for what currently exists, don't assume from this document.

## How to treat this document

This file describes intent and reasoning — the "why" — not a fixed
architecture spec. Architecture, schemas, and mechanisms evolve as
understanding develops and should be verified against the actual
codebase, not assumed from here. When a task requires specific
technical detail (schemas, exact function signatures, file structure),
that detail belongs in the task's own instructions, written to be
self-contained — not deferred to this file or any other external
document. This file exists so any agent picking up this project cold
understands what we are building and why, even if every implementation
detail around it has shifted.