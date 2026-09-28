import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "../types/shared";

interface SessionListItemProps {
  session: Session;
  onDelete: (sessionId: string) => void;
  onRename: (sessionId: string, name: string) => void;
}

export function SessionListItem({ session, onDelete, onRename }: SessionListItemProps) {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(session.name);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter commits and then blurs, which would otherwise fire onBlur again
  // and double-commit (or Escape cancels then blurs) — this ref makes the
  // first of the two win, synchronously, without waiting on state.
  const settledRef = useRef(false);

  const formatted = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(session.createdAt));

  function startEditing() {
    settledRef.current = false;
    setDraftName(session.name);
    setIsEditing(true);
    // Focus lands next tick, once the input has actually mounted.
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitRename() {
    if (settledRef.current) return;
    settledRef.current = true;
    setIsEditing(false);
    const trimmed = draftName.trim();
    // Empty name falls back to the previous name rather than saving blank.
    if (!trimmed || trimmed === session.name) {
      return;
    }
    onRename(session.sessionId, trimmed);
  }

  function cancelEditing() {
    settledRef.current = true;
    setIsEditing(false);
  }

  return (
    <div className="w-full flex items-center gap-2 border border-border rounded-md hover:bg-border/30 transition-colors">
      {isEditing ? (
        <div className="flex-1 min-w-0 px-4 py-2">
          <input
            ref={inputRef}
            className="w-full border border-border rounded-sm px-2 py-1 text-sm outline-none bg-surface"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEditing();
              }
            }}
            onBlur={commitRename}
          />
        </div>
      ) : (
        <button
          type="button"
          onDoubleClick={(e) => {
            e.stopPropagation();
            startEditing();
          }}
          onClick={() => navigate(`/session/${session.sessionId}`)}
          className="flex-1 min-w-0 text-left px-4 py-3"
        >
          <div className="text-sm text-foreground truncate">{session.name}</div>
          <div className="font-mono text-xs text-muted truncate">{formatted}</div>
        </button>
      )}

      {!isEditing && (
        <button
          type="button"
          onClick={startEditing}
          aria-label="Rename session"
          title="Rename session"
          className="shrink-0 p-1.5 rounded-sm text-muted hover:text-foreground hover:bg-border/50 transition-colors"
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
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
          </svg>
        </button>
      )}

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
