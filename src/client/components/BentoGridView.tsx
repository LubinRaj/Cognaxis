import { Sparkles, ArrowRight } from "lucide-react";
import type { JournalEntry } from "../data/mockData";

interface BentoGridViewProps {
  entries: JournalEntry[];
  onSelectEntry: (id: string) => void;
  onNewEntry: () => void;
}

export function BentoGridView({ entries, onSelectEntry }: BentoGridViewProps) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[#fafbfc] p-6 sm:p-10 text-slate-800 transition-colors dark:bg-[#0b101b] dark:text-slate-100">
      <div className="mx-auto max-w-5xl w-full">
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              Bento Timeline
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Visual overview of all memories, insights, and reflections
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map((entry) => {
            const firstPhoto = entry.photos?.[0];
            const d = new Date(entry.createdAt);

            return (
              <div
                key={entry.id}
                onClick={() => onSelectEntry(entry.id)}
                className="group flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all hover:-translate-y-1 hover:border-sky-400 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-500"
              >
                <div>
                  {firstPhoto && (
                    <div className="mb-3.5 -mx-5 -mt-5 h-44 overflow-hidden bg-slate-100 dark:bg-slate-800">
                      <img
                        src={firstPhoto.url}
                        alt=""
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      {d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    {entry.mood && (
                      <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {entry.mood.emoji} {entry.mood.label}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-2.5 text-base font-bold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                    {entry.title}
                  </h3>

                  <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {entry.body}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    {entry.memorySummary ? (
                      <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        <Sparkles className="h-3 w-3" /> Synthesized
                      </span>
                    ) : (
                      <span>{entry.tags?.[0] ? `#${entry.tags[0]}` : "Journal"}</span>
                    )}
                  </div>

                  <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-sky-600 dark:group-hover:text-sky-400 group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
