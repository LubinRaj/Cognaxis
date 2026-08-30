import { useState } from "react";
import { Sparkles, Tag, Check, Copy, Shield, ChevronDown, ChevronUp } from "lucide-react";
import type { PersonalMemory } from "../../shared/schemas";

interface MemoryCardProps {
  summary: PersonalMemory;
}

export function MemoryCard({ summary }: MemoryCardProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  async function copySummary() {
    await navigator.clipboard.writeText(`${summary.title}\n\n${summary.summary}\n\nThemes: ${summary.themes.join(", ")}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-[#0e221c] to-[#0a1814] shadow-lg transition-all">
      <div className="flex items-center justify-between border-b border-emerald-500/15 bg-emerald-950/30 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-400 border border-emerald-400/25">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[11px] font-semibold tracking-wider text-emerald-400 uppercase">
              Derived Personal Memory
            </span>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Shield className="h-3 w-3 text-emerald-400" />
              <span>Permission-scoped • Authenticated UID Vault</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void copySummary()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-zinc-300 hover:text-white hover:bg-emerald-900/30 border border-emerald-500/20 transition-colors"
            title="Copy memory content"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="rounded-lg p-1 text-zinc-400 hover:text-zinc-200 hover:bg-emerald-900/30 transition-colors"
            aria-label={expanded ? "Collapse memory card" : "Expand memory card"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-5">
          <h4 className="text-base font-semibold text-zinc-100">{summary.title}</h4>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">
            {summary.summary}
          </p>

          {summary.themes.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5 pt-3 border-t border-emerald-500/10">
              <span className="text-[11px] font-medium text-emerald-400/80 mr-1 flex items-center gap-1">
                <Tag className="h-3 w-3" /> Themes:
              </span>
              {summary.themes.map((theme) => (
                <span
                  key={theme}
                  className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-300 font-medium"
                >
                  {theme}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
