import type {
  Agent,
  AuthCredentials,
  AuthResponse,
  Session,
  ChatMessage,
  SendMessageRequest,
  SendMessageResponse,
  User,
} from "../types/shared";

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;
const TOKEN_KEY = "cami.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** fetch wrapper that attaches the bearer token to every authenticated request. */
async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

export async function signUp(credentials: AuthCredentials): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  return handleResponse<AuthResponse>(res);
}

export async function signIn(credentials: AuthCredentials): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  return handleResponse<AuthResponse>(res);
}

export async function getCurrentUser(): Promise<User> {
  const res = await authedFetch("/api/auth/me");
  return handleResponse<User>(res);
}

export async function createSession(): Promise<Session> {
  const res = await authedFetch("/api/sessions", { method: "POST" });
  return handleResponse<Session>(res);
}

export async function listSessions(): Promise<Session[]> {
  const res = await authedFetch("/api/sessions");
  return handleResponse<Session[]>(res);
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const res = await authedFetch(`/api/sessions/${sessionId}/messages`);
  return handleResponse<ChatMessage[]>(res);
}

export async function getActiveModels(): Promise<Record<Agent, string>> {
  const res = await authedFetch("/api/config/active-models");
  return handleResponse<Record<Agent, string>>(res);
}

export async function sendAgentMessage(
  req: SendMessageRequest
): Promise<SendMessageResponse> {
  const res = await authedFetch("/api/agents/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handleResponse<SendMessageResponse>(res);
}
