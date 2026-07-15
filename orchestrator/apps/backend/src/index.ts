import { env } from "./config/env";
import express from "express";
import cors from "cors";
import { sessionsRouter } from "./routes/sessions";
import { agentsRouter } from "./routes/agents";

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.use("/api/sessions", sessionsRouter);
app.use("/api/agents", agentsRouter);

app.listen(env.PORT, () => {
  console.log(`[backend] listening on port ${env.PORT}`);
});
