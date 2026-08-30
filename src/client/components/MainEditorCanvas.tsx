import { useState, useRef, useEffect, type FormEvent } from "react";
import {
  Sparkles,
  Download,
  Trash2,
  MapPin,
  Image as ImageIcon,
  Send,
  MessageSquare,
  ChevronDown,
  Type,
  Check,
  Copy,
  X,
  Plus,
  Compass,
} from "lucide-react";
import type { JournalEntry, JournalMood } from "../data/mockData";

interface MainEditorCanvasProps {
  entry: JournalEntry | null;
  onUpdateEntry: (updates: Partial<JournalEntry>) => void;
  onDeleteEntry: (id: string) => void;
  onSummarize: (id: string) => void;
  onSendMessage: (entryId: string, message: string) => void;
  onExport: () => void;
  onOpenGuides: () => void;
  isAiBusy: boolean;
}

const AVAILABLE_MOODS: JournalMood[] = [
  { label: "Reflective", emoji: "✨" },
  { label: "Grateful", emoji: "🙏" },
  { label: "Peaceful", emoji: "🌿" },
  { label: "Inspired", emoji: "💡" },
  { label: "Philosophical", emoji: "🌊" },
  { label: "Focused", emoji: "🎯" },
  { label: "Affectionate", emoji: "🐱" },
  { label: "Amused", emoji: "🐋" },
];

const PRESET_PHOTOS = [
  {
    url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1200&q=80",
    caption: "Waves on the coastline",
  },
  {
    url: "https://images.unsplash.com/photo-1568430462989-44163eb1752f?auto=format&fit=crop&w=1200&q=80",
    caption: "Whale breaching the surface",
  },
  {
    url: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1200&q=80",
    caption: "Cat resting in cozy corner",
  },
  {
    url: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=1200&q=80",
    caption: "Golden hour morning light",
  },
  {
    url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
    caption: "Alpine lake reflection",
  },
];

const QUICK_REFLECTION_PROMPTS = [
  "What is the deeper emotional current beneath this thought?",
  "How does this connect with my long-term personal values?",
  "What would a wise mentor say about this situation?",
  "What is one assumption here that I should challenge?",
];

export function MainEditorCanvas({
  entry,
  onUpdateEntry,
  onDeleteEntry,
  onSummarize,
  onSendMessage,
  onExport,
  onOpenGuides,
  isAiBusy,
}: MainEditorCanvasProps) {
  const [fontStyle, setFontStyle] = useState<"serif" | "sans">("serif");
  const [showAiPartner, setShowAiPartner] = useState(true);
  const [showMoodMenu, setShowMoodMenu] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [reflectionInput, setReflectionInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 350)}px`;
    }
  }, [entry?.body, entry?.id]);

  if (!entry) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[#fafbfc] p-8 text-center dark:bg-[#0b101b]">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-500/10 text-sky-600 border border-sky-500/20 shadow-inner dark:bg-sky-500/20 dark:text-sky-300">
          <Compass className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
          Select or Create a Reflection
        </h2>
        <p className="mt-2 max-w-md text-xs sm:text-sm text-slate-500 leading-relaxed dark:text-slate-400">
          Choose a reflection from the timeline or explore curated meditation guides to begin writing with
          Cognaxis personal intelligence.
        </p>
        <button
          type="button"
          onClick={onOpenGuides}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-sky-500 transition-all dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
        >
          <Sparkles className="h-4 w-4" />
          <span>Explore Reflection Guides</span>
        </button>
      </div>
    );
  }

  const d = new Date(entry.createdAt);
  const formattedFullDate = `${d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

  function handleAddTag() {
    if (!newTagInput.trim() || !entry) return;
    const cleanTag = newTagInput.trim().replace(/^#/, "");
    if (!entry.tags.includes(cleanTag)) {
      onUpdateEntry({ tags: [...entry.tags, cleanTag] });
    }
    setNewTagInput("");
    setShowTagInput(false);
  }

  function handleRemoveTag(tagToRemove: string) {
    if (!entry) return;
    onUpdateEntry({ tags: entry.tags.filter((t) => t !== tagToRemove) });
  }

  function handleAddPhoto(preset: { url: string; caption: string }) {
    if (!entry) return;
    const currentCount = entry.photos?.length || 0;
    const newPhoto = {
      id: `photo-${entry.id}-${currentCount + 1}`,
      url: preset.url,
      caption: preset.caption,
    };
    onUpdateEntry({ photos: [...(entry.photos || []), newPhoto] });
    setShowPhotoPicker(false);
  }

  function handleRemovePhoto(photoId: string) {
    if (!entry) return;
    onUpdateEntry({ photos: entry.photos.filter((p) => p.id !== photoId) });
  }

  function handleSendReflection(e: FormEvent) {
    e.preventDefault();
    if (!reflectionInput.trim() || isAiBusy || !entry) return;
    onSendMessage(entry.id, reflectionInput.trim());
    setReflectionInput("");
  }

  async function handleCopyMessage(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-[#fafbfc] text-slate-800 transition-colors dark:bg-[#0b101b] dark:text-slate-100">
      {/* Top Breadcrumb & Actions Bar (Day One Apple style) */}
      <header className="flex h-13 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 sm:px-6 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#0e1626]/80">
        {/* Date & Time Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {formattedFullDate}
          </span>
          {entry.weather && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
              • {entry.weather.condition} {entry.weather.temp}
            </span>
          )}
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Typography Toggle: Serif vs Sans */}
          <button
            type="button"
            onClick={() => setFontStyle(fontStyle === "serif" ? "sans" : "serif")}
            title={`Current: ${fontStyle === "serif" ? "Serif (Editorial)" : "Sans (Modern)"}`}
            className="flex h-8 items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Type className="h-3.5 w-3.5" />
            <span className="text-[11px] uppercase tracking-wider">{fontStyle}</span>
          </button>

          {/* AI Summarize Button */}
          <button
            type="button"
            onClick={() => onSummarize(entry.id)}
            disabled={isAiBusy}
            title="Generate structured memory synthesis with Gemini"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-50/10 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300 transition-all disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Summarize</span>
          </button>

          {/* AI Partner Drawer Toggle */}
          <button
            type="button"
            onClick={() => setShowAiPartner(!showAiPartner)}
            title="Toggle Gemini Reflection Partner"
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all ${
              showAiPartner
                ? "bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950 shadow-xs"
                : "border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/80 dark:text-slate-300"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Partner</span>
            {entry.messages.length > 0 && (
              <span className="ml-0.5 rounded-full bg-black/20 dark:bg-white/20 px-1 py-0.2 text-[9px]">
                {entry.messages.length}
              </span>
            )}
          </button>

          {/* Export Button */}
          <button
            type="button"
            onClick={onExport}
            title="Export Reflection (Markdown, PDF, JSON)"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          {/* Delete Button */}
          <button
            type="button"
            onClick={() => onDeleteEntry(entry.id)}
            title="Delete this reflection"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200/80 bg-red-50/50 text-red-600 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Editor & AI Split View */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Writing Canvas */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-10 lg:px-14">
          <div className="mx-auto max-w-2xl">
            {/* Entry Title Input */}
            <input
              type="text"
              value={entry.title}
              onChange={(e) => onUpdateEntry({ title: e.target.value })}
              placeholder="Title of reflection..."
              className={`w-full border-0 bg-transparent text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white ${
                fontStyle === "serif" ? "font-serif-editor" : "font-sans-ui"
              }`}
            />

            {/* Metadata Tags & Mood Strip */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-slate-200/60 pb-3 text-xs dark:border-slate-800/60">
              {/* Mood Selector Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMoodMenu(!showMoodMenu)}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-300"
                >
                  <span>{entry.mood?.emoji || "✨"}</span>
                  <span>{entry.mood?.label || "Mood"}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>

                {showMoodMenu && (
                  <div className="absolute top-full left-0 z-30 mt-1 grid w-48 grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                    {AVAILABLE_MOODS.map((mood) => (
                      <button
                        key={mood.label}
                        type="button"
                        onClick={() => {
                          onUpdateEntry({ mood });
                          setShowMoodMenu(false);
                        }}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <span>{mood.emoji}</span>
                        <span>{mood.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Location Tag */}
              {entry.location && (
                <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100/80 dark:bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-200/60 dark:border-slate-700/60">
                  <MapPin className="h-3 w-3 text-slate-400" />
                  <span>{entry.location}</span>
                </div>
              )}

              {/* Tags List */}
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  className="group inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200/60 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-950/40 dark:border-sky-800/50 dark:text-sky-300"
                >
                  <span>#{tag}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="opacity-60 hover:opacity-100 text-sky-700 dark:text-sky-300"
                  >
                    ×
                  </button>
                </span>
              ))}

              {/* Add Tag Action */}
              {showTagInput ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                    placeholder="tag name..."
                    autoFocus
                    className="w-24 rounded-full border border-sky-400 bg-white px-2 py-0.5 text-xs text-slate-800 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTagInput(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400"
                >
                  <Plus className="h-2.5 w-2.5" /> Tag
                </button>
              )}

              {/* Add Photo Button */}
              <button
                type="button"
                onClick={() => setShowPhotoPicker(!showPhotoPicker)}
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-300"
              >
                <ImageIcon className="h-3 w-3 text-sky-500" />
                <span>Add Photo</span>
              </button>
            </div>

            {/* Photo Picker Drawer */}
            {showPhotoPicker && (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-md dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Select Curated Photo
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPhotoPicker(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {PRESET_PHOTOS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAddPhoto(preset)}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 hover:border-sky-500 dark:border-slate-700"
                    >
                      <img
                        src={preset.url}
                        alt=""
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                        referrerPolicy="no-referrer"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Attached Photos Gallery */}
            {entry.photos && entry.photos.length > 0 && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {entry.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption || "Journal attached photo"}
                      className="h-64 w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    {photo.caption && (
                      <div className="p-2.5 text-[11px] text-slate-600 bg-white/90 dark:bg-slate-900/90 dark:text-slate-300">
                        {photo.caption}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(photo.id)}
                      className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 hover:bg-black transition-all"
                      title="Remove Photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Main Editorial Body Textarea */}
            <div className="mt-4">
              <textarea
                ref={textareaRef}
                value={entry.body}
                onChange={(e) => onUpdateEntry({ body: e.target.value })}
                placeholder="Write your thoughts freely..."
                rows={12}
                className={`w-full resize-none border-0 bg-transparent text-base sm:text-lg leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-200 ${
                  fontStyle === "serif" ? "font-serif-editor" : "font-sans-ui"
                }`}
              />
            </div>

            {/* AI Synthesized Memory Summary Card */}
            {entry.memorySummary && (
              <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-50/50 p-4.5 backdrop-blur-xs dark:border-emerald-500/20 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-xs">
                  <Sparkles className="h-4 w-4" />
                  <span>Cognaxis Enduring Memory Synthesis</span>
                </div>

                <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {entry.memorySummary.summary}
                </p>

                {/* Key Themes Chips */}
                {entry.memorySummary.themes.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Core Themes:
                    </span>
                    {entry.memorySummary.themes.map((theme) => (
                      <span
                        key={theme}
                        className="rounded-full border border-emerald-400/40 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                )}

                {/* Next Steps Checklist */}
                {entry.memorySummary.nextSteps.length > 0 && (
                  <div className="mt-3 border-t border-emerald-500/20 pt-2.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Cognitive Intentions:
                    </span>
                    <ul className="mt-1.5 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                      {entry.memorySummary.nextSteps.map((step, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Gemini AI Reflection Partner Drawer (Right Column) */}
        {showAiPartner && (
          <aside className="flex w-80 sm:w-96 flex-col border-l border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800/80 dark:bg-[#0e1626]/95">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200/70 p-3.5 dark:border-slate-800/70">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Reflection Partner
                  </h4>
                  <span className="text-[10px] text-slate-400">Gemini Intelligence</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAiPartner(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Conversation Stream */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {entry.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 border border-sky-500/20 dark:bg-sky-500/20 dark:text-sky-300">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <h5 className="mt-3 text-xs font-bold text-slate-800 dark:text-slate-200">
                    Deepen Your Reflection
                  </h5>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Ask Gemini to unpack a difficult emotion, analyze trade-offs, or provide stoic
                    perspectives.
                  </p>

                  <div className="mt-4 w-full space-y-1.5 text-left">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">
                      Suggested prompts:
                    </span>
                    {QUICK_REFLECTION_PROMPTS.slice(0, 3).map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => onSendMessage(entry.id, prompt)}
                        className="w-full text-left rounded-xl border border-slate-200/80 bg-slate-50/80 p-2 text-[11px] text-slate-700 hover:border-sky-400 hover:bg-sky-50/50 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800 transition-all"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                entry.messages.map((msg) => {
                  const isUser = msg.role === "user";
                  return (
                    <div
                      key={msg.id}
                      className={`group flex flex-col ${isUser ? "items-end" : "items-start"}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[10px] font-semibold text-slate-400">
                          {isUser ? "You" : "Cognaxis"}
                        </span>
                        <span className="text-[9px] text-slate-400">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      <div
                        className={`relative rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                          isUser
                            ? "bg-sky-600 text-white rounded-tr-none shadow-xs dark:bg-sky-500 dark:text-slate-950 font-medium"
                            : "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/70 dark:bg-slate-800/90 dark:border-slate-700/70 dark:text-slate-200"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>

                        <button
                          type="button"
                          onClick={() => void handleCopyMessage(msg.id, msg.content)}
                          className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all"
                          title="Copy"
                        >
                          {copiedId === msg.id ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {/* AI Thinking Animation */}
              {isAiBusy && (
                <div className="flex items-center gap-2 rounded-2xl bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <div className="flex space-x-1">
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.3s]" />
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.15s]" />
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500" />
                  </div>
                  <span className="text-[11px] font-medium">Synthesizing reflection...</span>
                </div>
              )}
            </div>

            {/* Reflection Composer */}
            <form
              onSubmit={handleSendReflection}
              className="border-t border-slate-200/80 p-3 dark:border-slate-800/80"
            >
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={reflectionInput}
                  onChange={(e) => setReflectionInput(e.target.value)}
                  placeholder="Ask Gemini about this journal..."
                  disabled={isAiBusy}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-9 text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-900"
                />
                <button
                  type="submit"
                  disabled={!reflectionInput.trim() || isAiBusy}
                  className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-sky-600 text-white disabled:opacity-40 hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950 transition-all"
                >
                  <Send className="h-3 w-3" />
                </button>
              </div>
            </form>
          </aside>
        )}
      </div>
    </main>
  );
}
