import {
  BookOpen,
  Calendar,
  Clock,
  Compass,
  Image as ImageIcon,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Sparkles,
} from "lucide-react";
import type { JournalEntry } from "../data/mockData";

export type NavSection = "all" | "today" | "on-this-day" | "guides" | "gallery" | "trash";

interface MacNavSidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  entries: JournalEntry[];
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onNewEntry: () => void;
  onOpenSettings: () => void;
}

export function MacNavSidebar({
  activeSection,
  onSelectSection,
  entries,
  theme,
  onToggleTheme,
  onNewEntry,
  onOpenSettings,
}: MacNavSidebarProps) {
  const activeEntriesCount = entries.filter((e) => e.folder !== "Trash").length;
  const trashCount = entries.filter((e) => e.folder === "Trash").length;
  const totalPhotosCount = entries.reduce((acc, e) => acc + (e.photos?.length || 0), 0);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-slate-200/80 bg-[#f6f8fa]/95 p-3 text-slate-700 backdrop-blur-xl transition-colors dark:border-slate-800/80 dark:bg-[#0c1322]/95 dark:text-slate-300">
      {/* macOS Window Controls + App Title */}
      <div className="flex items-center justify-between px-2 pt-1 pb-3">
        {/* macOS Traffic Lights */}
        <div className="flex items-center gap-2 group cursor-pointer">
          <span className="h-3 w-3 rounded-full bg-[#ff5f56] border border-[#e0443e] shadow-xs group-hover:opacity-90 transition-opacity" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e] border border-[#dea123] shadow-xs group-hover:opacity-90 transition-opacity" />
          <span className="h-3 w-3 rounded-full bg-[#27c93f] border border-[#1aab29] shadow-xs group-hover:opacity-90 transition-opacity" />
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/80 bg-white/80 text-slate-600 shadow-xs hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700/60 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 transition-all"
        >
          {theme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5 text-amber-400" />}
        </button>
      </div>

      {/* New Entry Primary Action */}
      <button
        type="button"
        onClick={onNewEntry}
        className="mt-2 mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 active:scale-[0.98] transition-all dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950"
      >
        <Plus className="h-4 w-4" />
        <span>New Reflection</span>
      </button>

      {/* Navigation Groups */}
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto text-xs font-medium">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Personal Journal
        </div>

        <button
          type="button"
          onClick={() => onSelectSection("today")}
          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-all ${
            activeSection === "today"
              ? "bg-sky-600 text-white font-semibold shadow-xs dark:bg-sky-500 dark:text-slate-950"
              : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Calendar className="h-4 w-4" />
            <span>Today</span>
          </div>
          <span className="text-[10px] opacity-70">
            {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectSection("on-this-day")}
          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-all ${
            activeSection === "on-this-day"
              ? "bg-sky-600 text-white font-semibold shadow-xs dark:bg-sky-500 dark:text-slate-950"
              : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4" />
            <span>On This Day</span>
          </div>
          <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            3
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectSection("all")}
          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-all ${
            activeSection === "all"
              ? "bg-sky-600 text-white font-semibold shadow-xs dark:bg-sky-500 dark:text-slate-950"
              : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-4 w-4" />
            <span>All Journals</span>
          </div>
          <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {activeEntriesCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectSection("guides")}
          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-all ${
            activeSection === "guides"
              ? "bg-sky-600 text-white font-semibold shadow-xs dark:bg-sky-500 dark:text-slate-950"
              : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Compass className="h-4 w-4 text-amber-500 dark:text-amber-400" />
            <span>Guides & Prompts</span>
          </div>
          <span className="flex items-center gap-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-300">
            <Sparkles className="h-2.5 w-2.5" /> 8
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectSection("gallery")}
          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-all ${
            activeSection === "gallery"
              ? "bg-sky-600 text-white font-semibold shadow-xs dark:bg-sky-500 dark:text-slate-950"
              : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <ImageIcon className="h-4 w-4" />
            <span>Media Library</span>
          </div>
          <span className="text-[10px] text-slate-400">{totalPhotosCount}</span>
        </button>

        <div className="mt-4 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Organization & System
        </div>

        <button
          type="button"
          onClick={() => onSelectSection("trash")}
          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-all ${
            activeSection === "trash"
              ? "bg-sky-600 text-white font-semibold shadow-xs dark:bg-sky-500 dark:text-slate-950"
              : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Trash2 className="h-4 w-4" />
            <span>Trash</span>
          </div>
          {trashCount > 0 && (
            <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {trashCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 transition-all dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white"
        >
          <div className="flex items-center gap-2.5">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </div>
        </button>
      </div>

      {/* Bottom Vault Status Card */}
      <div className="mt-auto border-t border-slate-200/80 pt-3 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/70 p-2.5 border border-slate-200/60 shadow-xs dark:bg-slate-900/70 dark:border-slate-800/60">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 font-bold text-xs border border-sky-500/20 dark:bg-sky-500/20 dark:text-sky-300">
            C
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                Personal Vault
              </span>
              <ShieldCheck className="h-3 w-3 text-sky-500 shrink-0" />
            </div>
            <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">Private Cloud Vault</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
