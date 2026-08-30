import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { JournalEntry } from "../data/mockData";

interface CalendarViewProps {
  entries: JournalEntry[];
  onSelectEntry: (id: string) => void;
  onNewEntryForDate: (date: Date) => void;
}

export function CalendarView({ entries, onSelectEntry, onNewEntryForDate }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 3, 1)); // Default to April 2025 where rich entries reside

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthName = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  // Map of date string -> entries
  const entriesByDay = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const map: { [day: number]: JournalEntry[] } = {};
    for (const e of entries) {
      const d = new Date(e.createdAt);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(e);
      }
    }
    return map;
  }, [entries, currentDate]);

  function handlePrevMonth() {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function handleNextMonth() {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blankDays = Array.from({ length: firstDayIndex }, (_, i) => i);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[#fafbfc] p-6 sm:p-10 text-slate-800 transition-colors dark:bg-[#0b101b] dark:text-slate-100">
      <div className="mx-auto max-w-4xl w-full">
        {/* Month Navigation Bar */}
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {monthName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Browse reflections across time
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date())}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="mt-6 grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        {/* Calendar Grid */}
        <div className="mt-2 grid grid-cols-7 gap-2">
          {blankDays.map((_, idx) => (
            <div key={`blank-${idx}`} className="h-28 rounded-xl bg-transparent" />
          ))}

          {daysArray.map((day) => {
            const dayEntries = entriesByDay[day] || [];
            const hasEntries = dayEntries.length > 0;

            return (
              <div
                key={`day-${day}`}
                className={`group relative flex h-28 flex-col justify-between rounded-xl border p-2 transition-all ${
                  hasEntries
                    ? "border-sky-300/80 bg-white shadow-xs dark:border-sky-900/60 dark:bg-slate-900"
                    : "border-slate-200/60 bg-slate-50/50 hover:bg-white dark:border-slate-800/60 dark:bg-slate-900/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold ${
                      hasEntries
                        ? "text-sky-600 dark:text-sky-400"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {day}
                  </span>
                  {hasEntries && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white">
                      {dayEntries.length}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex-1 overflow-y-auto space-y-1">
                  {dayEntries.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onSelectEntry(e.id)}
                      className="w-full text-left truncate rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900/80 transition-colors"
                    >
                      {e.title}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => onNewEntryForDate(new Date(year, month, day))}
                  className="opacity-0 group-hover:opacity-100 flex items-center justify-center rounded bg-slate-200/80 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-sky-500 hover:text-white dark:bg-slate-800 dark:text-slate-300 transition-all"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
