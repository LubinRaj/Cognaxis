import { describe, expect, it } from "vitest";
import {
  isoWeekOf,
  isoWeekStart,
  parsePeriodKey,
  periodBoundaries,
  periodKeyFor,
} from "../../src/shared/periods.js";

describe("ISO week calculation", () => {
  it("matches known ISO week values including year transitions", () => {
    expect(isoWeekOf("2026-09-03")).toEqual({ isoYear: 2026, isoWeek: 36 });
    expect(isoWeekOf("2026-01-01")).toEqual({ isoYear: 2026, isoWeek: 1 });
    expect(isoWeekOf("2024-12-30")).toEqual({ isoYear: 2025, isoWeek: 1 });
    expect(isoWeekOf("2025-12-28")).toEqual({ isoYear: 2025, isoWeek: 52 });
    expect(isoWeekOf("2027-01-01")).toEqual({ isoYear: 2026, isoWeek: 53 });
    expect(isoWeekOf("2021-01-01")).toEqual({ isoYear: 2020, isoWeek: 53 });
  });

  it("returns the Monday a week starts on", () => {
    expect(isoWeekStart(2026, 36)).toBe("2026-08-31");
    expect(isoWeekStart(2025, 1)).toBe("2024-12-30");
    expect(isoWeekStart(2026, 53)).toBe("2026-12-28");
  });
});

describe("period keys", () => {
  it("builds day and week keys from a local date", () => {
    expect(periodKeyFor("day", "2026-09-03")).toBe("day_2026-09-03");
    expect(periodKeyFor("week", "2026-09-03")).toBe("week_2026-W36");
    expect(periodKeyFor("week", "2024-12-30")).toBe("week_2025-W01");
  });

  it("parses only well-formed keys", () => {
    expect(parsePeriodKey("day_2026-09-03")).toEqual({ type: "day", localDate: "2026-09-03" });
    expect(parsePeriodKey("week_2026-W36")).toEqual({ type: "week", isoYear: 2026, isoWeek: 36 });

    for (const key of [
      "day_2026-02-30",
      "day_2026-9-3",
      "week_2026-W00",
      "week_2026-W54",
      "week_2025-W53",
      "month_2026-09",
      "day_2026-09-03T00:00",
      "",
      "week_2026-w36",
    ]) {
      expect(parsePeriodKey(key)).toBeNull();
    }
  });

  it("accepts week 53 only in long ISO years", () => {
    expect(parsePeriodKey("week_2026-W53")).toEqual({ type: "week", isoYear: 2026, isoWeek: 53 });
    expect(parsePeriodKey("week_2020-W53")).toEqual({ type: "week", isoYear: 2020, isoWeek: 53 });
    expect(parsePeriodKey("week_2025-W53")).toBeNull();
  });
});

describe("period boundaries", () => {
  it("bounds a day period to a single local date", () => {
    expect(periodBoundaries("day_2026-09-03")).toEqual({
      type: "day",
      fromLocalDate: "2026-09-03",
      toLocalDate: "2026-09-03",
    });
  });

  it("bounds a week period from Monday to Sunday", () => {
    expect(periodBoundaries("week_2026-W36")).toEqual({
      type: "week",
      fromLocalDate: "2026-08-31",
      toLocalDate: "2026-09-06",
    });
  });

  it("returns null for an invalid key", () => {
    expect(periodBoundaries("week_2025-W53")).toBeNull();
  });
});
