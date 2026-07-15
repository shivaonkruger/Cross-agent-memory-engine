import { Router } from "express";
import { createSession, listActiveSessions } from "../services/sessionsService";
import { getSessionMessages } from "../services/messagesService";

export const sessionsRouter = Router();

sessionsRouter.post("/", async (_req, res) => {
  try {
    const session = await createSession();
    res.status(201).json(session);
  } catch (err) {
    console.error("[routes/sessions] POST / failed", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

sessionsRouter.get("/", async (_req, res) => {
  try {
    const sessions = await listActiveSessions();
    res.json(sessions);
  } catch (err) {
    console.error("[routes/sessions] GET / failed", err);
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

sessionsRouter.get("/:sessionId/messages", async (req, res) => {
  try {
    const messages = await getSessionMessages(req.params.sessionId);
    res.json(messages);
  } catch (err) {
    console.error("[routes/sessions] GET /:sessionId/messages failed", err);
    res.status(500).json({ error: "Failed to fetch session messages" });
  }
});
