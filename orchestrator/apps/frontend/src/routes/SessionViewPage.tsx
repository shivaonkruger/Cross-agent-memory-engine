import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSessionMessages } from "../api/client";
import { AgentPanel } from "../components/AgentPanel";
import type { Agent, ChatMessage } from "../types/shared";

const AGENTS: Agent[] = ["claude", "gpt4", "gemini"];

export function SessionViewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [messagesByAgent, setMessagesByAgent] = useState<Record<Agent, ChatMessage[]> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    getSessionMessages(sessionId)
      .then((messages) => {
        const grouped: Record<Agent, ChatMessage[]> = { claude: [], gpt4: [], gemini: [] };
        for (const message of messages) {
          grouped[message.agent].push(message);
        }
        setMessagesByAgent(grouped);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load session"));
  }, [sessionId]);

  if (!sessionId) {
    return null;
  }

  if (error) {
    return <p className="text-sm text-red-600 p-6">{error}</p>;
  }

  if (!messagesByAgent) {
    return <p className="text-sm text-muted p-6">Loading...</p>;
  }

  return (
    <div className="h-screen p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      {AGENTS.map((agent) => (
        <AgentPanel
          key={agent}
          agent={agent}
          sessionId={sessionId}
          initialMessages={messagesByAgent[agent]}
        />
      ))}
    </div>
  );
}
