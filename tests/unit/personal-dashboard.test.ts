import { describe, expect, it } from "vitest";
import type { PersonalSignal } from "../../src/shared/schemas.js";
import { computeDashboard } from "../../src/server/services/personal-dashboard.js";

function signal(overrides: Partial<PersonalSignal> & { localDate: string }): PersonalSignal {
  return {
    sourceSessionId: `session-${overrides.localDate}-${String(overrides.moodScore ?? "x")}`,
    moodScore: null,
    energyScore: null,
    emotions: [],
    note: null,
    location: null,
    timezone: "UTC",
    capturedAt: `${overrides.localDate}T10:00:00.000Z`,
    updatedAt: `${overrides.localDate}T10:00:00.000Z`,
    createdBy: "user_alpha",
    scopeType: "personal",
    scopeId: "user_alpha",
    schemaVersion: 1,
    ...overrides,
  };
}

const BASE = {
  rangeDays: 7 as const,
  timezone: "UTC",
  today: "2026-09-03",
  signals: [] as PersonalSignal[],
  previousSignals: [] as PersonalSignal[],
  sessionCreationTimes: [] as string[],
};

describe("deterministic personal dashboard", () => {
  it("derives the inclusive window from the range and local today", () => {
    const dashboard = computeDashboard(BASE);
    expect(dashboard.from).toBe("2026-08-28");
    expect(dashboard.to).toBe("2026-09-03");
    expect(dashboard.trend).toHaveLength(7);
    expect(dashboard.trend[0]?.date).toBe("2026-08-28");
    expect(dashboard.trend[6]?.date).toBe("2026-09-03");
  });

  it("averages self-reported scores to one decimal place", () => {
    const dashboard = computeDashboard({
      ...BASE,
      signals: [
        signal({ localDate: "2026-09-01", moodScore: 4, energyScore: 2 }),
        signal({ localDate: "2026-09-02", moodScore: 3, energyScore: 5 }),
        signal({ localDate: "2026-09-03", moodScore: 3 }),
      ],
    });
    expect(dashboard.moodAverage).toBe(3.3);
    expect(dashboard.energyAverage).toBe(3.5);
    expect(dashboard.checkinCount).toBe(3);
  });

  it("never treats a missing score as a value", () => {
    const dashboard = computeDashboard({
      ...BASE,
      signals: [
        signal({ localDate: "2026-09-01", emotions: ["calm"] }),
        signal({ localDate: "2026-09-02", moodScore: 5 }),
      ],
    });
    expect(dashboard.moodAverage).toBe(5);
    expect(dashboard.energyAverage).toBeNull();
    const day1 = dashboard.trend.find((point) => point.date === "2026-09-01");
    expect(day1).toEqual({ date: "2026-09-01", mood: null, energy: null });
  });

  it("leaves days without check-ins as gaps rather than zeros", () => {
    const dashboard = computeDashboard({
      ...BASE,
      signals: [signal({ localDate: "2026-09-02", moodScore: 2, energyScore: 2 })],
    });
    const values = dashboard.trend.map((point) => point.mood);
    expect(values.filter((value) => value === null)).toHaveLength(6);
    expect(values).not.toContain(0);
  });

  it("uses the arithmetic mean when multiple reflections share a day", () => {
    const dashboard = computeDashboard({
      ...BASE,
      signals: [
        signal({ localDate: "2026-09-02", moodScore: 2, sourceSessionId: "a" }),
        signal({ localDate: "2026-09-02", moodScore: 5, sourceSessionId: "b" }),
      ],
    });
    const day = dashboard.trend.find((point) => point.date === "2026-09-02");
    expect(day?.mood).toBe(3.5);
  });

  it("compares with the previous window only when both have data", () => {
    const withBoth = computeDashboard({
      ...BASE,
      signals: [signal({ localDate: "2026-09-01", moodScore: 4 })],
      previousSignals: [signal({ localDate: "2026-08-25", moodScore: 3 })],
    });
    expect(withBoth.moodDeltaFromPrevious).toBe(1);
    expect(withBoth.energyDeltaFromPrevious).toBeNull();

    const withoutPrevious = computeDashboard({
      ...BASE,
      signals: [signal({ localDate: "2026-09-01", moodScore: 4 })],
    });
    expect(withoutPrevious.moodDeltaFromPrevious).toBeNull();
  });

  it("counts score distributions and top emotions from self-reports only", () => {
    const dashboard = computeDashboard({
      ...BASE,
      signals: [
        signal({ localDate: "2026-09-01", moodScore: 4, emotions: ["calm", "focused"] }),
        signal({ localDate: "2026-09-02", moodScore: 4, emotions: ["calm"] }),
        signal({ localDate: "2026-09-03", moodScore: 1, emotions: ["tired"] }),
      ],
    });
    expect(dashboard.moodDistribution).toEqual({ 1: 1, 2: 0, 3: 0, 4: 2, 5: 0 });
    expect(dashboard.topEmotions).toEqual([
      { emotion: "calm", count: 2 },
      { emotion: "focused", count: 1 },
      { emotion: "tired", count: 1 },
    ]);
  });

  it("computes reflection count and coverage from the session creation times", () => {
    const dashboard = computeDashboard({
      ...BASE,
      timezone: "Asia/Kolkata",
      signals: [signal({ localDate: "2026-09-01", moodScore: 3 })],
      sessionCreationTimes: [
        // 20:00 UTC on 28 August is already 29 August in Kolkata, inside the window.
        "2026-08-28T20:00:00.000Z",
        "2026-09-01T05:00:00.000Z",
        // Before the window starts.
        "2026-08-20T05:00:00.000Z",
      ],
    });
    expect(dashboard.reflectionCount).toBe(2);
    expect(dashboard.coverage).toBe(0.5);
  });

  it("reports null coverage when there are no reflections", () => {
    const dashboard = computeDashboard(BASE);
    expect(dashboard.reflectionCount).toBe(0);
    expect(dashboard.coverage).toBeNull();
  });

  it("counts located reflections and flags sparse data", () => {
    const dashboard = computeDashboard({
      ...BASE,
      signals: [
        signal({
          localDate: "2026-09-01",
          moodScore: 3,
          location: {
            placeId: null,
            label: "Park",
            latitude: 10,
            longitude: 10,
            precision: "approximate",
          },
        }),
        signal({ localDate: "2026-09-02", moodScore: 4 }),
      ],
    });
    expect(dashboard.locatedCount).toBe(1);
    expect(dashboard.hasEnoughForTrend).toBe(false);
  });
});
