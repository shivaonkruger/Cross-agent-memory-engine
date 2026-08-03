import type {
  Agent,
  Session,
  ChatMessage,
  SendMessageRequest,
  SendMessageResponse,
} from "../types/shared";

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function createSession(): Promise<Session> {
  const res = await fetch(`${BASE_URL}/api/sessions`, { method: "POST" });
  return handleResponse<Session>(res);
}

export async function listSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE_URL}/api/sessions`);
  return handleResponse<Session[]>(res);
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/messages`);
  return handleResponse<ChatMessage[]>(res);
}

export async function getActiveModels(): Promise<Record<Agent, string>> {
  const res = await fetch(`${BASE_URL}/api/config/active-models`);
  return handleResponse<Record<Agent, string>>(res);
}

export async function sendAgentMessage(
  req: SendMessageRequest
): Promise<SendMessageResponse> {
  const res = await fetch(`${BASE_URL}/api/agents/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handleResponse<SendMessageResponse>(res);
}
