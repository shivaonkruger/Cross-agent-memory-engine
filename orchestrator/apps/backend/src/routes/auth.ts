import { Router } from "express";
import { AuthError, getUserById, signIn, signUp } from "../services/authService";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const result = await signUp(email, password);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("[routes/auth] POST /signup failed", err);
    res.status(500).json({ error: "Failed to create account" });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const result = await signIn(email, password);
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("[routes/auth] POST /login failed", err);
    res.status(500).json({ error: "Failed to sign in" });
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.userId!);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (err) {
    console.error("[routes/auth] GET /me failed", err);
    res.status(500).json({ error: "Failed to fetch current user" });
  }
});
