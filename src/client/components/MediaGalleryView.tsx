import { useMemo } from "react";
import { Image as ImageIcon, ArrowUpRight } from "lucide-react";
import type { JournalEntry } from "../data/mockData";

interface MediaGalleryViewProps {
  entries: JournalEntry[];
  onSelectEntry: (id: string) => void;
}

export function MediaGalleryView({ entries, onSelectEntry }: MediaGalleryViewProps) {
  const allPhotos = useMemo(() => {
    const list: Array<{
      id: string;
      url: string;
      caption?: string;
      entryId: string;
      entryTitle: string;
      location?: string;
      createdAt: string;
    }> = [];

    for (const e of entries) {
      if (e.photos && e.photos.length > 0) {
        for (const p of e.photos) {
          list.push({
            id: p.id,
            url: p.url,
            caption: p.caption,
            entryId: e.id,
            entryTitle: e.title,
            location: e.location,
            createdAt: e.createdAt,
          });
        }
      }
    }
    return list;
  }, [entries]);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[#fafbfc] p-6 sm:p-10 text-slate-800 transition-colors dark:bg-[#0b101b] dark:text-slate-100">
      <div className="mx-auto max-w-5xl w-full">
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              <ImageIcon className="h-4 w-4" />
              <span>Visual Vault</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              Media Library
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {allPhotos.length} moments and photos captured across your journal
            </p>
          </div>
        </div>

        {allPhotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ImageIcon className="h-12 w-12 text-slate-300 dark:text-slate-700" />
            <h3 className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
              No Photos Attached Yet
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Attach curated photos while writing your reflections to build your visual gallery.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {allPhotos.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectEntry(item.entryId)}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="aspect-4/3 overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <img
                    src={item.url}
                    alt={item.caption || item.entryTitle}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="truncate text-xs font-bold text-slate-900 dark:text-white">
                      {item.entryTitle}
                    </h4>
                    <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-sky-500 transition-colors" />
                  </div>

                  {item.caption && (
                    <p className="mt-1 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {item.caption}
                    </p>
                  )}

                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span>
                      {new Date(item.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {item.location && <span className="truncate max-w-[120px]">{item.location}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
