import { useState } from "react";
import { motion } from "motion/react";
import { Sparkles, User, Copy, Check, Compass } from "lucide-react";
import type { JournalMessage } from "../../shared/schemas";

interface ConversationViewProps {
  messages: JournalMessage[];
  isBusy: boolean;
  isLoading: boolean;
  hasActiveSession: boolean;
  onStartSession: () => void;
}

export function ConversationView({
  messages,
  isBusy,
  isLoading,
  hasActiveSession,
  onStartSession,
}: ConversationViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyMessage(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          <p className="text-sm font-medium text-zinc-400">Loading your private workspace...</p>
        </div>
      </div>
    );
  }

  if (!hasActiveSession) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-20 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
          <Compass className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
          A Private Place to Reflect & Think
        </h2>
        <p className="mt-2.5 max-w-md text-sm text-zinc-400 leading-relaxed">
          Deepen your insights, evaluate critical decisions, and build permission-scoped personal memories
          protected by server-side Gemini architecture.
        </p>
        <button
          type="button"
          onClick={onStartSession}
          disabled={isBusy}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg hover:from-emerald-400 hover:to-teal-300 transition-all hover:shadow-emerald-500/20"
        >
          <Sparkles className="h-4 w-4" />
          <span>Start New Reflection</span>
        </button>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-16 px-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Sparkles className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-zinc-200">This reflection is empty</h3>
        <p className="mt-1 max-w-sm text-sm text-zinc-400">
          Type a thought below or choose a prompt to begin exploring with your personal intelligence partner.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6 pb-6 pt-2">
      {messages.map((msg, index) => {
        const isUser = msg.role === "user";
        return (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.3) }}
            className={`group flex gap-3 sm:gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}
          >
            {/* Avatar */}
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold shadow-sm ${
                isUser
                  ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/30"
                  : "bg-[#102420] text-emerald-400 border border-emerald-500/25"
              }`}
            >
              {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </div>

            {/* Bubble */}
            <div className={`relative max-w-[85%] sm:max-w-[78%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  {isUser ? "You" : "Cognaxis Intelligence"}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              <div
                className={`relative rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  isUser
                    ? "bg-[#122e26] text-emerald-50 border border-emerald-500/25 shadow-md rounded-tr-none"
                    : "bg-[#0b1715] text-zinc-200 border border-emerald-500/15 shadow-sm rounded-tl-none"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {/* Copy message button */}
                <button
                  type="button"
                  onClick={() => void copyMessage(msg.id, msg.content)}
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 rounded-md p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all"
                  title="Copy text"
                >
                  {copiedId === msg.id ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        );
      })}

      {/* Thinking state */}
      {isBusy && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-3 sm:gap-4 flex-row"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#102420] text-emerald-400 border border-emerald-500/25">
            <Sparkles className="h-4 w-4 animate-pulse" />
          </div>
          <div className="rounded-2xl rounded-tl-none border border-emerald-500/15 bg-[#0b1715] px-4 py-3 text-sm text-zinc-300">
            <div className="flex items-center gap-2">
              <div className="flex space-x-1">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.3s]" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.15s]" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" />
              </div>
              <span className="text-xs text-zinc-400 font-medium">Cognaxis is thinking & analyzing...</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
