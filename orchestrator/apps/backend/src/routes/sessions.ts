import { Router } from "express";
import {
  createSession,
  deleteSession,
  getSessionOwnerId,
  listActiveSessions,
  renameSession,
} from "../services/sessionsService";
import { getSessionMessages } from "../services/messagesService";

export const sessionsRouter = Router();

sessionsRouter.post("/", async (req, res) => {
  const { name } = req.body ?? {};
  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }

  try {
    const session = await createSession(req.userId!, typeof name === "string" ? name.trim() : "New session");
    res.status(201).json(session);
  } catch (err) {
    console.error("[routes/sessions] POST / failed", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

sessionsRouter.patch("/:sessionId", async (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  try {
    // renameSession itself enforces ownership + not-deleted, so a null
    // result covers "doesn't exist", "not yours", and "already deleted"
    // alike — same 404-not-403 pattern as the other routes here.
    const session = await renameSession(req.params.sessionId, req.userId!, name.trim());
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(session);
  } catch (err) {
    console.error("[routes/sessions] PATCH /:sessionId failed", err);
    res.status(500).json({ error: "Failed to rename session" });
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

sessionsRouter.delete("/:sessionId", async (req, res) => {
  try {
    const deleted = await deleteSession(req.params.sessionId, req.userId!);
    // Same not-found-vs-not-yours ambiguity as the other routes above —
    // covers "doesn't exist", "not yours", and "already deleted" alike.
    if (!deleted) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error("[routes/sessions] DELETE /:sessionId failed", err);
    res.status(500).json({ error: "Failed to delete session" });
  }
});
