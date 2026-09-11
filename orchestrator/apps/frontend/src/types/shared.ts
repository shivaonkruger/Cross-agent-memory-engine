export type Agent = "claude" | "gpt4" | "gemini";

export interface Session {
  sessionId: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  agent: Agent;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface SendMessageRequest {
  sessionId: string;
  agent: Agent;
  message: string;
}

export interface SendMessageResponse {
  responseText: string;
}

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
