import { useNavigate } from "react-router-dom";
import type { Session } from "../types/shared";

interface SessionListItemProps {
  session: Session;
  onDelete: (sessionId: string) => void;
}

export function SessionListItem({ session, onDelete }: SessionListItemProps) {
  const navigate = useNavigate();

  const formatted = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(session.createdAt));

  return (
    <div className="w-full flex items-center gap-2 border border-border rounded-md hover:bg-border/30 transition-colors">
      <button
        type="button"
        onClick={() => navigate(`/session/${session.sessionId}`)}
        className="flex-1 min-w-0 text-left px-4 py-3"
      >
        <div className="font-mono text-xs text-muted truncate">{session.sessionId}</div>
        <div className="text-sm text-foreground">{formatted}</div>
      </button>
      <button
        type="button"
        onClick={() => onDelete(session.sessionId)}
        aria-label="Delete session"
        title="Delete session"
        className="shrink-0 mr-3 p-1.5 rounded-sm text-muted hover:text-red-600 hover:bg-red-600/10 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
    </div>
  );
}
