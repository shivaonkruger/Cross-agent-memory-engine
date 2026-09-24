import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSession, deleteSession, listSessions } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SessionListItem } from "../components/SessionListItem";
import { useAuth } from "../context/AuthContext";
import type { Session } from "../types/shared";

export function SessionListPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load sessions"))
      .finally(() => setLoading(false));
  }, []);

  async function handleNewSession() {
    try {
      const session = await createSession();
      navigate(`/session/${session.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    }
  }

  function handleRequestDelete(sessionId: string) {
    // Deletion is soft (deleted_at) server-side, but there's no undo in the
    // UI, so confirm — via an in-UI dialog, not a browser alert() — before
    // it disappears from the list.
    setPendingDeleteId(sessionId);
  }

  async function handleConfirmDelete() {
    const sessionId = pendingDeleteId;
    if (!sessionId) return;
    setPendingDeleteId(null);
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-light">Sessions</h1>
        <button
          type="button"
          onClick={handleNewSession}
          className="bg-primary text-surface rounded-sm px-4 py-2 text-sm"
        >
          New session
        </button>
      </div>

      <div className="flex items-center justify-between mb-8 text-sm text-muted">
        <span>{user?.email}</span>
        <button type="button" onClick={signOut} className="underline hover:text-foreground">
          Sign out
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted">No sessions yet. Create one to get started.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => (
            <SessionListItem
              key={session.sessionId}
              session={session}
              onDelete={handleRequestDelete}
            />
          ))}
        </div>
      )}

      {pendingDeleteId && (
        <ConfirmDialog
          title="Delete this session?"
          description="This can't be undone from here."
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
