import { Router } from "express";
import { sendAgentMessage } from "../services/agentPipe";
import { getSessionOwnerId } from "../services/sessionsService";
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

  // Lets us cancel the in-flight OpenRouter call the moment the client goes
  // away (stop button, tab close, navigation) instead of letting it run to
  // completion in the background for no one.
  const controller = new AbortController();
  let responded = false;
  req.on("close", () => {
    if (!responded) {
      controller.abort();
    }
  });

  try {
    // Same not-found-vs-not-yours ambiguity as GET /:sessionId/messages —
    // a sessionId in this body could otherwise be used to talk into a
    // session that isn't the caller's.
    const ownerId = await getSessionOwnerId(sessionId);
    if (!ownerId || ownerId !== req.userId) {
      responded = true;
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const result = await sendAgentMessage(sessionId, agent as Agent, message, controller.signal);
    responded = true;
    res.json(result);
  } catch (err) {
    responded = true;
    if (controller.signal.aborted) {
      // Client-initiated cancel, not a server failure — sendAgentMessage
      // already made sure nothing partial got written. Nothing to send
      // back to a socket that isn't there anymore.
      console.log(`[routes/agents] POST /message aborted by client session=${sessionId} agent=${agent}`);
      return;
    }
    console.error("[routes/agents] POST /message failed", err);
    res.status(500).json({ error: "Failed to get agent response" });
  }
});
