import { Router } from "express";
import { createSession, getSessionOwnerId, listActiveSessions } from "../services/sessionsService";
import { getSessionMessages } from "../services/messagesService";

export const sessionsRouter = Router();

sessionsRouter.post("/", async (req, res) => {
  try {
    const session = await createSession(req.userId!);
    res.status(201).json(session);
  } catch (err) {
    console.error("[routes/sessions] POST / failed", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

sessionsRouter.get("/", async (req, res) => {
  try {
    const sessions = await listActiveSessions(req.userId!);
    res.json(sessions);
  } catch (err) {
    console.error("[routes/sessions] GET / failed", err);
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

sessionsRouter.get("/:sessionId/messages", async (req, res) => {
  try {
    const ownerId = await getSessionOwnerId(req.params.sessionId);
    // 404 (not 403) for both "doesn't exist" and "not yours" so a session id
    // can't be used to probe whether it belongs to someone else.
    if (!ownerId || ownerId !== req.userId) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const messages = await getSessionMessages(req.params.sessionId);
    res.json(messages);
  } catch (err) {
    console.error("[routes/sessions] GET /:sessionId/messages failed", err);
    res.status(500).json({ error: "Failed to fetch session messages" });
  }
});
