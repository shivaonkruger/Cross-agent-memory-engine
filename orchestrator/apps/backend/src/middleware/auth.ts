import type { NextFunction, Request, Response } from "express";
import { AuthError, verifyToken } from "../services/authService";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  try {
    const { userId } = verifyToken(token);
    req.userId = userId;
    next();
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    res.status(status).json({ error: "Invalid or expired token" });
  }
}
