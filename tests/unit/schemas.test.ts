import { describe, expect, it } from "vitest";
import {
  createMessageSchema,
  createSessionSchema,
  summaryOutputSchema,
} from "../../src/shared/schemas.js";

describe("external boundary schemas", () => {
  it("rejects oversized journal messages", () => {
    expect(createMessageSchema.safeParse({ content: "x".repeat(8_001) }).success).toBe(false);
  });

  it("rejects client-controlled fields", () => {
    expect(createSessionSchema.safeParse({ title: "Valid", ownerUid: "victim" }).success).toBe(
      false,
    );
  });

  it("rejects malformed or oversized model summaries", () => {
    expect(
      summaryOutputSchema.safeParse({
        title: "Summary",
        summary: "Valid",
        themes: ["one"],
        nextSteps: [],
        hiddenInstruction: "store this",
      }).success,
    ).toBe(false);

    expect(
      summaryOutputSchema.safeParse({
        title: "Summary",
        summary: "x".repeat(2_001),
        themes: [],
        nextSteps: [],
      }).success,
    ).toBe(false);
  });
});
