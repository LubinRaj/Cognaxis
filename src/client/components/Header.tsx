import { Menu, Sparkles, Download, Trash2, ShieldCheck } from "lucide-react";
import type { SessionDetail } from "../../shared/schemas";

interface HeaderProps {
  session: SessionDetail | null;
  onOpenMobileMenu: () => void;
  onSummarize: () => void;
  onExport: () => void;
  onDelete: () => void;
  isBusy: boolean;
  canSummarize: boolean;
}

export function Header({
  session,
  onOpenMobileMenu,
  onSummarize,
  onExport,
  onDelete,
  isBusy,
  canSummarize,
}: HeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-emerald-500/15 bg-[#06110e]/80 px-4 py-3.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 lg:hidden"
          aria-label="Open sidebar navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              <ShieldCheck className="h-3 w-3" />
              Personal Scope
            </span>
            {session && (
              <span className="text-[11px] text-zinc-500 hidden sm:inline-block">
                Created {new Date(session.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
          <h1 className="mt-0.5 text-base font-semibold text-zinc-100 sm:text-lg">
            {session?.title ?? "Private Reflection Space"}
          </h1>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <button
          type="button"
          onClick={onSummarize}
          disabled={!session || isBusy || !canSummarize}
          title={
            !canSummarize
              ? "At least two messages are required to generate a memory summary"
              : "Generate an enduring structured memory summary with Gemini"
          }
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 hover:border-emerald-500/50 disabled:opacity-40 disabled:pointer-events-none"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Summarize</span>
        </button>

        <button
          type="button"
          onClick={onExport}
          disabled={!session || isBusy}
          title="Export reflection as Markdown or JSON"
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700/60 bg-[#0c1b18] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:bg-[#122723] hover:text-white disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={!session || isBusy}
          title="Delete reflection session"
          className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-all hover:bg-red-500/20 hover:border-red-500/40 disabled:opacity-40 disabled:pointer-events-none"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Delete</span>
        </button>
      </div>
    </header>
  );
}
