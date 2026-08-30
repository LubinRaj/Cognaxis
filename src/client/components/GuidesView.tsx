import { useState, useMemo } from "react";
import {
  Clock,
  ArrowRight,
  Search,
  Compass,
} from "lucide-react";
import {
  GUIDE_COLLECTIONS,
  MOCK_GUIDES,
  type GuideCard,
} from "../data/guidesData";

interface GuidesViewProps {
  onStartGuide: (guide: GuideCard) => void;
  onBackToJournal: () => void;
}

export function GuidesView({ onStartGuide }: GuidesViewProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredGuides = useMemo(() => {
    return MOCK_GUIDES.filter((g) => {
      const matchCategory = selectedCategory === "all" || g.category === selectedCategory;
      const matchSearch =
        !searchQuery.trim() ||
        g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.author.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [selectedCategory, searchQuery]);

  const featuredGuides = useMemo(() => {
    return MOCK_GUIDES.filter((g) => g.featured);
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[#fafbfc] p-6 sm:p-10 text-slate-800 transition-colors dark:bg-[#0b101b] dark:text-slate-100">
      <div className="mx-auto max-w-5xl w-full">
        {/* Header Title & Subtitle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-6 dark:border-slate-800/80">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              <Compass className="h-4 w-4" />
              <span>Cognaxis Reflection Practices</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Contemplative Guides & Prompts
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Curated guided inquiries to help you explore shadow boundaries, cognitive clarity, and
              emotional equilibrium.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search guides & themes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Featured Guides Bento Grid (Matching Reference Image 2) */}
        {!searchQuery && selectedCategory === "all" && (
          <div className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Recommended For You
              </h2>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {featuredGuides.map((guide) => (
                <div
                  key={guide.id}
                  onClick={() => onStartGuide(guide)}
                  className={`group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-linear-to-br ${guide.gradient} p-5 shadow-xs transition-all hover:-translate-y-1 hover:shadow-md dark:border-slate-700/60`}
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {guide.duration}
                      </span>
                      <span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold text-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                        {guide.category}
                      </span>
                    </div>

                    <h3 className="mt-3 text-base font-bold leading-snug text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                      {guide.title}
                    </h3>

                    <p className="mt-2 text-xs leading-relaxed text-slate-600 line-clamp-3 dark:text-slate-300">
                      {guide.subtitle}
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-900/10 pt-3 dark:border-white/10">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      by {guide.author}
                    </span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-700 shadow-xs group-hover:bg-sky-600 group-hover:text-white transition-all dark:bg-slate-800 dark:text-slate-200">
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collection Filter Chips */}
        <div className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Browse by Collection
          </h2>

          <div className="mt-3 flex flex-wrap gap-2">
            {GUIDE_COLLECTIONS.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => setSelectedCategory(col.id)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  selectedCategory === col.id
                    ? "bg-sky-600 text-white shadow-xs dark:bg-sky-500 dark:text-slate-950"
                    : "border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                <span>{col.icon}</span>
                <span>{col.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* All Filtered Guides List */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGuides.map((guide) => (
            <div
              key={guide.id}
              onClick={() => onStartGuide(guide)}
              className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs transition-all hover:border-sky-400 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/80 dark:hover:border-sky-500"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 font-medium">
                    <Clock className="h-3 w-3" />
                    {guide.duration}
                  </span>
                  <span className="font-semibold text-slate-500 dark:text-slate-400">
                    {guide.author}
                  </span>
                </div>

                <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                  {guide.title}
                </h3>

                <p className="mt-1.5 text-xs leading-relaxed text-slate-500 line-clamp-2 dark:text-slate-400">
                  {guide.subtitle}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  Start Reflection
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
