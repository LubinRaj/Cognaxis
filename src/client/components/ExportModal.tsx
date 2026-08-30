import { useState } from "react";
import { Download, Check, X } from "lucide-react";
import type { JournalEntry } from "../data/mockData";
import type { SessionDetail, PersonalMemory } from "../../shared/schemas";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry?: JournalEntry | null;
  allEntries?: JournalEntry[];
  session?: SessionDetail | null;
  summary?: PersonalMemory | null;
}

export function ExportModal({
  isOpen,
  onClose,
  entry,
  allEntries = [],
  session,
  summary,
}: ExportModalProps) {
  const [exportScope, setExportScope] = useState<"current" | "all">("current");
  const [exportFormat, setExportFormat] = useState<"markdown" | "json" | "text">("markdown");
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen) return null;

  function generateExportContent(): string {
    if (session) {
      if (exportFormat === "json") {
        return JSON.stringify({ session, summary }, null, 2);
      }
      let md = `# ${session.title}\n\n*Date: ${new Date(session.createdAt).toLocaleString()}*\n\n---\n\n`;
      if (session.messages?.length) {
        md += `### Conversation\n\n`;
        session.messages.forEach((m) => {
          md += `**${m.role === "user" ? "You" : "Cognaxis"}:** ${m.content}\n\n`;
        });
      }
      if (summary) {
        md += `### Memory Synthesis\n\n${summary.summary}\n\n`;
      }
      return md;
    }

    const entriesToExport = exportScope === "current" && entry ? [entry] : allEntries.length > 0 ? allEntries : entry ? [entry] : [];

    if (exportFormat === "json") {
      return JSON.stringify(entriesToExport, null, 2);
    }

    if (exportFormat === "markdown") {
      return entriesToExport
        .map((e) => {
          let md = `# ${e.title}\n\n`;
          md += `*Date: ${new Date(e.createdAt).toLocaleString()}*\n`;
          if (e.location) md += `*Location: ${e.location}*\n`;
          if (e.tags?.length) md += `*Tags: ${e.tags.map((t) => `#${t}`).join(" ")}*\n`;
          md += `\n---\n\n${e.body}\n\n`;

          if (e.memorySummary) {
            md += `### AI Memory Synthesis\n\n`;
            md += `${e.memorySummary.summary}\n\n`;
            if (e.memorySummary.themes?.length) {
              md += `**Themes:** ${e.memorySummary.themes.join(", ")}\n\n`;
            }
          }

          if (e.messages?.length) {
            md += `### Reflection Partner Dialogue\n\n`;
            e.messages.forEach((m) => {
              md += `**${m.role === "user" ? "You" : "Cognaxis"}:** ${m.content}\n\n`;
            });
          }

          return md;
        })
        .join("\n\n=========================================\n\n");
    }

    // Plain text
    return entriesToExport
      .map((e) => `${e.title}\n${e.createdAt}\n\n${e.body}`)
      .join("\n\n------------------------\n\n");
  }

  function handleDownload() {
    const content = generateExportContent();
    const ext = exportFormat === "json" ? "json" : exportFormat === "markdown" ? "md" : "txt";
    const filename = `cognaxis-journal-export-${Date.now()}.${ext}`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  }

  function handleCopy() {
    const content = generateExportContent();
    void navigator.clipboard.writeText(content).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0f172a] text-slate-800 dark:text-slate-100 transition-all animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-sky-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Export Journal</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4 text-xs">
          {/* Scope Selector */}
          {!session && (
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300">Export Scope</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExportScope("current")}
                  disabled={!entry}
                  className={`rounded-xl border p-2.5 font-semibold text-center transition-all ${
                    exportScope === "current"
                      ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  Current Reflection
                </button>
                <button
                  type="button"
                  onClick={() => setExportScope("all")}
                  className={`rounded-xl border p-2.5 font-semibold text-center transition-all ${
                    exportScope === "all"
                      ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  All Reflections ({allEntries.length})
                </button>
              </div>
            </div>
          )}

          {/* Format Selector */}
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300">Format</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(["markdown", "json", "text"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setExportFormat(fmt)}
                  className={`rounded-xl border p-2 text-center uppercase tracking-wider font-bold text-[10px] transition-all ${
                    exportFormat === fmt
                      ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : null}
            <span>{isCopied ? "Copied" : "Copy to Clipboard"}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download File</span>
          </button>
        </div>
      </div>
    </div>
  );
}
