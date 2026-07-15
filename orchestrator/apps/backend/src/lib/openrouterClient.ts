import OpenAI from "openai";
import { env } from "../config/env";

let client: OpenAI | undefined;

// Constructed lazily (on first real call) rather than at import time, so the
// server can still boot and serve non-agent routes before OPENROUTER_API_KEY
// is configured — the OpenAI SDK throws eagerly in its constructor if the key
// is missing/empty.
export function getOpenrouterClient(): OpenAI {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set — cannot call OpenRouter");
  }
  if (!client) {
    client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: env.OPENROUTER_API_KEY,
    });
  }
  return client;
}
