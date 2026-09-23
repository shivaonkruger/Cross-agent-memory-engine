import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { ChatMessage } from "../types/shared";

// Inline code / code blocks need a tinted background that stays legible on
// both bubble variants — the user bubble is dark-on-light-text, the
// assistant bubble is the reverse, so a fixed color would vanish on one of
// them. `bg-current/10` keys off whatever text color is already active.
function buildMarkdownComponents(): Components {
  return {
    p: ({ children }) => <p className="leading-relaxed [&:not(:first-child)]:mt-2">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noreferrer" className="underline break-words">
        {children}
      </a>
    ),
    h1: ({ children }) => <h1 className="text-base font-semibold mt-3 mb-1">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-1">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-current/30 pl-3 my-2 opacity-80">{children}</blockquote>
    ),
    hr: () => <hr className="border-current/20 my-3" />,
    code: ({ className, children }) => {
      // react-markdown gives block-level code a `language-*` className;
      // inline code has none — that's the reliable signal to tell them apart.
      const isBlock = Boolean(className);
      if (!isBlock) {
        return (
          <code className="font-mono text-[0.85em] px-1 py-0.5 rounded-sm bg-current/10">
            {children}
          </code>
        );
      }
      return <code className="font-mono text-xs">{children}</code>;
    },
    pre: ({ children }) => (
      <pre className="font-mono text-xs bg-current/10 rounded-sm p-2 my-2 overflow-x-auto">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-2">
        <table className="text-xs border-collapse">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-current/20 px-2 py-1 text-left font-semibold">{children}</th>
    ),
    td: ({ children }) => <td className="border border-current/20 px-2 py-1">{children}</td>,
  };
}

const markdownComponents = buildMarkdownComponents();

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-md px-4 py-2 text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${
          isUser
            ? "bg-foreground text-surface"
            : "bg-surface text-foreground border border-border"
        }`}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
