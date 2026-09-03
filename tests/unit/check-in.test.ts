import { describe, expect, it } from "vitest";
import type { PersonalSignal } from "../../src/shared/schemas.js";
import {
  draftFromSignal,
  isDraftEmpty,
  toUpsertInput,
  toggleEmotion,
} from "../../src/client/workspace/check-in.js";

const signal: PersonalSignal = {
  sourceSessionId: "s1",
  moodScore: 4,
  energyScore: null,
  emotions: ["calm", "tired"],
  note: "A note.",
  location: {
    placeId: null,
    label: "Park",
    latitude: 10,
    longitude: 20,
    precision: "approximate",
  },
  localDate: "2026-09-01",
  timezone: "UTC",
  capturedAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  createdBy: "user_alpha",
  scopeType: "personal",
  scopeId: "user_alpha",
  schemaVersion: 1,
};

describe("check-in draft", () => {
  it("builds an editable draft from a stored signal", () => {
    const draft = draftFromSignal(signal);
    expect(draft).toEqual({
      moodScore: 4,
      energyScore: null,
      emotions: ["calm", "tired"],
      note: "A note.",
      location: signal.location,
    });
    expect(isDraftEmpty(draft)).toBe(false);
  });

  it("recognizes an empty draft, ignoring whitespace notes", () => {
    expect(isDraftEmpty(draftFromSignal(null))).toBe(true);
    expect(
      isDraftEmpty({ moodScore: null, energyScore: null, emotions: [], note: "  ", location: null }),
    ).toBe(true);
  });

  it("toggles emotions and enforces the maximum of five", () => {
    let emotions = toggleEmotion([], "calm");
    expect(emotions).toEqual(["calm"]);
    emotions = toggleEmotion(emotions, "calm");
    expect(emotions).toEqual([]);

    const five = toggleEmotion(
      ["calm", "hopeful", "focused", "energized", "grateful"],
      "content",
    );
    expect(five).toHaveLength(5);
    expect(five).not.toContain("content");
  });

  it("produces a strict upsert body with a browser-derived local date", () => {
    const input = toUpsertInput(draftFromSignal(signal), new Date("2026-09-03T10:00:00.000Z"));
    expect(input.moodScore).toBe(4);
    expect(input.note).toBe("A note.");
    expect(input.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof input.timezone).toBe("string");
    expect(Object.keys(input).sort()).toEqual([
      "emotions",
      "energyScore",
      "localDate",
      "location",
      "moodScore",
      "note",
      "timezone",
    ]);
  });

  it("sends a blank note as null", () => {
    const input = toUpsertInput({ ...draftFromSignal(null), note: "   " });
    expect(input.note).toBeNull();
  });
});
