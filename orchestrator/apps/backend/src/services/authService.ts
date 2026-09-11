import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool";
import { env } from "../config/env";
import type { AuthResponse, User } from "../types/shared";

const SALT_ROUNDS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function getJwtSecret(): string {
  if (!env.JWT_SECRET) {
    throw new Error("Missing required env var: JWT_SECRET");
  }
  return env.JWT_SECRET;
}

function toUser(row: { id: string; email: string; created_at: Date }): User {
  return { id: row.id, email: row.email, createdAt: row.created_at.toISOString() };
}

function issueToken(user: User): string {
  return jwt.sign({ sub: user.id, email: user.email }, getJwtSecret(), {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

function normalizeEmail(email: unknown): string {
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    throw new AuthError("A valid email is required");
  }
  return email.trim().toLowerCase();
}

function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8) {
    throw new AuthError("Password must be at least 8 characters");
  }
  return password;
}

export async function signUp(rawEmail: unknown, rawPassword: unknown): Promise<AuthResponse> {
  const email = normalizeEmail(rawEmail);
  const password = validatePassword(rawPassword);

  const existing = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
  if (existing.rowCount && existing.rowCount > 0) {
    throw new AuthError("An account with that email already exists", 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await pool.query<{ id: string; email: string; created_at: Date }>(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
    [email, passwordHash]
  );

  const user = toUser(result.rows[0]!);
  return { token: issueToken(user), user };
}

export async function signIn(rawEmail: unknown, rawPassword: unknown): Promise<AuthResponse> {
  const email = normalizeEmail(rawEmail);
  if (typeof rawPassword !== "string" || !rawPassword) {
    throw new AuthError("Password is required");
  }

  const result = await pool.query<{
    id: string;
    email: string;
    password_hash: string;
    created_at: Date;
  }>("SELECT id, email, password_hash, created_at FROM users WHERE email = $1", [email]);

  const row = result.rows[0];
  if (!row) {
    throw new AuthError("Invalid email or password", 401);
  }

  const valid = await bcrypt.compare(rawPassword, row.password_hash);
  if (!valid) {
    throw new AuthError("Invalid email or password", 401);
  }

  const user = toUser(row);
  return { token: issueToken(user), user };
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await pool.query<{ id: string; email: string; created_at: Date }>(
    "SELECT id, email, created_at FROM users WHERE id = $1",
    [id]
  );
  const row = result.rows[0];
  return row ? toUser(row) : null;
}

export function verifyToken(token: string): { userId: string; email: string } {
  const payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
  if (typeof payload.sub !== "string") {
    throw new AuthError("Invalid token", 401);
  }
  return { userId: payload.sub, email: typeof payload.email === "string" ? payload.email : "" };
}
