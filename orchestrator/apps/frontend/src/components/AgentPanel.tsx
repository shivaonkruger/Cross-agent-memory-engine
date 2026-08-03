import { useState } from "react";
import { sendAgentMessage } from "../api/client";
import { MessageBubble } from "./MessageBubble";
import type { Agent, ChatMessage } from "../types/shared";

const AGENT_LABELS: Record<Agent, string> = {
  claude: "Claude",
  gpt4: "GPT-4",
  gemini: "Gemini",
};

interface AgentPanelProps {
  agent: Agent;
  sessionId: string;
  initialMessages: ChatMessage[];
  activeModel?: string;
}

export function AgentPanel({ agent, sessionId, initialMessages, activeModel }: AgentPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const content = input.trim();
    if (!content || pending) {
      return;
    }

    const optimisticMessage: ChatMessage = {
      id: `pending-${Date.now()}`,
      agent,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setInput("");
    setPending(true);
    setError(null);

    try {
      const { responseText } = await sendAgentMessage({ sessionId, agent, message: content });
      setMessages((prev) => [
        ...prev,
        {
          id: `response-${Date.now()}`,
          agent,
          role: "assistant",
          content: responseText,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col h-full border border-border rounded-md overflow-hidden">
      <div className="border-b border-border px-4 py-2">
        <span className="font-mono text-xs uppercase tracking-wide text-muted">
          {AGENT_LABELS[agent]}
        </span>
        {activeModel && (
          <div className="font-mono text-[11px] text-muted/70 mt-0.5">using: {activeModel}</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {pending && <p className="text-xs text-muted font-mono">thinking...</p>}
        {error && <p className="text-xs text-red-600 font-mono">{error}</p>}
      </div>

      <div className="border-t border-border p-2 flex gap-2">
        <input
          className="flex-1 border border-border rounded-sm px-2 py-1 text-sm outline-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSend();
            }
          }}
          placeholder={`Message ${AGENT_LABELS[agent]}...`}
          disabled={pending}
        />
        <button
          type="button"
          className="bg-primary text-surface rounded-sm px-3 py-1 text-sm disabled:opacity-50"
          onClick={handleSend}
          disabled={pending || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
