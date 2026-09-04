import { useCallback, useEffect, useRef, useState } from "react";
import type { JournalMessage } from "../../../shared/schemas";
import { MaterialIcon } from "../MaterialIcon";
import { IconButton } from "../ui/IconButton";

const NEAR_BOTTOM_PX = 120;

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type ConversationThreadProps = {
  messages: JournalMessage[];
  pending: boolean;
  onCopyResult: (message: string) => void;
};

export function ConversationThread({ messages, pending, onCopyResult }: ConversationThreadProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasNearBottom = useRef(true);

  // Scrolling only follows new content when the reader was already at the bottom, so nobody is
  // pulled away from an older message they are reading.
  const trackScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    wasNearBottom.current = distance < NEAR_BOTTOM_PX;
  }, []);

  const lastMessage = messages[messages.length - 1];
  const lastContentLength = lastMessage?.content?.length ?? 0;

  useEffect(() => {
    if (!wasNearBottom.current) return;
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, pending, lastContentLength]);

  return (
    // One intentional scroll container owns the message region.
    <div
      ref={scrollRef}
      onScroll={trackScroll}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-4 py-6 sm:px-6">
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} onCopyResult={onCopyResult} />
        ))}

        {pending && !messages.some((m) => m.role === "model" && m.id.startsWith("pending-")) && (
          <div className="flex items-center gap-3" data-testid="response-pending">
            <span
              aria-hidden="true"
              className="bg-primary-container text-on-primary-container flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            >
              <MaterialIcon name="psychiatry" size={18} />
            </span>
            <p className="text-on-surface-variant text-sm" role="status">
              Cognaxis is responding…
            </p>
          </div>
        )}

        <div ref={endRef} aria-hidden="true" />
      </div>
    </div>
  );
}

function MessageRow({
  message,
  onCopyResult,
}: {
  message: JournalMessage;
  onCopyResult: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isPending = message.id.startsWith("pending-");
  const isPendingAssistant = !isUser && isPending;
  const showTypingPlaceholder = isPendingAssistant && message.content === "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      onCopyResult("Copied");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      onCopyResult("Copying is not available in this browser.");
    }
  }

  return (
    <article
      className={`group flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}
      aria-label={isUser ? "Your message" : "Message from Cognaxis"}
      data-testid={isPendingAssistant ? "response-pending" : undefined}
    >
      <div className={`flex max-w-[92%] items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
        {!isUser && (
          <span
            aria-hidden="true"
            className="bg-primary-container text-on-primary-container mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          >
            <MaterialIcon name="psychiatry" size={18} />
          </span>
        )}

        <div
          // break-words keeps an unbroken URL or token from forcing horizontal page scrolling.
          className={`min-w-0 rounded-2xl px-4 py-3 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap ${
            isUser
              ? "bg-secondary-container text-on-secondary-container rounded-tr-md"
              : "bg-surface-container text-on-surface rounded-tl-md"
          } ${isPending ? "opacity-70" : ""}`}
        >
          {showTypingPlaceholder ? (
            <span className="text-on-surface-variant text-sm inline-flex items-center gap-2" role="status">
              Cognaxis is responding…
            </span>
          ) : (
            message.content
          )}
        </div>
      </div>

      <div
        className={`flex items-center gap-2 text-xs ${isUser ? "flex-row-reverse pr-1" : "pl-11"}`}
      >
        <span className="text-on-surface-variant">
          {isUser ? "You" : "Cognaxis"}
          {isPending && (isUser ? " · Sending…" : " · Responding…")}
        </span>
        {!isPending && (
          <>
            <span className="text-on-surface-variant hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <time
              dateTime={message.createdAt}
              className="text-on-surface-variant hidden sm:inline"
            >
              {formatTime(message.createdAt)}
            </time>
            <IconButton
              icon={copied ? "check" : "content_copy"}
              label={copied ? "Message copied" : "Copy message"}
              size={16}
              onClick={() => void copy()}
              // Touch devices have no hover, so the affordance stays visible on small screens.
              className="h-9 w-9 transition-opacity duration-(--duration-feedback) sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            />
          </>
        )}
      </div>
    </article>
  );
}
