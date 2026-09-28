import { useEffect, useRef, useState } from "react";

interface NewSessionModalProps {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

const DEFAULT_NAME = "New session";

export function NewSessionModal({ onConfirm, onCancel }: NewSessionModalProps) {
  const [name, setName] = useState(DEFAULT_NAME);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  function handleConfirm() {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-session-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-surface border border-border rounded-md p-5"
      >
        <h2 id="new-session-dialog-title" className="text-base font-medium text-foreground">
          Name this session
        </h2>
        <input
          ref={inputRef}
          className="w-full mt-3 border border-border rounded-sm px-2 py-1.5 text-sm outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleConfirm();
            }
          }}
        />
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-sm border border-border text-foreground hover:bg-border/30 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!name.trim()}
            className="px-3 py-1.5 text-sm rounded-sm bg-primary text-surface disabled:opacity-50 transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
