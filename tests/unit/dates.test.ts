import { describe, expect, it } from "vitest";
import {
  addDays,
  enumerateDays,
  isValidLocalDate,
  isValidTimeZone,
  localDateOf,
} from "../../src/shared/dates.js";

describe("timezone validation", () => {
  it("accepts real IANA timezones", () => {
    for (const zone of ["UTC", "Asia/Kolkata", "America/New_York", "Pacific/Chatham"]) {
      expect(isValidTimeZone(zone)).toBe(true);
    }
  });

  it("rejects invalid or dangerous values", () => {
    for (const zone of ["", "Mars/Olympus", "GMT+25", "../../etc", "Etc/GMT+99"]) {
      expect(isValidTimeZone(zone)).toBe(false);
    }
  });
});

describe("local date derivation", () => {
  it("derives the calendar date in the requested timezone", () => {
    const instant = new Date("2026-09-03T22:30:00.000Z");
    expect(localDateOf(instant, "UTC")).toBe("2026-09-03");
    expect(localDateOf(instant, "Asia/Kolkata")).toBe("2026-09-04");
    expect(localDateOf(instant, "America/Los_Angeles")).toBe("2026-09-03");
  });

  it("handles half-hour offset timezones", () => {
    const instant = new Date("2026-01-01T18:45:00.000Z");
    expect(localDateOf(instant, "Asia/Kolkata")).toBe("2026-01-02");
  });

  it("handles the year boundary", () => {
    const instant = new Date("2026-01-01T02:00:00.000Z");
    expect(localDateOf(instant, "America/New_York")).toBe("2025-12-31");
  });
});

describe("local date arithmetic", () => {
  it("validates calendar dates strictly", () => {
    expect(isValidLocalDate("2026-09-03")).toBe(true);
    expect(isValidLocalDate("2024-02-29")).toBe(true);
    expect(isValidLocalDate("2026-02-29")).toBe(false);
    expect(isValidLocalDate("2026-13-01")).toBe(false);
    expect(isValidLocalDate("2026-00-10")).toBe(false);
    expect(isValidLocalDate("26-01-01")).toBe(false);
    expect(isValidLocalDate("2026-9-3")).toBe(false);
    expect(isValidLocalDate("2026-09-31")).toBe(false);
  });

  it("adds and subtracts days across month and year boundaries", () => {
    expect(addDays("2026-09-03", 1)).toBe("2026-09-04");
    expect(addDays("2026-09-03", -3)).toBe("2026-08-31");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-01-05", -10)).toBe("2025-12-26");
  });

  it("enumerates every day of an inclusive range in order", () => {
    expect(enumerateDays("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
    expect(enumerateDays("2026-09-02", "2026-09-02")).toEqual(["2026-09-02"]);
    expect(enumerateDays("2026-09-03", "2026-09-02")).toEqual([]);
  });
});
