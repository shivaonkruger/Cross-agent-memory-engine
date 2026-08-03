import type { Agent } from "../types/shared";

// Change to "paid" to restore the real branded models.
export const ACTIVE_MODEL_SET = "free" as const;

// These are the verified-working paid slugs from earlier testing (not the
// original anthropic/claude-3-5-sonnet / google/gemini-1.5-pro — both were
// confirmed removed from OpenRouter's catalog and already fixed once).
const PAID_MODELS: Record<Agent, string> = {
  claude: "anthropic/claude-sonnet-5",
  gpt4: "openai/gpt-4o",
  gemini: "google/gemini-2.5-pro",
};

// Free-tier stand-ins for zero-cost pipeline testing. The mapping of which
// free model backs which agent key is arbitrary — none of these are the
// real providers. Verified against GET https://openrouter.ai/api/v1/models.
const FREE_MODELS: Record<Agent, string> = {
  claude: "openai/gpt-oss-20b:free",
  gpt4: "google/gemma-4-26b-a4b-it:free",
  gemini: "nvidia/nemotron-3-ultra-550b-a55b:free",
};

export const MODELS: Record<Agent, string> =
  ACTIVE_MODEL_SET === "free" ? FREE_MODELS : PAID_MODELS;

export const SUMMARIZER_MODEL_PAID = "openai/gpt-4o-mini";
export const SUMMARIZER_MODEL_FREE = "openai/gpt-oss-20b:free";

export const SUMMARIZER_MODEL =
  ACTIVE_MODEL_SET === "free" ? SUMMARIZER_MODEL_FREE : SUMMARIZER_MODEL_PAID;
