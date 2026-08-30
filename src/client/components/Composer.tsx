import { type FormEvent, type KeyboardEvent, useRef, useEffect } from "react";
import { Send, CornerDownLeft, Lightbulb } from "lucide-react";

interface ComposerProps {
  message: string;
  onChange: (val: string) => void;
  onSubmit: (e: FormEvent) => void;
  isBusy: boolean;
  hasActiveSession: boolean;
  onQuickPrompt?: (prompt: string) => void;
}

const QUICK_PROMPTS = [
  "Unpack a complex architectural trade-off",
  "Reflect on my key focus areas for today",
  "Analyze a challenging product decision",
  "Document insights from a recent review",
];

export function Composer({
  message,
  onChange,
  onSubmit,
  isBusy,
  hasActiveSession,
  onQuickPrompt,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (message.trim() && !isBusy && hasActiveSession) {
        onSubmit(e);
      }
    }
  }

  return (
    <div className="sticky bottom-4 z-20 mx-auto w-full max-w-4xl px-4 sm:px-6">
      {/* Quick Prompts when field is empty and session is active */}
      {!message && hasActiveSession && !isBusy && (
        <div className="mb-2 flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400/70 whitespace-nowrap pl-1">
            <Lightbulb className="h-3 w-3" /> Prompts:
          </span>
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onQuickPrompt?.(prompt)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-[#0b1b17]/80 hover:bg-[#102721] px-3 py-1 text-xs text-zinc-300 hover:text-emerald-200 transition-all whitespace-nowrap backdrop-blur-xs"
            >
              <span>{prompt}</span>
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="relative flex flex-col rounded-2xl border border-emerald-500/25 bg-[#091512]/95 p-3.5 shadow-2xl backdrop-blur-xl transition-all focus-within:border-emerald-400/50 focus-within:ring-1 focus-within:ring-emerald-400/20"
      >
        <label htmlFor="journal-message-input" className="sr-only">
          Write a reflection message
        </label>
        <textarea
          id="journal-message-input"
          ref={textareaRef}
          value={message}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={8000}
          rows={1}
          placeholder={
            hasActiveSession
              ? "Share what you are thinking, exploring, or questioning... (Enter to send, Shift+Enter for newline)"
              : "Select or start a new reflection above to write..."
          }
          disabled={!hasActiveSession || isBusy}
          className="w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50 min-h-[44px] max-h-[200px]"
        />

        <div className="mt-2 flex items-center justify-between border-t border-emerald-500/10 pt-2.5">
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="font-mono text-[11px]">
              {message.length.toLocaleString()} / 8,000
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px]">
              <CornerDownLeft className="h-3 w-3" /> Enter to send
            </span>
          </div>

          <button
            type="submit"
            disabled={!hasActiveSession || isBusy || !message.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2 text-xs font-semibold text-emerald-950 shadow-md transition-all hover:from-emerald-400 hover:to-teal-300 hover:shadow-emerald-500/20 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]"
          >
            {isBusy ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-950 border-t-transparent" />
                <span>Reflecting...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span>Send</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
