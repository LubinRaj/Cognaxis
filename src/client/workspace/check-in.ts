import { localDateOf } from "../../shared/dates.js";
import type {
  EmotionLabel,
  PersonalSignal,
  PersonalSignalLocation,
  UpsertSignalInput,
} from "../../shared/schemas.js";

export type Score = 1 | 2 | 3 | 4 | 5;

export const MOOD_LABELS: Record<Score, string> = {
  1: "Very low",
  2: "Low",
  3: "Okay",
  4: "Good",
  5: "Very good",
};

export const ENERGY_LABELS: Record<Score, string> = {
  1: "Very low",
  2: "Low",
  3: "Steady",
  4: "High",
  5: "Very high",
};

export const EMOTION_DISPLAY: Record<EmotionLabel, string> = {
  calm: "Calm",
  hopeful: "Hopeful",
  focused: "Focused",
  energized: "Energized",
  grateful: "Grateful",
  content: "Content",
  uncertain: "Uncertain",
  tired: "Tired",
  stressed: "Stressed",
  frustrated: "Frustrated",
  sad: "Sad",
  overwhelmed: "Overwhelmed",
};

export const MAX_EMOTIONS = 5;
export const MAX_NOTE_LENGTH = 280;

export type CheckInDraft = {
  moodScore: Score | null;
  energyScore: Score | null;
  emotions: EmotionLabel[];
  note: string;
  location: PersonalSignalLocation | null;
};

export function draftFromSignal(signal: PersonalSignal | null): CheckInDraft {
  if (!signal) {
    return { moodScore: null, energyScore: null, emotions: [], note: "", location: null };
  }
  return {
    moodScore: signal.moodScore,
    energyScore: signal.energyScore,
    emotions: [...signal.emotions],
    note: signal.note ?? "",
    location: signal.location ? { ...signal.location } : null,
  };
}

export function isDraftEmpty(draft: CheckInDraft): boolean {
  return (
    draft.moodScore === null &&
    draft.energyScore === null &&
    draft.emotions.length === 0 &&
    draft.note.trim() === "" &&
    draft.location === null
  );
}

export function toggleEmotion(emotions: EmotionLabel[], emotion: EmotionLabel): EmotionLabel[] {
  if (emotions.includes(emotion)) {
    return emotions.filter((entry) => entry !== emotion);
  }
  if (emotions.length >= MAX_EMOTIONS) {
    return emotions;
  }
  return [...emotions, emotion];
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function toUpsertInput(draft: CheckInDraft, now: Date = new Date()): UpsertSignalInput {
  const timezone = browserTimeZone();
  const note = draft.note.trim();
  return {
    moodScore: draft.moodScore,
    energyScore: draft.energyScore,
    emotions: draft.emotions,
    note: note === "" ? null : note,
    location: draft.location
      ? { ...draft.location, label: draft.location.label.trim() }
      : null,
    localDate: localDateOf(now, timezone),
    timezone,
  };
}
