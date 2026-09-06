import { describe, expect, it } from "vitest";
import { isPlaceholderReflectionTitle, normalizeReflectionTitle } from "../../src/shared/reflection-title.js";

describe("reflection title generation", () => {
  it("keeps generated AI titles to five words or fewer", () => {
    expect(normalizeReflectionTitle("A detailed plan for launching the new product")).toBe("A detailed plan for launching");
    expect(normalizeReflectionTitle("  Weekly   priorities  ")).toBe("Weekly priorities");
    expect(normalizeReflectionTitle(undefined)).toBeNull();
  });

  it("recognizes current and legacy untouched placeholders", () => {
    expect(isPlaceholderReflectionTitle("New reflection")).toBe(true);
    expect(isPlaceholderReflectionTitle("New personal reflection")).toBe(true);
    expect(isPlaceholderReflectionTitle("My launch plan")).toBe(false);
    expect(isPlaceholderReflectionTitle("New shared reflection", true)).toBe(true);
    expect(isPlaceholderReflectionTitle("New team reflection", true)).toBe(true);
  });
});
