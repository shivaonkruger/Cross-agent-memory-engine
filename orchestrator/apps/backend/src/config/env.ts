import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  PORT: Number(process.env.PORT ?? 3000),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  // Validated lazily by lib/openrouterClient.ts on first use, not here —
  // scripts like the migration runner load this module but never call OpenRouter.
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  // Validated lazily by services/authService.ts on first use, not here — same
  // reasoning as OPENROUTER_API_KEY above.
  JWT_SECRET: process.env.JWT_SECRET ?? "",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "7d",
};
