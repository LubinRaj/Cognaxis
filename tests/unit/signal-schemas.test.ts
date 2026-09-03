import { describe, expect, it } from "vitest";
import { updatePreferencesSchema, upsertSignalSchema } from "../../src/shared/schemas.js";

const validSignal = {
  moodScore: 4,
  energyScore: 2,
  emotions: ["calm", "focused"],
  note: "A short synthetic note.",
  location: {
    placeId: null,
    label: "Neighborhood park",
    latitude: 12.9716,
    longitude: 77.5946,
    precision: "approximate",
  },
  localDate: "2026-09-03",
  timezone: "Asia/Kolkata",
};

describe("signal upsert schema", () => {
  it("accepts a complete valid check-in", () => {
    const parsed = upsertSignalSchema.parse(validSignal);
    expect(parsed.moodScore).toBe(4);
    expect(parsed.emotions).toEqual(["calm", "focused"]);
  });

  it("accepts an all-empty body, which the service treats as removal", () => {
    const parsed = upsertSignalSchema.parse({
      moodScore: null,
      energyScore: null,
      emotions: [],
      note: null,
      location: null,
      localDate: "2026-09-03",
      timezone: "UTC",
    });
    expect(parsed.moodScore).toBeNull();
  });

  it("rejects scores outside one to five and non-integers", () => {
    for (const moodScore of [0, 6, 2.5, "4", true]) {
      expect(upsertSignalSchema.safeParse({ ...validSignal, moodScore }).success).toBe(false);
    }
  });

  it("rejects unknown emotions, duplicates, and more than five", () => {
    expect(
      upsertSignalSchema.safeParse({ ...validSignal, emotions: ["thrilled"] }).success,
    ).toBe(false);
    expect(
      upsertSignalSchema.safeParse({ ...validSignal, emotions: ["calm", "calm"] }).success,
    ).toBe(false);
    expect(
      upsertSignalSchema.safeParse({
        ...validSignal,
        emotions: ["calm", "hopeful", "focused", "energized", "grateful", "content"],
      }).success,
    ).toBe(false);
  });

  it("bounds the note and treats a blank note as absent", () => {
    expect(
      upsertSignalSchema.safeParse({ ...validSignal, note: "a".repeat(281) }).success,
    ).toBe(false);
    const parsed = upsertSignalSchema.parse({ ...validSignal, note: "   " });
    expect(parsed.note).toBeNull();
  });

  it("rejects out-of-range coordinates and blank labels", () => {
    for (const location of [
      { ...validSignal.location, latitude: 91 },
      { ...validSignal.location, latitude: -91 },
      { ...validSignal.location, longitude: 181 },
      { ...validSignal.location, label: "   " },
      { ...validSignal.location, label: "x".repeat(161) },
      { ...validSignal.location, precision: "vague" },
    ]) {
      expect(upsertSignalSchema.safeParse({ ...validSignal, location }).success).toBe(false);
    }
  });

  it("rejects invalid calendar dates and timezones", () => {
    expect(
      upsertSignalSchema.safeParse({ ...validSignal, localDate: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      upsertSignalSchema.safeParse({ ...validSignal, timezone: "Mars/Olympus" }).success,
    ).toBe(false);
  });

  it("rejects server-controlled and unknown fields", () => {
    for (const extra of [
      { uid: "user_victim" },
      { createdBy: "user_victim" },
      { scopeId: "user_victim" },
      { capturedAt: "2026-01-01T00:00:00.000Z" },
      { schemaVersion: 2 },
      { anything: true },
    ]) {
      expect(upsertSignalSchema.safeParse({ ...validSignal, ...extra }).success).toBe(false);
    }
  });

  it("rejects unknown fields inside the location object", () => {
    expect(
      upsertSignalSchema.safeParse({
        ...validSignal,
        location: { ...validSignal.location, accuracyMeters: 5 },
      }).success,
    ).toBe(false);
  });
});

describe("preferences schema", () => {
  it("accepts a valid preference document", () => {
    const parsed = updatePreferencesSchema.parse({
      timezone: "Asia/Kolkata",
      weekStartsOn: "monday",
      insightRangeDays: 30,
    });
    expect(parsed.timezone).toBe("Asia/Kolkata");
  });

  it("rejects invalid timezones, week starts, and ranges", () => {
    expect(
      updatePreferencesSchema.safeParse({
        timezone: "Not/AZone",
        weekStartsOn: "monday",
        insightRangeDays: 7,
      }).success,
    ).toBe(false);
    expect(
      updatePreferencesSchema.safeParse({
        timezone: "UTC",
        weekStartsOn: "sunday",
        insightRangeDays: 7,
      }).success,
    ).toBe(false);
    expect(
      updatePreferencesSchema.safeParse({
        timezone: "UTC",
        weekStartsOn: "monday",
        insightRangeDays: 14,
      }).success,
    ).toBe(false);
  });
});
