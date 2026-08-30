import { useState, useMemo } from "react";
import {
  List,
  LayoutGrid,
  Calendar as CalendarIcon,
  Mic,
  Search,
  Plus,
  Sparkles,
  X,
  Pin,
} from "lucide-react";
import type { JournalEntry } from "../data/mockData";

export type TimelineViewMode = "list" | "grid" | "calendar" | "audio";

interface TimelineColumnProps {
  entries: JournalEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onNewEntry: () => void;
  viewMode: TimelineViewMode;
  onChangeViewMode: (mode: TimelineViewMode) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

function formatDateBadge(dateStr: string) {
  const d = new Date(dateStr);
  const dayName = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const dayNum = String(d.getDate()).padStart(2, "0");
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const monthYear = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return { dayName, dayNum, time, monthYear, rawDate: d };
}

export function TimelineColumn({
  entries,
  selectedEntryId,
  onSelectEntry,
  onNewEntry,
  viewMode,
  onChangeViewMode,
  searchQuery,
  onSearchChange,
  selectedTag,
  onSelectTag,
}: TimelineColumnProps) {
  const [showSearchInput, setShowSearchInput] = useState(false);

  // Group entries by Month Year
  const groupedEntries = useMemo(() => {
    let filtered = entries;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.body.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)) ||
          e.location?.toLowerCase().includes(q)
      );
    }

    if (selectedTag) {
      filtered = filtered.filter((e) => e.tags.includes(selectedTag));
    }

    const groups: { [key: string]: JournalEntry[] } = {};
    for (const entry of filtered) {
      const { monthYear } = formatDateBadge(entry.createdAt);
      if (!groups[monthYear]) {
        groups[monthYear] = [];
      }
      groups[monthYear].push(entry);
    }

    return groups;
  }, [entries, searchQuery, selectedTag]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      e.tags?.forEach((t) => set.add(t));
    }
    return Array.from(set);
  }, [entries]);

  return (
    <div className="flex h-full w-80 sm:w-88 shrink-0 flex-col border-r border-slate-200/80 bg-white/90 backdrop-blur-xl transition-colors dark:border-slate-800/80 dark:bg-[#0e1626]/90">
      {/* Top Toolbar - Apple Day One style view switchers */}
      <div className="flex items-center justify-between border-b border-slate-200/70 px-3 py-2 dark:border-slate-800/70">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChangeViewMode("list")}
            title="List View"
            className={`flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
              viewMode === "list"
                ? "bg-slate-200/80 text-slate-900 font-semibold dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
            }`}
          >
            <List className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onChangeViewMode("grid")}
            title="Bento Grid View"
            className={`flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
              viewMode === "grid"
                ? "bg-slate-200/80 text-slate-900 font-semibold dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onChangeViewMode("calendar")}
            title="Calendar View"
            className={`flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
              viewMode === "calendar"
                ? "bg-slate-200/80 text-slate-900 font-semibold dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onChangeViewMode("audio")}
            title="Voice & Audio Memos"
            className={`flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
              viewMode === "audio"
                ? "bg-slate-200/80 text-slate-900 font-semibold dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
            }`}
          >
            <Mic className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowSearchInput(!showSearchInput)}
            title="Search Reflections"
            className={`flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
              showSearchInput || searchQuery
                ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50"
            }`}
          >
            <Search className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onNewEntry}
            title="New Reflection Entry"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-600/10 text-sky-600 hover:bg-sky-600 hover:text-white dark:bg-sky-500/20 dark:text-sky-400 dark:hover:bg-sky-500 dark:hover:text-slate-950 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Search and Tag Filtering Header */}
      {(showSearchInput || searchQuery || selectedTag) && (
        <div className="border-b border-slate-200/70 p-2.5 dark:border-slate-800/70 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search in title, thoughts, tags..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Tag Filter Chips */}
          {allTags.length > 0 && (
            <div className="mt-2 flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
              <button
                type="button"
                onClick={() => onSelectTag(null)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
                  selectedTag === null
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                    : "bg-slate-200/70 text-slate-600 hover:bg-slate-300/70 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectTag(selectedTag === tag ? null : tag)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap transition-all ${
                    selectedTag === tag
                      ? "bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950"
                      : "bg-slate-200/70 text-slate-600 hover:bg-slate-300/70 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Entries List */}
      <div className="flex-1 overflow-y-auto p-2">
        {Object.keys(groupedEntries).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
              <Search className="h-5 w-5" />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
              No matching reflections
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Try adjusting your search query or clear the filter.
            </p>
          </div>
        ) : (
          Object.entries(groupedEntries).map(([monthYear, group]) => (
            <div key={monthYear} className="mb-4">
              {/* Group Month & Year Header */}
              <div className="sticky top-0 z-10 bg-white/95 px-2 py-1.5 text-xs font-bold tracking-tight text-slate-900 backdrop-blur-xs dark:bg-[#0e1626]/95 dark:text-white">
                {monthYear}
              </div>

              <div className="mt-1 space-y-1.5">
                {group.map((entry) => {
                  const isSelected = selectedEntryId === entry.id;
                  const { dayName, dayNum, time } = formatDateBadge(entry.createdAt);
                  const firstPhoto = entry.photos?.[0];

                  return (
                    <div
                      key={entry.id}
                      onClick={() => onSelectEntry(entry.id)}
                      className={`group relative flex cursor-pointer gap-2.5 rounded-xl p-2.5 transition-all select-none ${
                        isSelected
                          ? "bg-sky-500 text-white shadow-md dark:bg-sky-600"
                          : "hover:bg-slate-100/90 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {/* Left Date Card Badge */}
                      <div
                        className={`flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-lg border text-center transition-colors ${
                          isSelected
                            ? "border-sky-300/40 bg-sky-600/60 text-white dark:border-sky-400/40"
                            : "border-slate-200/80 bg-slate-50 text-slate-800 dark:border-slate-700/60 dark:bg-slate-800/80 dark:text-slate-200"
                        }`}
                      >
                        <span
                          className={`text-[9px] font-bold tracking-wider ${
                            isSelected ? "text-sky-100" : "text-slate-400 dark:text-slate-400"
                          }`}
                        >
                          {dayName}
                        </span>
                        <span className="text-base font-extrabold leading-none">{dayNum}</span>
                      </div>

                      {/* Middle Content */}
                      <div className="flex min-w-0 flex-1 flex-col justify-center">
                        <div className="flex items-center justify-between gap-1">
                          <h4
                            className={`truncate text-xs font-semibold ${
                              isSelected ? "text-white" : "text-slate-900 dark:text-white"
                            }`}
                          >
                            {entry.title || "Untitled Reflection"}
                          </h4>
                          {entry.isPinned && (
                            <Pin
                              className={`h-2.5 w-2.5 shrink-0 rotate-45 ${
                                isSelected ? "text-white" : "text-sky-500"
                              }`}
                            />
                          )}
                        </div>

                        <p
                          className={`line-clamp-2 text-[11px] leading-snug mt-0.5 ${
                            isSelected
                              ? "text-sky-100"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {entry.body.replace(/\n+/g, " ") || "No additional text written..."}
                        </p>

                        <div
                          className={`mt-1.5 flex items-center gap-2 text-[9px] font-medium ${
                            isSelected
                              ? "text-sky-200"
                              : "text-slate-400 dark:text-slate-500"
                          }`}
                        >
                          <span>{time}</span>
                          {entry.location && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[90px]">
                                {entry.location.split(",")[0]}
                              </span>
                            </>
                          )}
                          {entry.memorySummary && (
                            <span
                              className={`flex items-center gap-0.5 ml-auto font-semibold ${
                                isSelected ? "text-white" : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              <Sparkles className="h-2.5 w-2.5" />
                              <span>AI</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Thumbnail Image if exists */}
                      {firstPhoto && (
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg shadow-xs">
                          <img
                            src={firstPhoto.url}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
