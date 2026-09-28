import { useLayoutEffect, useRef, useState } from "react";
import { sendAgentMessage } from "../api/client";
import { MessageBubble } from "./MessageBubble";
import type { Agent, ChatMessage } from "../types/shared";

const AGENT_LABELS: Record<Agent, string> = {
  claude: "Claude",
  gpt4: "GPT-4",
  gemini: "Gemini",
};

// ~8-10 lines at this font size before the box stops growing and scrolls
// internally instead.
const MAX_TEXTAREA_HEIGHT = 200;

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
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Runs before paint, not after, so the box never visibly jumps between
  // "too tall/short for the new content" and "resized" — and it re-runs
  // whenever `input` changes for any reason, including the reset to "" on
  // send, so shrinking back down after sending falls out of this for free.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    // Collapse first so scrollHeight reflects what the *current* content
    // actually needs, not whatever height was set for the previous content
    // (otherwise deleted text would never let the box shrink back down).
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [input]);

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

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMessages((prev) => [...prev, optimisticMessage]);
    setInput("");
    setPending(true);
    setError(null);

    try {
      const { responseText } = await sendAgentMessage({ sessionId, agent, message: content }, controller.signal);
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
      // A user-initiated stop rejects the fetch with AbortError — handleStop
      // already reset the UI, so this isn't a real error to surface.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setPending(false);
      abortControllerRef.current = null;
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
    setPending(false);
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

      <div className="border-t border-border p-2 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          rows={1}
          className="flex-1 border border-border rounded-sm px-2 py-1 text-sm outline-none resize-none leading-normal"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              // Shift+Enter falls through with no handling here, so the
              // browser's default textarea behavior (insert a newline)
              // happens on its own — nothing to call, nothing to prevent.
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={`Message ${AGENT_LABELS[agent]}...`}
          disabled={pending}
        />
        <button
          type="button"
          className="bg-primary text-surface rounded-sm px-3 py-1 text-sm disabled:opacity-50"
          onClick={pending ? handleStop : handleSend}
          disabled={!pending && !input.trim()}
        >
          {pending ? "Stop" : "Send"}
        </button>
      </div>
    </div>
  );
}
