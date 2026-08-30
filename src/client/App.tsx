import { useState, useMemo } from "react";
import { MacNavSidebar, type NavSection } from "./components/MacNavSidebar";
import { TimelineColumn, type TimelineViewMode } from "./components/TimelineColumn";
import { MainEditorCanvas } from "./components/MainEditorCanvas";
import { GuidesView } from "./components/GuidesView";
import { CalendarView } from "./components/CalendarView";
import { MediaGalleryView } from "./components/MediaGalleryView";
import { BentoGridView } from "./components/BentoGridView";
import { AudioMemosView } from "./components/AudioMemosView";
import { SettingsModal } from "./components/SettingsModal";
import { ExportModal } from "./components/ExportModal";
import { mockStore } from "./lib/mockStore";
import type { JournalEntry } from "./data/mockData";
import type { GuideCard } from "./data/guidesData";

export function App() {
  const [entries, setEntries] = useState<JournalEntry[]>(() => mockStore.getEntries());
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(() => {
    const list = mockStore.getEntries();
    return list.length > 0 ? list[0].id : null;
  });

  const [activeSection, setActiveSection] = useState<NavSection>("all");
  const [viewMode, setViewMode] = useState<TimelineViewMode>("list");
  const [theme, setTheme] = useState<"light" | "dark">(() => mockStore.getTheme());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isAiBusy, setIsAiBusy] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Sync theme
  function handleToggleTheme() {
    const next = mockStore.toggleTheme();
    setTheme(next);
  }

  // Active selected entry object
  const selectedEntry = useMemo(() => {
    return entries.find((e) => e.id === selectedEntryId) || null;
  }, [entries, selectedEntryId]);

  // Filter entries based on activeSection
  const displayedEntries = useMemo(() => {
    if (activeSection === "trash") {
      return entries.filter((e) => e.folder === "Trash");
    }
    if (activeSection === "today") {
      const todayStr = new Date().toISOString().slice(0, 10);
      return entries.filter((e) => e.folder !== "Trash" && e.createdAt.startsWith(todayStr));
    }
    if (activeSection === "on-this-day") {
      return entries.filter((e) => e.folder !== "Trash");
    }
    return entries.filter((e) => e.folder !== "Trash");
  }, [entries, activeSection]);

  // Handlers for Entry CRUD
  function handleNewEntry() {
    const newEntry = mockStore.createEntry({
      title: "Untitled Reflection",
      body: "",
      location: "San Francisco, CA",
    });
    setEntries(mockStore.getEntries());
    setSelectedEntryId(newEntry.id);
    setActiveSection("all");
    setViewMode("list");
  }

  function handleUpdateEntry(updates: Partial<JournalEntry>) {
    if (!selectedEntryId) return;
    const updated = mockStore.updateEntry(selectedEntryId, updates);
    if (updated) {
      setEntries(mockStore.getEntries());
    }
  }

  function handleDeleteEntry(id: string) {
    mockStore.deleteEntry(id);
    const updatedList = mockStore.getEntries();
    setEntries(updatedList);
    if (selectedEntryId === id) {
      setSelectedEntryId(updatedList.length > 0 ? updatedList[0].id : null);
    }
  }

  function handleStartGuide(guide: GuideCard) {
    const newEntry = mockStore.createEntry({
      title: guide.title,
      body: `${guide.promptSeed}\n\n`,
      tags: ["Guide", guide.category.charAt(0).toUpperCase() + guide.category.slice(1)],
      mood: { label: "Inspired", emoji: "💡" },
      messages: [
        {
          id: `msg-${Date.now()}-guide`,
          role: "model",
          content: `Welcome to "${guide.title}". ${guide.initialQuestion}`,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setEntries(mockStore.getEntries());
    setSelectedEntryId(newEntry.id);
    setActiveSection("all");
    setViewMode("list");
  }

  function handleNewAudioReflection(title: string, transcript: string) {
    const newEntry = mockStore.createEntry({
      title,
      body: transcript,
      tags: ["VoiceMemo", "Audio"],
      mood: { label: "Reflective", emoji: "🎙️" },
    });
    setEntries(mockStore.getEntries());
    setSelectedEntryId(newEntry.id);
    setActiveSection("all");
    setViewMode("list");
  }

  function handleNewEntryForDate(date: Date) {
    const newEntry = mockStore.createEntry({
      title: `Reflection for ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      body: "",
      createdAt: date.toISOString(),
    });
    setEntries(mockStore.getEntries());
    setSelectedEntryId(newEntry.id);
    setActiveSection("all");
    setViewMode("list");
  }

  function handleSummarize(entryId: string) {
    setIsAiBusy(true);
    setTimeout(() => {
      mockStore.generateMemorySummary(entryId);
      setEntries(mockStore.getEntries());
      setIsAiBusy(false);
    }, 1000);
  }

  function handleSendMessage(entryId: string, message: string) {
    setIsAiBusy(true);
    setTimeout(() => {
      mockStore.addMessage(entryId, message);
      setEntries(mockStore.getEntries());
      setIsAiBusy(false);
    }, 900);
  }

  function handleResetMockData() {
    localStorage.removeItem("cognaxis_journal_entries_v2");
    const fresh = mockStore.getEntries();
    setEntries(fresh);
    if (fresh.length > 0) setSelectedEntryId(fresh[0].id);
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans text-slate-800 antialiased select-none dark:bg-[#090d16] dark:text-slate-100">
      {/* Column 1: macOS Navigation Sidebar */}
      <MacNavSidebar
        activeSection={activeSection}
        onSelectSection={(sec) => {
          setActiveSection(sec);
          if (sec === "all" || sec === "today" || sec === "on-this-day" || sec === "trash") {
            // keep view mode
          }
        }}
        entries={entries}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onNewEntry={handleNewEntry}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Content Area based on activeSection & viewMode */}
      {activeSection === "guides" ? (
        <GuidesView
          onStartGuide={handleStartGuide}
          onBackToJournal={() => setActiveSection("all")}
        />
      ) : activeSection === "gallery" ? (
        <MediaGalleryView
          entries={displayedEntries}
          onSelectEntry={(id) => {
            setSelectedEntryId(id);
            setActiveSection("all");
            setViewMode("list");
          }}
        />
      ) : viewMode === "calendar" ? (
        <CalendarView
          entries={displayedEntries}
          onSelectEntry={(id) => {
            setSelectedEntryId(id);
            setViewMode("list");
          }}
          onNewEntryForDate={handleNewEntryForDate}
        />
      ) : viewMode === "grid" ? (
        <BentoGridView
          entries={displayedEntries}
          onSelectEntry={(id) => {
            setSelectedEntryId(id);
            setViewMode("list");
          }}
          onNewEntry={handleNewEntry}
        />
      ) : viewMode === "audio" ? (
        <AudioMemosView
          entries={displayedEntries}
          onSelectEntry={(id) => {
            setSelectedEntryId(id);
            setViewMode("list");
          }}
          onNewAudioReflection={handleNewAudioReflection}
        />
      ) : (
        /* Standard 3-Column macOS Day One Layout */
        <>
          {/* Column 2: Timeline Column */}
          <TimelineColumn
            entries={displayedEntries}
            selectedEntryId={selectedEntryId}
            onSelectEntry={(id) => setSelectedEntryId(id)}
            onNewEntry={handleNewEntry}
            viewMode={viewMode}
            onChangeViewMode={(mode) => setViewMode(mode)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
          />

          {/* Column 3: Reading & Writing Canvas */}
          <MainEditorCanvas
            entry={selectedEntry}
            onUpdateEntry={handleUpdateEntry}
            onDeleteEntry={handleDeleteEntry}
            onSummarize={handleSummarize}
            onSendMessage={handleSendMessage}
            onExport={() => setIsExportOpen(true)}
            onOpenGuides={() => setActiveSection("guides")}
            isAiBusy={isAiBusy}
          />
        </>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onResetMockData={handleResetMockData}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        entry={selectedEntry}
        allEntries={displayedEntries}
      />
    </div>
  );
}

export default App;
