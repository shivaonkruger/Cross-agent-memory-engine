import { useNavigate } from "react-router-dom";
import type { Session } from "../types/shared";

export function SessionListItem({ session }: { session: Session }) {
  const navigate = useNavigate();

  const formatted = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(session.createdAt));

  return (
    <button
      type="button"
      onClick={() => navigate(`/session/${session.sessionId}`)}
      className="w-full text-left border border-border rounded-md px-4 py-3 hover:bg-border/30 transition-colors"
    >
      <div className="font-mono text-xs text-muted">{session.sessionId}</div>
      <div className="text-sm text-foreground">{formatted}</div>
    </button>
  );
}
