import { INITIAL_MOCK_ENTRIES, type JournalEntry, type JournalMessage, type MemorySummary } from "../data/mockData";

const STORAGE_KEY = "cognaxis_journal_entries_v2";
const THEME_KEY = "cognaxis_theme_mode";

export class MockJournalStore {
  private entries: JournalEntry[];
  private theme: "light" | "dark";

  constructor() {
    this.entries = this.loadEntries();
    this.theme = this.loadTheme();
    this.applyTheme(this.theme);
  }

  private loadEntries(): JournalEntry[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as JournalEntry[];
      }
    } catch {
      // Fallback
    }
    return INITIAL_MOCK_ENTRIES;
  }

  private saveEntries() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // Ignore
    }
  }

  private loadTheme(): "light" | "dark" {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "light" || stored === "dark") return stored;
    } catch {
      // Ignore
    }
    return "light"; // Default to high-craft light mode as requested!
  }

  public getTheme(): "light" | "dark" {
    return this.theme;
  }

  public setTheme(mode: "light" | "dark") {
    this.theme = mode;
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Ignore
    }
    this.applyTheme(mode);
  }

  public toggleTheme(): "light" | "dark" {
    const next = this.theme === "light" ? "dark" : "light";
    this.setTheme(next);
    return next;
  }

  private applyTheme(mode: "light" | "dark") {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      if (mode === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  }

  public getEntries(): JournalEntry[] {
    return [...this.entries];
  }

  public getEntry(id: string): JournalEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  public createEntry(initialData?: Partial<JournalEntry>): JournalEntry {
    const now = new Date();
    const newEntry: JournalEntry = {
      id: `entry-${Date.now()}`,
      title: initialData?.title || "Untitled Reflection",
      body: initialData?.body || "",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      location: initialData?.location || "San Francisco, CA",
      weather: initialData?.weather || {
        temp: "64°F",
        condition: "Clear Sky",
        icon: "sun",
      },
      photos: initialData?.photos || [],
      tags: initialData?.tags || ["Journal"],
      mood: initialData?.mood || {
        label: "Reflective",
        emoji: "✨",
      },
      folder: "Journal",
      messages: initialData?.messages || [],
      memorySummary: initialData?.memorySummary,
      isPinned: false,
      isFavorite: false,
      ...initialData,
    };

    this.entries.unshift(newEntry);
    this.saveEntries();
    return newEntry;
  }

  public updateEntry(id: string, updates: Partial<JournalEntry>): JournalEntry | undefined {
    const index = this.entries.findIndex((e) => e.id === id);
    if (index === -1) return undefined;

    this.entries[index] = {
      ...this.entries[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.saveEntries();
    return this.entries[index];
  }

  public deleteEntry(id: string): boolean {
    const prevLen = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    this.saveEntries();
    return this.entries.length < prevLen;
  }

  public addMessage(
    entryId: string,
    content: string
  ): { userMessage: JournalMessage; assistantMessage: JournalMessage } {
    const entry = this.getEntry(entryId);
    if (!entry) throw new Error("Entry not found");

    const now = new Date();
    const userMessage: JournalMessage = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content,
      createdAt: now.toISOString(),
    };

    // Synthesize contextual AI response based on content and title
    const aiResponseText = this.generateSimulatedAiResponse(content, entry);

    const assistantMessage: JournalMessage = {
      id: `msg-${Date.now() + 1}-model`,
      role: "model",
      content: aiResponseText,
      createdAt: new Date(now.getTime() + 600).toISOString(),
    };

    entry.messages = [...entry.messages, userMessage, assistantMessage];
    this.updateEntry(entryId, { messages: entry.messages });

    return { userMessage, assistantMessage };
  }

  public generateMemorySummary(entryId: string): MemorySummary {
    const entry = this.getEntry(entryId);
    if (!entry) throw new Error("Entry not found");

    const derivedThemes = this.extractThemes(entry);
    const summary: MemorySummary = {
      title: `${entry.title || "Reflection"} — Core Insight`,
      summary: `In this entry, the writer explored themes around ${derivedThemes.slice(0, 2).join(" and ")}. The reflection highlights the value of stepping back to recalibrate internal perspective, honoring quiet moments of clarity, and maintaining emotional autonomy.`,
      themes: derivedThemes,
      nextSteps: [
        `Revisit the insight on "${derivedThemes[0] || "intentional presence"}" during tomorrow's morning routine`,
        "Preserve a 15-minute unstructured reflection block before deep work",
      ],
    };

    this.updateEntry(entryId, { memorySummary: summary });
    return summary;
  }

  private extractThemes(entry: JournalEntry): string[] {
    const base = ["Intention", "Clarity", "Perspective"];
    if (entry.tags && entry.tags.length > 0) {
      return [...entry.tags, ...base].slice(0, 4);
    }
    return base;
  }

  private generateSimulatedAiResponse(userInput: string, entry: JournalEntry): string {
    const lower = userInput.toLowerCase();

    if (lower.includes("why") || lower.includes("question") || lower.includes("curious")) {
      return `When exploring "${entry.title}", notice the relationship between what you are holding onto and what is ready to be released. In contemplative journaling, asking 'What is this situation teaching me about my core boundary?' usually reveals the path forward.`;
    }

    if (lower.includes("stress") || lower.includes("tired") || lower.includes("overwhelm")) {
      return `Physical and cognitive fatigue are biological signals rather than character shortcomings. As you noted in your entry, taking a moment to disconnect from external demands allows your autonomic nervous system to downregulate. What is the single gentlest action you can take right now?`;
    }

    if (lower.includes("grateful") || lower.includes("gratitude") || lower.includes("thankful")) {
      return `Gratitude acts as an active cognitive reframing mechanism. By noticing the micro-blessings—the sensory warmth, small gestures, or quiet spaces—you anchor your nervous system in safety and resilience.`;
    }

    return `This insight deepens the theme of "${entry.title}". By articulating this thought in your private vault, you transition reactive emotional energy into structured cognitive clarity. Notice how giving this thought space to breathe changes how urgent it feels.`;
  }
}

export const mockStore = new MockJournalStore();
