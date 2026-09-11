import { env } from "./config/env";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { sessionsRouter } from "./routes/sessions";
import { agentsRouter } from "./routes/agents";
import { configRouter } from "./routes/config";
import { requireAuth } from "./middleware/auth";

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/sessions", requireAuth, sessionsRouter);
app.use("/api/agents", requireAuth, agentsRouter);
app.use("/api/config", requireAuth, configRouter);

app.listen(env.PORT, () => {
  console.log(`[backend] listening on port ${env.PORT}`);
});
