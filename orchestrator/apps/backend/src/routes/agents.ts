import { Router } from "express";
import { sendAgentMessage } from "../services/agentPipe";
import type { Agent } from "../types/shared";

export const agentsRouter = Router();

const ALLOWED_AGENTS: Agent[] = ["claude", "gpt4", "gemini"];

agentsRouter.post("/message", async (req, res) => {
  const { sessionId, agent, message } = req.body ?? {};

  if (typeof sessionId !== "string" || !sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  if (typeof message !== "string" || !message) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  if (!ALLOWED_AGENTS.includes(agent)) {
    res.status(400).json({ error: `agent must be one of: ${ALLOWED_AGENTS.join(", ")}` });
    return;
  }

  try {
    const result = await sendAgentMessage(sessionId, agent as Agent, message);
    res.json(result);
  } catch (err) {
    console.error("[routes/agents] POST /message failed", err);
    res.status(500).json({ error: "Failed to get agent response" });
  }
});
