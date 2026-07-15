import type { Agent } from "../types/shared";

export const MODELS: Record<Agent, string> = {
  claude: "anthropic/claude-sonnet-5",
  gpt4: "openai/gpt-4o",
  gemini: "google/gemini-2.5-pro",
};
