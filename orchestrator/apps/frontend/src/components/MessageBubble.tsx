import type { ChatMessage } from "../types/shared";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-md px-4 py-2 text-sm ${
          isUser
            ? "bg-foreground text-surface"
            : "bg-surface text-foreground border border-border"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
